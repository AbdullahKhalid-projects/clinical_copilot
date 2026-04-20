"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadVisitSummaryPdf } from "@/lib/uploadthing-server";
import { buildVisitSummaryFilename, formatVisitSummaryDateLabel, renderVisitSummaryPdfBuffer } from "@/lib/visit-summary-pdf";
import { markSoapNoteAsFinalized } from "@/lib/visit-summary";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function isLikelyClerkUserId(value: string | null | undefined): value is string {
  if (!value) return false;
  return value.startsWith("user_");
}

async function getCurrentDoctor() {
  const user = await currentUser();
  if (!user) {
    redirect("/");
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

export type FinalizeChecklist = {
  patientLinked: boolean;
  transcriptReady: boolean;
  noteReady: boolean;
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
};

function buildFinalizeChecklist(appointment: {
  patientId: string | null;
  transcript: unknown;
  soapNote: unknown;
}): FinalizeChecklist {
  return {
    patientLinked: Boolean(appointment.patientId),
    transcriptReady: hasTranscriptContent(appointment.transcript),
    noteReady: hasGeneratedNote(appointment.soapNote),
  };
}

function canFinalizeFromChecklist(checklist: FinalizeChecklist): boolean {
  return checklist.patientLinked && checklist.transcriptReady && checklist.noteReady;
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

  return blockers;
}

function buildFinalizeChecklistProgress(checklist: FinalizeChecklist): FinalizeChecklistProgress {
  const completed = [checklist.patientLinked, checklist.transcriptReady, checklist.noteReady].filter(Boolean).length;
  return {
    completed,
    total: 3,
  };
}

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
      patient: {
        include: {
          user: true, // to get name
        }
      }
    }
  });

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

  return { ...appointment, patientImageUrl };
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

  const checklist = buildFinalizeChecklist(appointment);
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

export async function finalizeAppointmentSession(appointmentId: string): Promise<FinalizeChecklistResult> {
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

  const checklist = buildFinalizeChecklist(appointment);
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

  if (noteText.trim().length > 0) {
    try {
      const filename = buildVisitSummaryFilename(patientName, visitDateLabel);
      const pdfBuffer = await renderVisitSummaryPdfBuffer({
        patientName,
        doctorName,
        visitDate: visitDateLabel,
        reason,
        noteText,
      });

      const uploadedUrl = await uploadVisitSummaryPdf({
        filename,
        pdfBuffer,
      });

      if (uploadedUrl) {
        noteDownloadUrl = uploadedUrl;
      }
    } catch (error) {
      console.error("Failed to persist visit summary PDF; using fallback route", error);
    }
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      status: "COMPLETED",
      soapNote: finalizedSoapNote as Prisma.InputJsonValue,
      soapNoteUrl: noteDownloadUrl,
    },
  });

  revalidatePath(`/doctor/clinical-session/${appointment.id}`);
  revalidatePath("/doctor/clinical-session");
  revalidatePath("/doctor/dashboard");
  revalidatePath("/patient/visit-summaries");
  revalidatePath("/patient/dashboard");

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
