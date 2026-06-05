"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import neo4j, { type Driver } from "neo4j-driver";
import { verifyPrescriptionSafetyQuery } from "@/code";
import { loadMedicationCatalogFromCsv, type MedicationCatalogItem } from "@/lib/medicine-catalog";
import { buildMedicationQueryCandidates } from "@/lib/medication-query";
import { resolveNeo4jPatientGraphId } from "@/lib/neo4j-patient-id";
import { uploadVisitSummaryPdfToCloudinary } from "@/lib/cloudinary";
import { buildVisitSummaryFilename, formatVisitSummaryDateLabel } from "@/lib/visit-summary-pdf";
import { renderNoteDocumentPdfBuffer } from "@/lib/note-document-pdf";
import { markSoapNoteAsFinalized } from "@/lib/visit-summary";
import { mapRecordToSoapTemplate } from "@/lib/template-utils";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

const NEO4J_URI = process.env.NEO4J_URI?.trim() ?? "";
const NEO4J_USERNAME = process.env.NEO4J_USERNAME?.trim() ?? "";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "";
const NEO4J_DATABASE = process.env.NEO4J_DATABASE?.trim() || undefined;

let neo4jDriverSingleton: Driver | null = null;

function isLikelyClerkUserId(value: string | null | undefined): value is string {
  if (!value) return false;
  return value.startsWith("user_");
}

async function getCurrentDoctor() {
  const user = await currentUser();
  if (!user) {
    return null;
  }

  const doctor = await prisma.doctorProfile.findFirst({
    where: {
      user: {
        clerkId: user.id,
      },
    },
  });

  if (!doctor) {
    return null;
  }

  return doctor;
}

function hasTranscriptContent(rawTranscript: unknown): boolean {
  if (Array.isArray(rawTranscript)) {
    return rawTranscript.some((segment) => {
      if (!segment || typeof segment !== "object") {
        return false;
      }

      const text = (segment as { text?: unknown }).text;
      return typeof text === "string" && text.trim().length > 0;
    });
  }

  if (typeof rawTranscript === "string") {
    return rawTranscript.trim().length > 0;
  }

  return false;
}

function hasGeneratedNote(rawSoapNote: unknown): boolean {
  if (!rawSoapNote || typeof rawSoapNote !== "object" || Array.isArray(rawSoapNote)) {
    return false;
  }

  const payload = rawSoapNote as {
    noteText?: unknown;
    noteData?: unknown;
    subjective?: unknown;
    objective?: unknown;
    assessment?: unknown;
    plan?: unknown;
  };

  if (typeof payload.noteText === "string" && payload.noteText.trim().length > 0) {
    return true;
  }

  if (payload.noteData && typeof payload.noteData === "object" && !Array.isArray(payload.noteData)) {
    return Object.values(payload.noteData as Record<string, unknown>).some((value) => {
      if (typeof value === "string") {
        return value.trim().length > 0;
      }

      if (typeof value === "number") {
        return true;
      }

      if (typeof value === "boolean") {
        return value;
      }

      return false;
    });
  }

  return [payload.subjective, payload.objective, payload.assessment, payload.plan].some(
    (section) => typeof section === "string" && section.trim().length > 0,
  );
}

type Neo4jQueryRow = Record<string, unknown>;

function getNeo4jDriverOrError(): { driver: Driver | null; error?: string } {
  if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
    const missing = [
      !NEO4J_URI && "NEO4J_URI",
      !NEO4J_USERNAME && "NEO4J_USERNAME",
      !NEO4J_PASSWORD && "NEO4J_PASSWORD",
    ]
      .filter(Boolean)
      .join(", ");

    return {
      driver: null,
      error: `Neo4j is not configured. Missing: ${missing}.`,
    };
  }

  if (!neo4jDriverSingleton) {
    neo4jDriverSingleton = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
      { disableLosslessIntegers: true },
    );
  }

  return { driver: neo4jDriverSingleton };
}

async function runNeo4jReadQuery(
  query: string,
  params: Record<string, unknown>,
): Promise<{ ok: true; rows: Neo4jQueryRow[] } | { ok: false; error: string }> {
  const { driver, error } = getNeo4jDriverOrError();
  if (!driver) {
    return {
      ok: false,
      error: error ?? "Neo4j driver is not available.",
    };
  }

  const session = driver.session(
    NEO4J_DATABASE
      ? {
          defaultAccessMode: neo4j.session.READ,
          database: NEO4J_DATABASE,
        }
      : {
          defaultAccessMode: neo4j.session.READ,
        },
  );

  try {
    const result = await session.executeRead((tx: any) => tx.run(query, params));
    const rows: Neo4jQueryRow[] = result.records.map((record: any) => {
      const row: Neo4jQueryRow = {};
      for (const key of record.keys) {
        row[key] = record.get(key);
      }
      return row;
    });

    return { ok: true, rows };
  } catch (queryError) {
    return {
      ok: false,
      error: queryError instanceof Error ? queryError.message : "Neo4j query failed.",
    };
  } finally {
    await session.close();
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    .filter((item) => item.length > 0);
}

export type FinalizeChecklist = {
  patientLinked: boolean;
  transcriptReady: boolean;
  noteReady: boolean;
  medicationPrescribed: boolean;
};

export type FinalizeTaskKey = keyof FinalizeChecklist;

export type FinalizeChecklistBlocker = {
  key: FinalizeTaskKey;
  title: string;
  description: string;
  actionLabel: string;
};

export type FinalizeChecklistProgress = {
  completed: number;
  total: number;
};

export type FinalizeChecklistResult = {
  success: boolean;
  checklist: FinalizeChecklist;
  canFinalize: boolean;
  blockers: FinalizeChecklistBlocker[];
  progress: FinalizeChecklistProgress;
  currentStatus?: string;
  aiStatus?: string | null;
  error?: string;
};

const EMPTY_FINALIZE_CHECKLIST: FinalizeChecklist = {
  patientLinked: false,
  transcriptReady: false,
  noteReady: false,
  medicationPrescribed: false,
};

function buildFinalizeChecklist(appointment: {
  patientId: string | null;
  transcript: unknown;
  soapNote: unknown;
  prescriptionCount?: number;
}): FinalizeChecklist {
  return {
    patientLinked: Boolean(appointment.patientId),
    transcriptReady: hasTranscriptContent(appointment.transcript),
    noteReady: hasGeneratedNote(appointment.soapNote),
    medicationPrescribed: (appointment.prescriptionCount ?? 0) > 0,
  };
}

function canFinalizeFromChecklist(checklist: FinalizeChecklist): boolean {
  return checklist.patientLinked && checklist.transcriptReady && checklist.noteReady && checklist.medicationPrescribed;
}

function buildFinalizeChecklistBlockers(
  checklist: FinalizeChecklist,
  aiStatus: string | null | undefined,
): FinalizeChecklistBlocker[] {
  const blockers: FinalizeChecklistBlocker[] = [];

  if (!checklist.patientLinked) {
    blockers.push({
      key: "patientLinked",
      title: "Link a patient",
      description: "Attach this session to the correct patient profile before completion.",
      actionLabel: "Link Patient",
    });
  }

  if (!checklist.transcriptReady) {
    let transcriptDescription = "Record or upload audio, then confirm transcription in the Transcript tab.";

    if (aiStatus === "PROCESSING") {
      transcriptDescription = "Transcription is still processing. Wait for completion, then refresh this checklist.";
    } else if (aiStatus === "FAILED") {
      transcriptDescription = "Transcription failed. Re-upload audio or retry transcription before finalizing.";
    }

    blockers.push({
      key: "transcriptReady",
      title: "Generate transcript",
      description: transcriptDescription,
      actionLabel: "Go to Transcript",
    });
  }

  if (!checklist.noteReady) {
    blockers.push({
      key: "noteReady",
      title: "Generate visit note",
      description: "Create and review a template note in the Note tab before finalizing.",
      actionLabel: "Go to Note",
    });
  }

  if (!checklist.medicationPrescribed) {
    blockers.push({
      key: "medicationPrescribed",
      title: "Prescribe medication",
      description: "Add at least one medication in the Medication tab before finalizing this clinical session.",
      actionLabel: "Go to Medication",
    });
  }

  return blockers;
}

function buildFinalizeChecklistProgress(checklist: FinalizeChecklist): FinalizeChecklistProgress {
  const completed = [
    checklist.patientLinked,
    checklist.transcriptReady,
    checklist.noteReady,
    checklist.medicationPrescribed,
  ].filter(Boolean).length;
  return {
    completed,
    total: 4,
  };
}

export type MedicationFinalizeDraft = {
  medicineCatalogId: string | null;
  name: string;
  strength: string | null;
  form: string | null;
  durationWeeks: number;
  scheduleCounts: {
    day: number;
    noon: number;
    night: number;
  };
};

export type MedicationSafetyReviewDraft = {
  draftId: string;
  medicineCatalogId?: string | null;
  drugName: string;
  queryDrug?: string | null;
  genericName?: string | null;
  activeIngredients?: string[] | null;
  strength: string | null;
  form: string | null;
  indication: string | null;
  durationWeeks: number;
  scheduleCounts: {
    day: number;
    noon: number;
    night: number;
  };
};

export type MedicationSafetyReviewItemResult = {
  draftId: string;
  proposedDrug: string;
  queriedDrugs?: string[];
  proposedMedicine: string | null;
  warningAllergies: string[];
  warningInteractions: string[];
  warningContraindications: string[];
  status: "safe" | "warning" | "caution";
  error?: string;
};

export type MedicationSafetyReviewResult = {
  success: boolean;
  patientId: string | null;
  results: MedicationSafetyReviewItemResult[];
  error?: string;
};

export async function getClinicalSessionData(appointmentId: string) {
  const doctor = await getCurrentDoctor();

  if (!doctor) {
    console.log("Doctor profile not found for current user");
    return null;
  }

  console.log("Fetching appointment:", appointmentId);
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    include: {
      doctor: true,
      patient: {
        include: {
          user: true, // to get name
          prescriptions: {
            where: {
              status: "ACTIVE",
            },
            orderBy: {
              startDate: "desc",
            },
            include: {
              doctor: {
                include: {
                  user: true,
                },
              },
            },
          },
        }
      }
    }
  });

  let doctorVoiceEmbeddingData: unknown = null;
  if (appointment?.doctorId) {
    try {
      const db = prisma as any;
      if (db.voiceEmbedding?.findUnique) {
        const voiceEmbedding = await db.voiceEmbedding.findUnique({
          where: {
            doctorId: appointment.doctorId,
          },
          select: {
            embeddingData: true,
          },
        });
        doctorVoiceEmbeddingData = voiceEmbedding?.embeddingData ?? null;
      }
    } catch (error) {
      console.warn("Could not load doctor voice embedding for clinical session:", error);
    }
  }

  // Fetch patient user details from Clerk manually if needed, 
  // or just rely on what we have. But the user asked for Clerk Profile Pic.
  // The 'user' relation has 'clerkId'.
  let patientImageUrl = "";
  if (isLikelyClerkUserId(appointment?.patient?.user?.clerkId)) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(appointment.patient.user.clerkId);
      patientImageUrl = clerkUser.imageUrl;
    } catch {
      // Ignore stale/invalid Clerk IDs.
    }
  }

  return { ...appointment, patientImageUrl, doctorVoiceEmbeddingData };
}

export type MedicationPrescriptionSummary = {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  durationWeeks: number | null;
  status: string;
  prescribedBy: string | null;
  medicineStrength: string | null;
  medicineForm: string | null;
  medicineImageUrl: string | null;
};

export type MedicationCatalogResult = {
  success: boolean;
  medications: MedicationCatalogItem[];
  source: "database" | "csv";
  error?: string;
};

function mapMedicationCatalogRecord(record: any): MedicationCatalogItem {
  const splitMultiValueField = (value: unknown): string[] => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return [];
    }

    return value
      .split(";")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  const rawConfidence =
    typeof record.matchConfidence === "string"
      ? record.matchConfidence.trim().toLowerCase()
      : null;

  return {
    id: String(record.id),
    drugName: String(record.drugName),
    drugNameNormalized: String(record.drugNameNormalized || record.drugName),
    manufacturer: record.manufacturer ? String(record.manufacturer) : null,
    strength: record.strength ? String(record.strength) : null,
    form: record.form ? String(record.form) : null,
    genericName: record.genericName ? String(record.genericName) : null,
    activeIngredients: splitMultiValueField(record.activeIngredients),
    primekgQueryTerms: splitMultiValueField(record.primekgQueryTerms),
    matchConfidence:
      rawConfidence === "high" || rawConfidence === "medium" || rawConfidence === "low"
        ? rawConfidence
        : null,
    mappingNotes: record.mappingNotes ? String(record.mappingNotes) : null,
    indication: record.indication ? String(record.indication) : null,
    sideEffects: record.sideEffects ? String(record.sideEffects) : null,
    availableIn: record.availableIn ? String(record.availableIn) : null,
    ageRestriction: record.ageRestriction ? String(record.ageRestriction) : null,
    prescriptionRequired: Boolean(record.prescriptionRequired),
    price: record.price ? String(record.price) : null,
    imageUrl: record.imageUrl ? String(record.imageUrl) : null,
    source: record.source ? String(record.source) : null,
  };
}

export async function getMedicationCatalogForSession(appointmentId: string): Promise<MedicationCatalogResult> {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return {
      success: false,
      medications: [],
      source: "csv",
      error: "Doctor profile not found",
    };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: {
      id: true,
    },
  });

  if (!appointment) {
    return {
      success: false,
      medications: [],
      source: "csv",
      error: "Appointment not found",
    };
  }

  try {
    const db = prisma as any;
    if (db.medicineCatalog?.findMany) {
      const records = await db.medicineCatalog.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          drugName: "asc",
        },
      });

      if (Array.isArray(records) && records.length > 0) {
        return {
          success: true,
          medications: records.map(mapMedicationCatalogRecord),
          source: "database",
        };
      }
    }
  } catch (error) {
    console.warn("Medicine catalog DB lookup failed; falling back to CSV:", error);
  }

  try {
    const medications = await loadMedicationCatalogFromCsv();
    return {
      success: true,
      medications,
      source: "csv",
    };
  } catch (error) {
    console.error("Failed to load medication catalog from CSV", error);
    return {
      success: false,
      medications: [],
      source: "csv",
      error: "Medication catalog could not be loaded from the database or CSV source.",
    };
  }
}

export async function runMedicationSafetyReview(
  appointmentId: string,
  drafts: MedicationSafetyReviewDraft[],
): Promise<MedicationSafetyReviewResult> {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return {
      success: false,
      patientId: null,
      results: [],
      error: "Doctor profile not found",
    };
  }

  if (drafts.length === 0) {
    return {
      success: false,
      patientId: null,
      results: [],
      error: "No medications were provided for safety review.",
    };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: {
      patientId: true,
    },
  });

  if (!appointment) {
    return {
      success: false,
      patientId: null,
      results: [],
      error: "Appointment not found",
    };
  }

  if (!appointment.patientId) {
    return {
      success: false,
      patientId: null,
      results: [],
      error: "Link a patient before running medication safety review.",
    };
  }

  const neo4jPatientId = resolveNeo4jPatientGraphId({
    appointmentPatientId: appointment.patientId,
  });

  const medicineCatalogIds = Array.from(
    new Set(
      drafts
        .map((draft) => draft.medicineCatalogId?.trim() || null)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const medicineCatalogRecords =
    medicineCatalogIds.length > 0
      ? await prisma.medicineCatalog.findMany({
          where: {
            id: {
              in: medicineCatalogIds,
            },
          },
        })
      : [];
  const medicineCatalogById = new Map(
    medicineCatalogRecords.map((record) => [record.id, record]),
  );

  const results = await Promise.all(
    drafts.map(async (draft): Promise<MedicationSafetyReviewItemResult> => {
      const medicineCatalogRecord = draft.medicineCatalogId
        ? medicineCatalogById.get(draft.medicineCatalogId)
        : undefined;
      const queryCandidates = buildMedicationQueryCandidates({
        drugName: draft.drugName,
        genericName: medicineCatalogRecord?.genericName ?? null,
        activeIngredients:
          typeof medicineCatalogRecord?.activeIngredients === "string"
            ? medicineCatalogRecord.activeIngredients
                .split(";")
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
            : [],
        primekgQueryTerms:
          typeof medicineCatalogRecord?.primekgQueryTerms === "string"
            ? medicineCatalogRecord.primekgQueryTerms
                .split(";")
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
            : [],
        fallbackQueryDrug: draft.queryDrug?.trim() || null,
      });
      const proposedDrug = queryCandidates[0] ?? draft.drugName.trim();

      if (!proposedDrug || queryCandidates.length === 0) {
        return {
          draftId: draft.draftId,
          proposedDrug: "",
          queriedDrugs: [],
          proposedMedicine: null,
          warningAllergies: [],
          warningInteractions: [],
          warningContraindications: [],
          status: "caution",
          error: "Medication name is missing for safety review.",
        };
      }

      const warningAllergies = new Set<string>();
      const warningInteractions = new Set<string>();
      const warningContraindications = new Set<string>();
      const matchedMedicines = new Set<string>();
      let lastError: string | undefined;
      let matchedAnyCandidate = false;

      for (const candidate of queryCandidates) {
        const queryResult = await runNeo4jReadQuery(verifyPrescriptionSafetyQuery, {
          patientId: neo4jPatientId,
          proposedDrug: candidate,
        });

        if (!queryResult.ok) {
          lastError = queryResult.error;
          continue;
        }

        const firstRow = queryResult.rows[0];
        if (!firstRow) {
          continue;
        }

        matchedAnyCandidate = true;
        for (const item of toStringArray(firstRow.Warning_Allergies)) {
          warningAllergies.add(item);
        }
        for (const item of toStringArray(firstRow.Warning_Interactions)) {
          warningInteractions.add(item);
        }
        for (const item of toStringArray(firstRow.Warning_Contraindications)) {
          warningContraindications.add(item);
        }

        if (
          typeof firstRow.ProposedMedicine === "string" &&
          firstRow.ProposedMedicine.trim()
        ) {
          matchedMedicines.add(firstRow.ProposedMedicine.trim());
        }
      }

      if (!matchedAnyCandidate) {
        return {
          draftId: draft.draftId,
          proposedDrug,
          queriedDrugs: queryCandidates,
          proposedMedicine: null,
          warningAllergies: [],
          warningInteractions: [],
          warningContraindications: [],
          status: "caution",
          error:
            lastError ??
            "No Neo4j result rows found for this medication or its mapped compounds.",
        };
      }

      const warningAllergiesArray = Array.from(warningAllergies);
      const warningInteractionsArray = Array.from(warningInteractions);
      const warningContraindicationsArray = Array.from(warningContraindications);
      const hasWarnings =
        warningAllergiesArray.length > 0 ||
        warningInteractionsArray.length > 0 ||
        warningContraindicationsArray.length > 0;

      return {
        draftId: draft.draftId,
        proposedDrug,
        queriedDrugs: queryCandidates,
        proposedMedicine: Array.from(matchedMedicines)[0] ?? null,
        warningAllergies: warningAllergiesArray,
        warningInteractions: warningInteractionsArray,
        warningContraindications: warningContraindicationsArray,
        status: hasWarnings ? "warning" : "safe",
      };
    }),
  );

  return {
    success: true,
    patientId: appointment.patientId,
    results,
  };
}

export type PatientMetricCatalogResult = {
  success: boolean;
  metrics: string[];
  total: number;
  error?: string;
};

function normalizeMetricCatalogKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export async function getAppointmentPatientMetricCatalog(
  appointmentId: string
): Promise<PatientMetricCatalogResult> {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return {
      success: false,
      metrics: [],
      total: 0,
      error: "Doctor profile not found",
    };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: {
      patient: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!appointment) {
    return {
      success: false,
      metrics: [],
      total: 0,
      error: "Appointment not found",
    };
  }

  const patientUserId = appointment.patient?.userId;
  if (!patientUserId) {
    return {
      success: true,
      metrics: [],
      total: 0,
    };
  }

  const rows = await prisma.medicalReportValue.findMany({
    where: {
      userId: patientUserId,
      keyNormalized: {
        not: null,
      },
    },
    select: {
      keyNormalized: true,
    },
    distinct: ["keyNormalized"],
  });

  const metrics = rows
    .map((row) => row.keyNormalized)
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .map((value) => normalizeMetricCatalogKey(value))
    .filter((value) => value.length > 0)
    .sort((a, b) => a.localeCompare(b));

  const deduped = Array.from(new Set(metrics));

  return {
    success: true,
    metrics: deduped,
    total: deduped.length,
  };
}

export async function updateAppointmentRecording(appointmentId: string, recordingUrl: string) {
  const user = await currentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  if (!appointmentId) {
    throw new Error("Missing appointment ID");
  }

  if (!recordingUrl) {
    throw new Error("Missing recording URL");
  }

  // Validate doctor access again (security best practice)
  const doctor = await prisma.doctorProfile.findFirst({
    where: { 
      user: {
        clerkId: user.id
      }
    },
  });

  if (!doctor) {
    throw new Error("Doctor profile not found");
  }

  console.log(`Updating appointment ${appointmentId} with recording: ${recordingUrl}`);

  const existingAppointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: {
      id: true,
      patientId: true,
    },
  });

  if (!existingAppointment) {
    throw new Error("Appointment not found");
  }

  // Update the appointment
  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      recordingUrl: recordingUrl,
      status: existingAppointment.patientId ? "IN_PROGRESS" : "UNLINKED",
      aiStatus: "PROCESSING" // Signal that we have audio ready for processing
    },
    select: {
      id: true,
      recordingUrl: true,
      status: true,
      aiStatus: true,
    },
  });

  return {
    success: true,
    appointmentId: updatedAppointment.id,
    recordingUrl: updatedAppointment.recordingUrl,
    status: updatedAppointment.status,
    aiStatus: updatedAppointment.aiStatus,
  };
}

export type LinkablePatient = {
  id: string;
  name: string;
  initials: string;
  imageUrl: string | null;
};

export async function getDoctorPatientsForLinking(): Promise<LinkablePatient[]> {
  const doctor = await getCurrentDoctor();
  if (!doctor) return [];

  const clerk = await clerkClient();

  const patients = await prisma.patientProfile.findMany({
    where: {
      user: {
        role: "PATIENT",
      },
    },
    include: {
      user: true,
    },
  });

  const sortedPatients = patients.sort((a, b) => {
    const nameA = a.user.name || "";
    const nameB = b.user.name || "";
    return nameA.localeCompare(nameB);
  });

  return Promise.all(
    sortedPatients.map(async (patient) => {
      let imageUrl: string | null = null;

      if (isLikelyClerkUserId(patient.user.clerkId)) {
        try {
          const clerkUser = await clerk.users.getUser(patient.user.clerkId);
          imageUrl = clerkUser.imageUrl ?? null;
        } catch {
          // Ignore stale/invalid Clerk IDs.
        }
      }

      const name = patient.user.name || "Unknown Patient";

      return {
        id: patient.id,
        name,
        initials: name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase(),
        imageUrl,
      };
    })
  );
}

export async function linkPatientToAppointment(appointmentId: string, patientId: string) {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return { success: false, error: "Doctor profile not found" };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
  });

  if (!appointment) {
    return { success: false, error: "Appointment not found" };
  }

  const patient = await prisma.patientProfile.findUnique({
    where: { id: patientId },
    include: { user: true },
  });

  if (!patient) {
    return { success: false, error: "Patient not found" };
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      patientId,
      status: "IN_PROGRESS",
    },
    include: {
      patient: {
        include: {
          user: true,
        },
      },
    },
  });

  let patientImageUrl = "";
  if (isLikelyClerkUserId(updatedAppointment.patient?.user?.clerkId)) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(updatedAppointment.patient.user.clerkId);
      patientImageUrl = clerkUser.imageUrl;
    } catch {
      // Ignore stale/invalid Clerk IDs.
    }
  }

  revalidatePath(`/doctor/clinical-session/${appointmentId}`);
  revalidatePath("/doctor/clinical-session");
  revalidatePath("/doctor/dashboard");

  return {
    success: true,
    appointment: {
      ...updatedAppointment,
      patientImageUrl,
    },
  };
}

export async function unlinkPatientFromAppointment(appointmentId: string) {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return { success: false, error: "Doctor profile not found" };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
  });

  if (!appointment) {
    return { success: false, error: "Appointment not found" };
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      patientId: null,
      status: "UNLINKED",
    },
    include: {
      patient: {
        include: {
          user: true,
        },
      },
    },
  });

  revalidatePath(`/doctor/clinical-session/${appointmentId}`);
  revalidatePath("/doctor/clinical-session");
  revalidatePath("/doctor/dashboard");

  return {
    success: true,
    appointment: {
      ...updatedAppointment,
      patientImageUrl: "",
    },
  };
}

export async function getAppointmentFinalizeChecklist(appointmentId: string): Promise<FinalizeChecklistResult> {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return {
      success: false,
      checklist: EMPTY_FINALIZE_CHECKLIST,
      canFinalize: false,
      blockers: [],
      progress: buildFinalizeChecklistProgress(EMPTY_FINALIZE_CHECKLIST),
      error: "Doctor profile not found",
    };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: {
      id: true,
      date: true,
      reason: true,
      status: true,
      aiStatus: true,
      patientId: true,
      transcript: true,
      soapNote: true,
      doctor: {
        select: {
          specialization: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      },
      patient: {
        select: {
          user: {
            select: {
              name: true,
            },
          },
        },
      },
      _count: {
        select: {
          prescriptions: true,
        },
      },
    },
  });

  if (!appointment) {
    return {
      success: false,
      checklist: EMPTY_FINALIZE_CHECKLIST,
      canFinalize: false,
      blockers: [],
      progress: buildFinalizeChecklistProgress(EMPTY_FINALIZE_CHECKLIST),
      error: "Appointment not found",
    };
  }

  const checklist = buildFinalizeChecklist({
    ...appointment,
    prescriptionCount: appointment._count.prescriptions,
  });
  const blockers = buildFinalizeChecklistBlockers(checklist, appointment.aiStatus);
  const progress = buildFinalizeChecklistProgress(checklist);

  return {
    success: true,
    checklist,
    canFinalize: canFinalizeFromChecklist(checklist),
    blockers,
    progress,
    currentStatus: appointment.status,
    aiStatus: appointment.aiStatus,
  };
}

export async function uploadClientPdfToCloudinary(formData: FormData) {
  const doctor = await getCurrentDoctor();
  if (!doctor) return { success: false, error: "Unauthorized" };

  const file = formData.get("file") as File;
  const appointmentId = formData.get("appointmentId") as string;
  const filename = formData.get("filename") as string;

  if (!file || !appointmentId) {
    return { success: false, error: "Missing file or appointment ID" };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadedUrl = await uploadVisitSummaryPdfToCloudinary({
      filename: filename || `note-${appointmentId}`,
      pdfBuffer: buffer,
    });

    if (!uploadedUrl) throw new Error("Cloudinary returned null URL");

    return { success: true, url: uploadedUrl };
  } catch (error) {
    console.error("Failed to upload client PDF to Cloudinary", error);
    return { success: false, error: "Upload failed" };
  }
}

export async function finalizeAppointmentSession(
  appointmentId: string,
  options?: {
    preUploadedPdfUrl?: string;
    medicationDrafts?: MedicationFinalizeDraft[];
  }
): Promise<FinalizeChecklistResult> {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return {
      success: false,
      checklist: EMPTY_FINALIZE_CHECKLIST,
      canFinalize: false,
      blockers: [],
      progress: buildFinalizeChecklistProgress(EMPTY_FINALIZE_CHECKLIST),
      error: "Doctor profile not found",
    };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: {
      id: true,
      date: true,
      reason: true,
      status: true,
      aiStatus: true,
      patientId: true,
      transcript: true,
      soapNote: true,
      doctor: {
        select: {
          specialization: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      },
      patient: {
        select: {
          id: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      },
      _count: {
        select: {
          prescriptions: true,
        },
      },
    },
  });

  if (!appointment) {
    return {
      success: false,
      checklist: EMPTY_FINALIZE_CHECKLIST,
      canFinalize: false,
      blockers: [],
      progress: buildFinalizeChecklistProgress(EMPTY_FINALIZE_CHECKLIST),
      error: "Appointment not found",
    };
  }

  const checklist = buildFinalizeChecklist({
    ...appointment,
    prescriptionCount: (options?.medicationDrafts?.length ?? 0) > 0
      ? options?.medicationDrafts?.length
      : appointment._count.prescriptions,
  });
  const blockers = buildFinalizeChecklistBlockers(checklist, appointment.aiStatus);
  const progress = buildFinalizeChecklistProgress(checklist);
  const canFinalize = canFinalizeFromChecklist(checklist);

  if (!canFinalize) {
    return {
      success: false,
      checklist,
      canFinalize: false,
      blockers,
      progress,
      currentStatus: appointment.status,
      aiStatus: appointment.aiStatus,
      error: "Complete all required tasks before finalizing this clinical session.",
    };
  }

  const finalizedAtIso = new Date().toISOString();
  const finalizedSoapNote = markSoapNoteAsFinalized(appointment.soapNote, finalizedAtIso);
  const fallbackDownloadUrl = `/api/patient/visit-summaries/${appointment.id}/download`;

  const patientName = appointment.patient?.user?.name?.trim() || "Patient";
  const doctorName = appointment.doctor?.user?.name?.trim()
    ? `Dr. ${appointment.doctor.user.name.trim()}`
    : appointment.doctor?.specialization
      ? `Dr. ${appointment.doctor.specialization}`
      : "Care Team";
  const visitDateLabel = formatVisitSummaryDateLabel(appointment.date);
  const reason = appointment.reason?.trim() || "Clinical follow-up";
  const noteText = typeof finalizedSoapNote.noteText === "string" ? finalizedSoapNote.noteText : "";

  let noteDownloadUrl = fallbackDownloadUrl;

  if (options?.preUploadedPdfUrl) {
    noteDownloadUrl = options.preUploadedPdfUrl;
  } else {
    // Try to generate template-based PDF from the appointment's soapNote
    try {
      const soapNote = appointment.soapNote as Record<string, unknown> | null;
      const templateRef = soapNote?.template as { id?: string } | undefined;
      const noteData = soapNote?.noteData as Record<string, unknown> | undefined;
      const noteMetadata = soapNote?.noteMetadata as Record<string, unknown> | undefined;

      if (templateRef?.id && noteData) {
        const db = prisma as any;
        const templateRecord = await db.noteTemplate.findFirst({
          where: {
            id: templateRef.id,
            source: "PERSONAL",
            userId: (await prisma.user.findUnique({
              where: { clerkId: (await currentUser())!.id },
              select: { id: true },
            }))?.id,
          },
          include: {
            fields: {
              orderBy: { fieldOrder: "asc" },
            },
          },
        });

        if (templateRecord) {
          const template = mapRecordToSoapTemplate(templateRecord);
          const llmObject = { ...noteData, ...noteMetadata };
          const pdfBuffer = await renderNoteDocumentPdfBuffer(template, llmObject);
          const filename = buildVisitSummaryFilename(patientName, visitDateLabel);

          const uploadedUrl = await uploadVisitSummaryPdfToCloudinary({
            filename,
            pdfBuffer,
          });

          if (uploadedUrl) {
            noteDownloadUrl = uploadedUrl;
          }
        }
      }
    } catch (error) {
      console.error("Failed to generate template PDF; using fallback route", error);
    }
  }

  await prisma.$transaction(async (tx) => {
    if (appointment.patient?.id && options?.medicationDrafts?.length) {
      const patientId = appointment.patient.id;
      const doctorName = appointment.doctor?.user?.name?.trim();

      await tx.prescription.createMany({
        data: options.medicationDrafts.map((draft) => {
          const startDate = new Date();
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + draft.durationWeeks * 7);

          return {
            name: draft.name,
            dosage: draft.strength || draft.form || "As prescribed",
            frequency: `${draft.scheduleCounts.day}-${draft.scheduleCounts.noon}-${draft.scheduleCounts.night}`,
            startDate,
            endDate,
            status: "ACTIVE",
            prescribedBy: doctorName ? `Dr. ${doctorName}` : null,
            durationWeeks: draft.durationWeeks,
            instructions: `Morning ${draft.scheduleCounts.day}, Afternoon ${draft.scheduleCounts.noon}, Evening ${draft.scheduleCounts.night}`,
            medicineStrength: draft.strength,
            medicineForm: draft.form,
            patientId,
            doctorId: doctor.id,
            medicineCatalogId: draft.medicineCatalogId,
            appointmentId: appointment.id,
          };
        }),
      });
    }

    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "COMPLETED",
        soapNote: finalizedSoapNote as Prisma.InputJsonValue,
        soapNoteUrl: noteDownloadUrl,
      },
    });
  });

  revalidatePath(`/doctor/clinical-session/${appointment.id}`);
  revalidatePath("/doctor/clinical-session");
  revalidatePath("/doctor/dashboard");
  revalidatePath("/patient/visit-summaries");
  revalidatePath("/patient/dashboard");
  revalidatePath("/patient/medications");

  return {
    success: true,
    checklist,
    canFinalize: true,
    blockers: [],
    progress,
    currentStatus: "COMPLETED",
    aiStatus: appointment.aiStatus,
  };
}

export async function deleteAppointmentSession(appointmentId: string) {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return { success: false, error: "Doctor profile not found" };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: { id: true },
  });

  if (!appointment) {
    return { success: false, error: "Appointment not found" };
  }

  await prisma.appointment.delete({
    where: { id: appointment.id },
  });

  revalidatePath("/doctor/clinical-session");
  revalidatePath("/doctor/dashboard");
  revalidatePath("/doctor");

  return { success: true };
}

// ---------------------------------------------------------------------------
// Previous session / SOAP note retrieval helpers for chat tool calling
// ---------------------------------------------------------------------------

export type PreviousAppointmentSummary = {
  id: string;
  date: Date;
  status: string;
  reason: string | null;
  doctorName: string | null;
  soapNoteUrl: string | null;
  transcript: unknown;
  soapNote: unknown;
};

export async function getPatientPreviousAppointments(
  appointmentId: string,
  limit: number = 3
): Promise<{
  success: boolean;
  appointments: PreviousAppointmentSummary[];
  error?: string;
}> {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return { success: false, appointments: [], error: "Doctor profile not found" };
  }

  const currentAppointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: {
      patientId: true,
      date: true,
    },
  });

  if (!currentAppointment) {
    return { success: false, appointments: [], error: "Appointment not found" };
  }

  if (!currentAppointment.patientId) {
    return { success: false, appointments: [], error: "No patient linked to this appointment" };
  }

  const previousAppointments = await prisma.appointment.findMany({
    where: {
      patientId: currentAppointment.patientId,
      id: { not: appointmentId },
      date: { lt: currentAppointment.date },
      status: "COMPLETED",
    },
    select: {
      id: true,
      date: true,
      status: true,
      reason: true,
      soapNoteUrl: true,
      doctor: {
        select: {
          user: {
            select: {
              name: true,
            },
          },
        },
      },
      transcript: true,
      soapNote: true,
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  return {
    success: true,
    appointments: previousAppointments.map((appt) => ({
      id: appt.id,
      date: appt.date,
      status: appt.status,
      reason: appt.reason,
      doctorName: appt.doctor?.user?.name ?? null,
      soapNoteUrl: appt.soapNoteUrl ?? null,
      transcript: appt.transcript,
      soapNote: appt.soapNote,
    })),
  };
}

export async function getLastSessionTranscript(appointmentId: string): Promise<{
  success: boolean;
  appointmentId: string | null;
  appointmentDate: Date | null;
  transcript: Array<{
    speaker: string;
    role?: string;
    text: string;
    start?: number;
    end?: number;
  }> | null;
  error?: string;
}> {
  const result = await getPatientPreviousAppointments(appointmentId, 1);
  if (!result.success || result.appointments.length === 0) {
    return {
      success: false,
      appointmentId: null,
      appointmentDate: null,
      transcript: null,
      error: result.error || "No previous sessions found for this patient.",
    };
  }

  const lastAppointment = result.appointments[0];
  const rawTranscript = lastAppointment.transcript;

  if (!Array.isArray(rawTranscript) || rawTranscript.length === 0) {
    return {
      success: false,
      appointmentId: lastAppointment.id,
      appointmentDate: lastAppointment.date,
      transcript: null,
      error: "Previous session exists but has no transcript.",
    };
  }

  const normalizedTranscript = rawTranscript
    .filter(
      (segment): segment is Record<string, unknown> =>
        segment !== null && typeof segment === "object"
    )
    .map((segment) => ({
      speaker: String(segment.speaker || segment.role || "Speaker").trim(),
      role: typeof segment.role === "string" ? segment.role : undefined,
      text: String(segment.text || "").trim(),
      start: typeof segment.start === "number" ? segment.start : undefined,
      end: typeof segment.end === "number" ? segment.end : undefined,
    }))
    .filter((segment) => segment.text.length > 0);

  return {
    success: true,
    appointmentId: lastAppointment.id,
    appointmentDate: lastAppointment.date,
    transcript: normalizedTranscript,
  };
}

export async function getLastSoapNote(appointmentId: string): Promise<{
  success: boolean;
  appointmentId: string | null;
  appointmentDate: Date | null;
  soapNote: Record<string, unknown> | null;
  error?: string;
}> {
  const result = await getPatientPreviousAppointments(appointmentId, 1);
  if (!result.success || result.appointments.length === 0) {
    return {
      success: false,
      appointmentId: null,
      appointmentDate: null,
      soapNote: null,
      error: result.error || "No previous sessions found for this patient.",
    };
  }

  const lastAppointment = result.appointments[0];
  const rawSoapNote = lastAppointment.soapNote;

  if (!rawSoapNote || typeof rawSoapNote !== "object" || Array.isArray(rawSoapNote)) {
    return {
      success: false,
      appointmentId: lastAppointment.id,
      appointmentDate: lastAppointment.date,
      soapNote: null,
      error: "Previous session exists but has no SOAP note.",
    };
  }

  return {
    success: true,
    appointmentId: lastAppointment.id,
    appointmentDate: lastAppointment.date,
    soapNote: rawSoapNote as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Pipeline: save transcript + extracted facts produced by Whisper/pyannote pipeline
// ---------------------------------------------------------------------------

export async function saveSessionFinalArtifacts(
  appointmentId: string,
  payload: {
    extractedFacts?: Record<string, unknown>;
    finalTranscript?: unknown;
  },
): Promise<{ success: boolean; error?: string }> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const doctor = await prisma.doctorProfile.findFirst({
    where: { user: { clerkId: user.id } },
    select: { id: true },
  });
  if (!doctor) return { success: false, error: "Doctor profile not found" };

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, doctorId: doctor.id },
    select: { id: true },
  });
  if (!appointment) return { success: false, error: "Appointment not found" };

  const extractedFacts = payload?.extractedFacts ?? {};
  const hasFacts =
    extractedFacts &&
    typeof extractedFacts === "object" &&
    !Array.isArray(extractedFacts) &&
    Object.keys(extractedFacts).length > 0;
  const hasFinalTranscript =
    Array.isArray(payload?.finalTranscript) && payload.finalTranscript.length > 0;

  // Save transcript first (independent — must not be blocked by facts failure)
  if (hasFinalTranscript) {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        transcript: payload.finalTranscript as Prisma.InputJsonValue,
        aiStatus: "COMPLETED",
      },
    });
  }

  // Save extracted facts separately — Fact table might not exist yet;
  // this must never block the transcript save.
  if (hasFacts) {
    try {
      await prisma.fact.create({
        data: {
          appointmentId: appointment.id,
          extractedData: extractedFacts as Prisma.InputJsonValue,
        },
      });
    } catch (factErr) {
      console.warn("Failed to persist facts (non-fatal; run `prisma db push` to create Fact table):", (factErr as Error)?.message ?? factErr);
    }
  }

  revalidatePath(`/doctor/clinical-session/${appointment.id}`);
  return { success: true };
}
