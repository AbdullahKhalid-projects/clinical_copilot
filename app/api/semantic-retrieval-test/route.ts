import { NextResponse } from "next/server";
import {
  searchVectorDatabase,
  type RetrievalTypeFilter,
} from "@/retrieval_actions/actions";
import { mergeRetrievedChunks } from "@/retrieval_actions/generation";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Semantic retrieval debug endpoint
// ---------------------------------------------------------------------------
// Isolated test endpoint for the semantic RAG pipeline.
// Runs ONLY semantic retrieval (no structured retrieval, no LLM generation).
//
// Usage:
//   GET  /api/semantic-retrieval-test?query=metformin+side+effects&patientUserId=...
//   POST /api/semantic-retrieval-test  { query, patientUserId, patientProfileId }
// ---------------------------------------------------------------------------

interface SemanticDebugRequest {
  query?: string;
  patientUserId?: string | null;
  patientProfileId?: string | null;
  appointmentId?: string | null;
  topK?: number;
  typeFilter?: RetrievalTypeFilter;
  includePatientDocuments?: boolean | string;
  maxChunks?: number;
  maxChunkChars?: number;
  maxTotalChars?: number;
  resultLimit?: number;
  skipDbValidation?: boolean | string;
}

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const n = value.trim().toLowerCase();
    if (n === "true" || n === "1" || n === "yes") return true;
    if (n === "false" || n === "0" || n === "no") return false;
  }
  return fallback;
}

function parseInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed =
    typeof value === "number"
      ? Math.trunc(value)
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeTypeFilter(value: unknown): RetrievalTypeFilter {
  if (
    value === "medicine" ||
    value === "disease" ||
    value === "patient" ||
    value === "all"
  ) {
    return value;
  }
  return "all";
}

async function resolvePatientIds(
  patientUserId?: string | null,
  patientProfileId?: string | null,
  appointmentId?: string | null
): Promise<{
  resolvedPatientUserId: string | null;
  resolvedPatientProfileId: string | null;
  patientName: string | null;
  warnings: string[];
}> {
  const warnings: string[] = [];
  let resolvedUserId = patientUserId?.trim() || null;
  let resolvedProfileId = patientProfileId?.trim() || null;
  let patientName: string | null = null;

  // Resolve via profile ID
  if (!resolvedUserId && resolvedProfileId) {
    const profile = await prisma.patientProfile.findUnique({
      where: { id: resolvedProfileId },
      select: {
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!profile) {
      warnings.push(`patientProfileId "${resolvedProfileId}" not found in DB.`);
    } else {
      resolvedUserId = profile.userId;
      patientName = profile.user?.name || profile.user?.email || null;
    }
  }

  // Resolve via user ID
  if (resolvedUserId && !patientName) {
    const user = await prisma.user.findUnique({
      where: { id: resolvedUserId },
      select: {
        name: true,
        email: true,
        patientProfile: { select: { id: true } },
      },
    });
    if (!user) {
      warnings.push(`patientUserId "${resolvedUserId}" not found in DB.`);
    } else {
      patientName = user.name || user.email || null;
      if (!resolvedProfileId && user.patientProfile) {
        resolvedProfileId = user.patientProfile.id;
      }
    }
  }

  // Resolve via appointment ID
  if (!resolvedUserId && appointmentId) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        patient: {
          select: {
            id: true,
            userId: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });
    if (!appointment) {
      warnings.push(`appointmentId "${appointmentId}" not found in DB.`);
    } else if (!appointment.patient?.userId) {
      warnings.push("Appointment exists but is not linked to a patient user.");
    } else {
      resolvedUserId = appointment.patient.userId;
      resolvedProfileId = appointment.patient.id;
      patientName =
        appointment.patient.user?.name ||
        appointment.patient.user?.email ||
        null;
    }
  }

  if (!resolvedUserId) {
    warnings.push(
      "No patientUserId resolved. Patient document scoping will be skipped."
    );
  }

  return {
    resolvedPatientUserId: resolvedUserId,
    resolvedPatientProfileId: resolvedProfileId,
    patientName,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function runSemanticRetrievalDebug(payload: SemanticDebugRequest) {
  const query = payload.query?.trim() || "";
  if (!query) {
    return NextResponse.json(
      { error: "Missing required 'query' parameter." },
      { status: 400 }
    );
  }

  const topK = parseInteger(payload.topK ?? payload.resultLimit, 24, 1, 120);
  const resultLimit = parseInteger(payload.resultLimit, 10, 1, 50);
  const typeFilter = normalizeTypeFilter(payload.typeFilter);
  const includePatientDocuments = parseBoolean(
    payload.includePatientDocuments,
    true
  );
  const skipDbValidation = parseBoolean(payload.skipDbValidation, false);
  const maxChunks = parseInteger(payload.maxChunks, 5, 1, 20);
  const maxChunkChars = parseInteger(payload.maxChunkChars, 1800, 100, 50000);
  const maxTotalChars = parseInteger(payload.maxTotalChars, 7000, 500, 100000);

  const startTime = Date.now();

  // ---------------------------------------------------------------------------
  // Step 1: Resolve patient identity
  // ---------------------------------------------------------------------------
  const patientResolution = await resolvePatientIds(
    payload.patientUserId,
    payload.patientProfileId,
    payload.appointmentId
  );

  const {
    resolvedPatientUserId,
    resolvedPatientProfileId,
    patientName,
    warnings,
  } = patientResolution;

  // ---------------------------------------------------------------------------
  // Step 2: Semantic retrieval (isolated — no structured retrieval)
  // ---------------------------------------------------------------------------
  const retrievalStartTime = Date.now();

  const semanticChunks = await searchVectorDatabase(
    query,
    topK,
    typeFilter,
    {
      includePatientDocuments,
      patientProfileId: resolvedPatientProfileId ?? null,
      patientUserId: resolvedPatientUserId ?? null,
      skipDbValidation,
    }
  ).catch((error) => {
    warnings.push(
      `Semantic retrieval failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return [] as Awaited<ReturnType<typeof searchVectorDatabase>>;
  });

  const retrievalLatencyMs = Date.now() - retrievalStartTime;

  // ---------------------------------------------------------------------------
  // Step 3: Merge into generation context (same logic as chat route semantic mode)
  // ---------------------------------------------------------------------------
  const mergeStartTime = Date.now();

  const mergedContext = mergeRetrievedChunks({
    semanticChunks,
    maxChunks,
    maxChunkChars,
    maxTotalChars,
    prioritizeStructured: false,
  });

  const mergeLatencyMs = Date.now() - mergeStartTime;
  const totalLatencyMs = Date.now() - startTime;

  // ---------------------------------------------------------------------------
  // Response
  // ---------------------------------------------------------------------------
  return NextResponse.json({
    ok: true,
    query,
    patient: {
      resolvedPatientUserId,
      resolvedPatientProfileId,
      patientName,
    },
    warnings,
    request: {
      topK,
      resultLimit,
      typeFilter,
      includePatientDocuments,
      skipDbValidation,
      maxChunks,
      maxChunkChars,
      maxTotalChars,
    },
    environment: {
      pineconeIndexNameSet: Boolean(process.env.PINECONE_INDEX_NAME?.trim()),
      pineconeIndexHostSet: Boolean(process.env.PINECONE_INDEX_HOST?.trim()),
      pineconeNamespace: process.env.PINECONE_NAMESPACE?.trim() || null,
      voyageApiKeySet: Boolean(process.env.VOYAGE_API_KEY?.trim()),
    },
    semanticRetrieval: {
      totalMatches: semanticChunks.length,
      latencyMs: retrievalLatencyMs,
      results: semanticChunks.slice(0, resultLimit).map((chunk, index) => ({
        rank: index + 1,
        parentChunkId: chunk.parentChunkId,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        score: Number(chunk.score.toFixed(6)),
        parentTextPreview: chunk.parentText.slice(0, 700),
        parentTextLength: chunk.parentText.length,
      })),
    },
    mergedContext: {
      totalChunks: mergedContext.chunks.length,
      mergeLatencyMs,
      chunks: mergedContext.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        kind: chunk.kind,
        title: chunk.title,
        score: chunk.score,
        textPreview: chunk.text.slice(0, 700),
        textLength: chunk.text.length,
      })),
      citations: mergedContext.citations,
      // This is the exact context block that would be sent to the LLM
      contextBlockForLLM: mergedContext.contextBlock,
    },
    latencyMs: {
      retrieval: retrievalLatencyMs,
      merge: mergeLatencyMs,
      total: totalLatencyMs,
    },
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  return runSemanticRetrievalDebug({
    query: searchParams.get("query") ?? searchParams.get("q") ?? undefined,
    patientUserId: searchParams.get("patientUserId") ?? undefined,
    patientProfileId: searchParams.get("patientProfileId") ?? undefined,
    appointmentId: searchParams.get("appointmentId") ?? undefined,
    topK: searchParams.has("topK")
      ? Number(searchParams.get("topK"))
      : undefined,
    typeFilter: (searchParams.get("typeFilter") ??
      searchParams.get("type") ??
      undefined) as RetrievalTypeFilter | undefined,
    includePatientDocuments: searchParams.get("includePatientDocuments") ??
      undefined,
    maxChunks: searchParams.has("maxChunks")
      ? Number(searchParams.get("maxChunks"))
      : undefined,
    maxChunkChars: searchParams.has("maxChunkChars")
      ? Number(searchParams.get("maxChunkChars"))
      : undefined,
    maxTotalChars: searchParams.has("maxTotalChars")
      ? Number(searchParams.get("maxTotalChars"))
      : undefined,
    resultLimit: searchParams.has("resultLimit")
      ? Number(searchParams.get("resultLimit"))
      : undefined,
    skipDbValidation: searchParams.get("skipDbValidation") ?? undefined,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SemanticDebugRequest;
  return runSemanticRetrievalDebug(body);
}
