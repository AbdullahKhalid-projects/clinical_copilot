import { NextResponse } from "next/server";
import neo4j, { type Driver } from "neo4j-driver";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { verifyPrescriptionSafetyQuery } from "@/code";

const NEO4J_URI = process.env.NEO4J_URI?.trim() ?? "";
const NEO4J_USERNAME = process.env.NEO4J_USERNAME?.trim() ?? "";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "";
const NEO4J_DATABASE = process.env.NEO4J_DATABASE?.trim() || undefined;
const NEO4J_QUERY_TIMEOUT_MS = 6000;

let neo4jDriverSingleton: Driver | null = null;

type MedicationSafetyReviewDraft = {
  draftId: string;
  drugName: string;
  queryDrug?: string | null;
};

type MedicationSafetyReviewItemResult = {
  draftId: string;
  proposedDrug: string;
  proposedMedicine: string | null;
  warningAllergies: string[];
  warningInteractions: string[];
  warningContraindications: string[];
  status: "safe" | "warning" | "caution";
  error?: string;
};

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
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string }> {
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
    const result = await Promise.race([
      session.executeRead((tx: any) => tx.run(query, params)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Neo4j safety query timed out.")), NEO4J_QUERY_TIMEOUT_MS),
      ),
    ]);

    const rows = (result as any).records.map((record: any) => {
      const row: Record<string, unknown> = {};
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

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized", results: [] }, { status: 401 });
  }

  const doctor = await prisma.doctorProfile.findFirst({
    where: {
      user: {
        clerkId: user.id,
      },
    },
    select: { id: true },
  });

  if (!doctor) {
    return NextResponse.json({ success: false, error: "Doctor profile not found", results: [] }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { appointmentId?: string; drafts?: MedicationSafetyReviewDraft[] }
    | null;

  const appointmentId = body?.appointmentId?.trim();
  const drafts = Array.isArray(body?.drafts) ? body!.drafts : [];

  if (!appointmentId || drafts.length === 0) {
    return NextResponse.json(
      { success: false, error: "appointmentId and drafts are required", results: [] },
      { status: 400 },
    );
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

  if (!appointment?.patientId) {
    return NextResponse.json(
      { success: false, error: "Link a patient before running medication safety review.", results: [] },
      { status: 400 },
    );
  }

  const results: MedicationSafetyReviewItemResult[] = [];

  for (const draft of drafts) {
    const proposedDrug = draft.queryDrug?.trim() || draft.drugName.trim();

    if (!proposedDrug) {
      results.push({
        draftId: draft.draftId,
        proposedDrug: "",
        proposedMedicine: null,
        warningAllergies: [],
        warningInteractions: [],
        warningContraindications: [],
        status: "caution",
      });
      continue;
    }

    const queryResult = await runNeo4jReadQuery(verifyPrescriptionSafetyQuery, {
      patientId: appointment.patientId,
      proposedDrug,
    });

    if (!queryResult.ok) {
      results.push({
        draftId: draft.draftId,
        proposedDrug,
        proposedMedicine: null,
        warningAllergies: [],
        warningInteractions: [],
        warningContraindications: [],
        status: "caution",
        error: queryResult.error,
      });
      continue;
    }

    const firstRow = queryResult.rows[0];
    if (!firstRow) {
      results.push({
        draftId: draft.draftId,
        proposedDrug,
        proposedMedicine: null,
        warningAllergies: [],
        warningInteractions: [],
        warningContraindications: [],
        status: "caution",
      });
      continue;
    }

    const warningAllergies = toStringArray(firstRow.Warning_Allergies);
    const warningInteractions = toStringArray(firstRow.Warning_Interactions);
    const warningContraindications = toStringArray(firstRow.Warning_Contraindications);

    results.push({
      draftId: draft.draftId,
      proposedDrug,
      proposedMedicine:
        typeof firstRow.ProposedMedicine === "string" && firstRow.ProposedMedicine.trim()
          ? firstRow.ProposedMedicine.trim()
          : null,
      warningAllergies,
      warningInteractions,
      warningContraindications,
      status:
        warningAllergies.length > 0 || warningInteractions.length > 0 || warningContraindications.length > 0
          ? "warning"
          : "safe",
    });
  }

  return NextResponse.json({
    success: true,
    patientId: appointment.patientId,
    results,
  });
}
