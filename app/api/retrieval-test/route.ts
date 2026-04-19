import { NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import {
  searchVectorDatabase,
  type RetrievalTypeFilter,
} from "@/retrieval_actions/actions";
import { querySimilarDocuments } from "@/retrieval_actions/embeddings";
import { prisma } from "@/lib/prisma";

type RetrievalDebugRequest = {
  query?: string;
  topK?: number;
  typeFilter?: RetrievalTypeFilter;
  includePatientDocuments?: boolean;
  patientUserId?: string | null;
  patientProfileId?: string | null;
  appointmentId?: string | null;
  resultLimit?: number;
  skipTypeFilter?: boolean;
};

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }

  return fallback;
}

function parseInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed =
    typeof value === "number"
      ? Math.trunc(value)
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeTypeFilter(value: unknown): RetrievalTypeFilter {
  if (value === "medicine" || value === "disease" || value === "patient" || value === "all") {
    return value;
  }

  return "all";
}

function getAllowedPineconeTypes(
  typeFilter: RetrievalTypeFilter,
  includePatientDocuments: boolean
): string[] {
  if (typeFilter === "medicine") {
    return ["medicine"];
  }

  if (typeFilter === "disease") {
    return ["disease"];
  }

  if (typeFilter === "patient") {
    return includePatientDocuments ? ["patient"] : [];
  }

  return includePatientDocuments
    ? ["medicine", "disease", "patient"]
    : ["medicine", "disease"];
}

function toRecordCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function getPineconeDiagnostics() {
  const apiKey = process.env.PINECONE_API_KEY?.trim() || "";
  const indexName = process.env.PINECONE_INDEX_NAME?.trim() || "";
  const indexHost = process.env.PINECONE_INDEX_HOST?.trim() || "";
  const namespace = process.env.PINECONE_NAMESPACE?.trim() || null;

  if (!apiKey || !indexName) {
    return {
      available: false,
      reason: "Missing PINECONE_API_KEY or PINECONE_INDEX_NAME",
    };
  }

  try {
    const pc = new Pinecone({ apiKey });
    const index = pc.index(indexName, indexHost || undefined);

    const [indexStats, namespaceDescription] = await Promise.all([
      index.describeIndexStats(),
      namespace ? index.describeNamespace(namespace).catch(() => null) : Promise.resolve(null),
    ]);

    const namespaces = indexStats.namespaces ?? {};
    const namespaceStatsRecord =
      namespace && namespace in namespaces
        ? (namespaces as Record<string, { recordCount?: unknown }>)[namespace]
        : undefined;

    return {
      available: true,
      indexName,
      namespace,
      indexDimension: toRecordCount((indexStats as { dimension?: unknown }).dimension),
      totalRecordCount: toRecordCount((indexStats as { totalRecordCount?: unknown }).totalRecordCount),
      namespaceRecordCountFromStats: toRecordCount(namespaceStatsRecord?.recordCount),
      namespaceRecordCountFromDescribe: toRecordCount(
        (namespaceDescription as { recordCount?: unknown } | null)?.recordCount
      ),
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : "Unknown Pinecone diagnostics error",
    };
  }
}

async function runRetrievalDebug(payload: RetrievalDebugRequest) {
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!query) {
    return NextResponse.json(
      { error: "Missing required query. Provide ?query=... or a JSON body with query." },
      { status: 400 }
    );
  }

  const topK = parseInteger(payload.topK, 50, 1, 200);
  const resultLimit = parseInteger(payload.resultLimit, 10, 1, 50);
  const typeFilter = normalizeTypeFilter(payload.typeFilter);
  const includePatientDocuments = parseBoolean(payload.includePatientDocuments, typeFilter === "patient");
  const skipTypeFilter = parseBoolean(payload.skipTypeFilter, false);

  const appointmentId =
    typeof payload.appointmentId === "string" && payload.appointmentId.trim().length > 0
      ? payload.appointmentId.trim()
      : null;

  const requestedPatientUserId =
    typeof payload.patientUserId === "string" && payload.patientUserId.trim().length > 0
      ? payload.patientUserId.trim()
      : null;

  const requestedPatientProfileId =
    typeof payload.patientProfileId === "string" && payload.patientProfileId.trim().length > 0
      ? payload.patientProfileId.trim()
      : null;

  const warnings: string[] = [];
  let resolvedPatientUserId = requestedPatientUserId;
  let resolvedPatientProfileId = requestedPatientProfileId;

  if (resolvedPatientUserId === "YOUR_PATIENT_USER_ID") {
    warnings.push("patientUserId is still a placeholder; provide a real user id or appointmentId.");
    resolvedPatientUserId = null;
  }

  if (resolvedPatientProfileId === "YOUR_PATIENT_PROFILE_ID") {
    warnings.push("patientProfileId is still a placeholder; provide a real profile id.");
    resolvedPatientProfileId = null;
  }

  if (!resolvedPatientUserId && resolvedPatientProfileId) {
    const profile = await prisma.patientProfile.findUnique({
      where: { id: resolvedPatientProfileId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!profile) {
      warnings.push("patientProfileId was provided but no patient profile was found.");
    } else if (!profile.userId) {
      warnings.push("patientProfileId exists but has no linked userId.");
    } else {
      resolvedPatientUserId = profile.userId;
      resolvedPatientProfileId = profile.id;
    }
  }

  if (!resolvedPatientUserId && appointmentId) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        patient: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (!appointment) {
      warnings.push("appointmentId was provided but no appointment was found.");
    } else if (!appointment.patient?.userId) {
      warnings.push("appointment exists but is not linked to a patient user yet.");
    } else {
      resolvedPatientUserId = appointment.patient.userId;
      resolvedPatientProfileId = appointment.patient.id;
    }
  }

  if (typeFilter === "patient" && !resolvedPatientUserId) {
    warnings.push("Patient retrieval requires a real patientUserId (or appointmentId that resolves one).");
  }

  const allowedTypes = getAllowedPineconeTypes(typeFilter, includePatientDocuments);
  const pineconeFilter: Record<string, unknown> | null =
    skipTypeFilter
      ? null
      : allowedTypes.length === 0
      ? null
      : allowedTypes.length === 1
        ? { type: allowedTypes[0] }
        : { type: { $in: allowedTypes } };

  const scopedPatientPineconeFilter: Record<string, unknown> | null =
    includePatientDocuments &&
    typeFilter === "patient" &&
    (resolvedPatientUserId || resolvedPatientProfileId)
      ? {
          type: "patient",
          $or: [
            ...(resolvedPatientUserId
              ? [
                  { userId: resolvedPatientUserId },
                  { patientUserId: resolvedPatientUserId },
                  { ownerUserId: resolvedPatientUserId },
                ]
              : []),
            ...(resolvedPatientProfileId
              ? [
                  { patientProfileId: resolvedPatientProfileId },
                  { profileId: resolvedPatientProfileId },
                ]
              : []),
          ],
        }
      : null;

  const rawChildMatches = await querySimilarDocuments(
    query,
    topK,
    pineconeFilter ?? undefined
  );

  const rawChildMatchesUnfiltered = await querySimilarDocuments(query, topK);

  const pineconeDiagnostics = await getPineconeDiagnostics();

  const rawChildMatchesScoped =
    scopedPatientPineconeFilter === null
      ? null
      : await querySimilarDocuments(query, topK, scopedPatientPineconeFilter);

  const finalResults = await searchVectorDatabase(query, topK, typeFilter, {
    includePatientDocuments,
    patientProfileId: resolvedPatientProfileId,
    patientUserId: resolvedPatientUserId,
  });

  return NextResponse.json({
    ok: true,
    request: {
      query,
      topK,
      typeFilter,
      includePatientDocuments,
      skipTypeFilter,
      appointmentId,
      patientUserId: requestedPatientUserId,
      patientProfileId: requestedPatientProfileId,
      resolvedPatientUserId,
      resolvedPatientProfileId,
      resultLimit,
    },
    warnings,
    environment: {
      pineconeIndexNameSet: Boolean(process.env.PINECONE_INDEX_NAME?.trim()),
      pineconeIndexHostSet: Boolean(process.env.PINECONE_INDEX_HOST?.trim()),
      pineconeNamespace: process.env.PINECONE_NAMESPACE?.trim() || null,
      voyageApiKeySet: Boolean(process.env.VOYAGE_API_KEY?.trim()),
    },
    pineconeDiagnostics,
    debug: {
      allowedPineconeTypes: allowedTypes,
      pineconeFilter,
      scopedPatientPineconeFilter,
      counts: {
        rawChildMatches: rawChildMatches.length,
        rawChildMatchesUnfiltered: rawChildMatchesUnfiltered.length,
        rawChildMatchesScoped: rawChildMatchesScoped?.length ?? null,
        finalResults: finalResults.length,
      },
    },
    rawChildMatches: rawChildMatches.slice(0, resultLimit).map((match, index) => ({
      rank: index + 1,
      documentId: match.documentId,
      documentTitle: match.documentTitle,
      parentChunkId: match.parentChunkId,
      score: Number(match.score.toFixed(6)),
      childTextPreview: match.childText.slice(0, 280),
    })),
    rawChildMatchesUnfiltered: rawChildMatchesUnfiltered
      .slice(0, resultLimit)
      .map((match, index) => ({
        rank: index + 1,
        documentId: match.documentId,
        documentTitle: match.documentTitle,
        parentChunkId: match.parentChunkId,
        score: Number(match.score.toFixed(6)),
        childTextPreview: match.childText.slice(0, 280),
      })),
    rawChildMatchesScoped:
      rawChildMatchesScoped?.slice(0, resultLimit).map((match, index) => ({
        rank: index + 1,
        documentId: match.documentId,
        documentTitle: match.documentTitle,
        parentChunkId: match.parentChunkId,
        score: Number(match.score.toFixed(6)),
        childTextPreview: match.childText.slice(0, 280),
      })) ?? null,
    finalResults: finalResults.slice(0, resultLimit).map((result, index) => ({
      rank: index + 1,
      parentChunkId: result.parentChunkId,
      documentId: result.documentId,
      documentTitle: result.documentTitle,
      score: Number(result.score.toFixed(6)),
      parentTextLength: result.parentText.length,
      parentTextPreview: result.parentText.slice(0, 700),
    })),
  });
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  return runRetrievalDebug({
    query: searchParams.get("query") ?? searchParams.get("q") ?? undefined,
    topK: searchParams.get("topK") ?? undefined,
    typeFilter: (searchParams.get("typeFilter") ?? searchParams.get("type") ?? undefined) as
      | RetrievalTypeFilter
      | undefined,
    includePatientDocuments: searchParams.get("includePatientDocuments") ?? undefined,
    patientUserId: searchParams.get("patientUserId") ?? undefined,
    patientProfileId: searchParams.get("patientProfileId") ?? undefined,
    appointmentId: searchParams.get("appointmentId") ?? undefined,
    resultLimit: searchParams.get("resultLimit") ?? undefined,
    skipTypeFilter: searchParams.get("skipTypeFilter") ?? undefined,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RetrievalDebugRequest;
  return runRetrievalDebug(body);
}
