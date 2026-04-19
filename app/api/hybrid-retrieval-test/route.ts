import { NextResponse } from "next/server";
import { searchVectorDatabase } from "@/retrieval_actions/actions";
import {
  mergeRetrievedChunks,
  structuredResultToChunks,
} from "@/retrieval_actions/generation";
import {
  classifyQueryIntent,
} from "@/retrieval_actions/intentClassifier";
import {
  runStructuredRetrievalForPatient,
} from "@/app/actions/structuredRetrievalActions";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Hybrid retrieval debug endpoint
// ---------------------------------------------------------------------------
// Shows exactly what the chatbot retrieves BEFORE passing to the LLM.
// Useful for verifying patient-scoped structured + semantic retrieval.
//
// Usage:
//   GET /api/hybrid-retrieval-test?query=blood+pressure+history&patientUserId=...&patientProfileId=...
//   POST /api/hybrid-retrieval-test  { query, patientUserId, patientProfileId }
// ---------------------------------------------------------------------------

interface DebugRequest {
  query?: string;
  patientUserId?: string | null;
  patientProfileId?: string | null;
  semanticTopK?: number;
  maxContextChunks?: number;
}

export const runtime = "nodejs";

async function resolvePatientIds(
  patientUserId?: string | null,
  patientProfileId?: string | null
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

  // If we have a profile ID but no user ID, resolve it
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

  // If we have a user ID, try to get the name and profile
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

  if (!resolvedUserId) {
    warnings.push("No patientUserId resolved. Structured retrieval will be skipped.");
  }

  return {
    resolvedPatientUserId: resolvedUserId,
    resolvedPatientProfileId: resolvedProfileId,
    patientName,
    warnings,
  };
}

async function runDebug(payload: DebugRequest) {
  const query = payload.query?.trim() || "";
  if (!query) {
    return NextResponse.json(
      { error: "Missing required 'query' parameter." },
      { status: 400 }
    );
  }

  const semanticTopK = Math.min(Math.max(payload.semanticTopK || 50, 1), 200);
  const maxContextChunks = Math.min(Math.max(payload.maxContextChunks || 8, 1), 20);
  const startTime = Date.now();

  // ---------------------------------------------------------------------------
  // Step 0: Resolve patient identity
  // ---------------------------------------------------------------------------
  const patientResolution = await resolvePatientIds(
    payload.patientUserId,
    payload.patientProfileId
  );

  const { resolvedPatientUserId, resolvedPatientProfileId, patientName, warnings } =
    patientResolution;

  // ---------------------------------------------------------------------------
  // Step 1: Quick DB check — how many MedicalReportValues does this patient have?
  // ---------------------------------------------------------------------------
  let patientDataSummary: {
    totalReportValues: number;
    totalReports: number;
    totalDocuments: number;
    distinctMetricKeys: string[];
    sampleValues: Array<{
      key: string;
      keyNormalized: string | null;
      value: string;
      unit: string | null;
      observedAt: Date | null;
    }>;
  } | null = null;

  if (resolvedPatientUserId) {
    const [totalReportValues, totalReports, totalDocuments, distinctKeys, sampleValues] =
      await Promise.all([
        prisma.medicalReportValue.count({
          where: { userId: resolvedPatientUserId },
        }),
        prisma.medicalReport.count({
          where: { userId: resolvedPatientUserId },
        }),
        prisma.document.count({
          where: { userId: resolvedPatientUserId, type: "PATIENT" },
        }),
        prisma.medicalReportValue
          .findMany({
            where: { userId: resolvedPatientUserId },
            select: { keyNormalized: true },
            distinct: ["keyNormalized"],
          })
          .then((rows) =>
            rows
              .map((r) => r.keyNormalized)
              .filter((k): k is string => k !== null)
              .sort()
          ),
        prisma.medicalReportValue.findMany({
          where: { userId: resolvedPatientUserId },
          select: {
            key: true,
            keyNormalized: true,
            value: true,
            unit: true,
            observedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

    patientDataSummary = {
      totalReportValues,
      totalReports,
      totalDocuments,
      distinctMetricKeys: distinctKeys,
      sampleValues,
    };
  }

  // ---------------------------------------------------------------------------
  // Step 2: Intent classification (Mistral)
  // ---------------------------------------------------------------------------
  const intentStartTime = Date.now();
  const classifiedIntent = await classifyQueryIntent(query);
  const intentLatencyMs = Date.now() - intentStartTime;

  const isMetricIntent = classifiedIntent.intent !== "GENERAL";
  const canDoStructuredRetrieval = isMetricIntent && resolvedPatientUserId;

  // ---------------------------------------------------------------------------
  // Step 3: Parallel retrieval
  // ---------------------------------------------------------------------------
  const retrievalStartTime = Date.now();

  const [semanticChunks, structuredResult] = await Promise.all([
    searchVectorDatabase(query, semanticTopK, "all", {
      includePatientDocuments: true,
      patientProfileId: resolvedPatientProfileId ?? null,
      patientUserId: resolvedPatientUserId ?? null,
    }).catch((error) => {
      warnings.push(`Semantic retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
      return [] as Awaited<ReturnType<typeof searchVectorDatabase>>;
    }),

    canDoStructuredRetrieval
      ? runStructuredRetrievalForPatient(resolvedPatientUserId!, {
          intent: classifiedIntent.intent as Exclude<typeof classifiedIntent.intent, "GENERAL">,
          metricQuery: classifiedIntent.metricQuery,
          timeWindowDays: classifiedIntent.timeWindowDays,
          startDate: classifiedIntent.startDate,
          endDate: classifiedIntent.endDate,
        }).catch((error) => {
          warnings.push(`Structured retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const retrievalLatencyMs = Date.now() - retrievalStartTime;

  // ---------------------------------------------------------------------------
  // Step 4: Merge (same logic the chat route uses)
  // ---------------------------------------------------------------------------
  const structuredChunks = structuredResultToChunks(structuredResult);

  const mergedContext = mergeRetrievedChunks({
    semanticChunks,
    structuredChunks,
    maxChunks: maxContextChunks,
    maxTotalChars: 9000,
    prioritizeStructured: true,
  });

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

    // What data exists for this patient in the DB
    patientDataSummary,

    // Step-by-step pipeline results
    pipeline: {
      intentClassification: {
        result: classifiedIntent,
        latencyMs: intentLatencyMs,
      },

      structuredRetrieval: {
        wasExecuted: canDoStructuredRetrieval,
        skipReason: !isMetricIntent
          ? "Intent was GENERAL — no metric query detected"
          : !resolvedPatientUserId
            ? "No patientUserId available"
            : null,
        rawResult: structuredResult,
        convertedToChunks: structuredChunks,
      },

      semanticRetrieval: {
        totalMatches: semanticChunks.length,
        results: semanticChunks.map((chunk, index) => ({
          rank: index + 1,
          parentChunkId: chunk.parentChunkId,
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle,
          score: Number(chunk.score.toFixed(6)),
          parentTextPreview: chunk.parentText.slice(0, 500),
          parentTextLength: chunk.parentText.length,
        })),
      },

      mergedContext: {
        totalChunks: mergedContext.chunks.length,
        chunks: mergedContext.chunks.map((chunk) => ({
          chunkId: chunk.chunkId,
          kind: chunk.kind,
          title: chunk.title,
          score: chunk.score,
          textPreview: chunk.text.slice(0, 500),
          textLength: chunk.text.length,
        })),
        citations: mergedContext.citations,
        // This is what gets sent to the LLM as context
        contextBlockForLLM: mergedContext.contextBlock,
      },

      retrievalLatencyMs,
      totalLatencyMs,
    },
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  return runDebug({
    query: searchParams.get("query") ?? searchParams.get("q") ?? undefined,
    patientUserId: searchParams.get("patientUserId") ?? undefined,
    patientProfileId: searchParams.get("patientProfileId") ?? undefined,
    semanticTopK: searchParams.has("topK")
      ? Number(searchParams.get("topK"))
      : undefined,
    maxContextChunks: searchParams.has("maxChunks")
      ? Number(searchParams.get("maxChunks"))
      : undefined,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as DebugRequest;
  return runDebug(body);
}
