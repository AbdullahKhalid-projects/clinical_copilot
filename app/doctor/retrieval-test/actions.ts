"use server";

import { searchVectorDatabase } from "@/retrieval_actions/actions";
import {
  mergeRetrievedChunks,
  structuredResultToChunks,
} from "@/retrieval_actions/generation";
import {
  classifyQueryIntent,
  type ClassifiedIntent,
} from "@/retrieval_actions/intentClassifier";
import {
  runStructuredRetrievalForPatient,
} from "@/app/actions/structuredRetrievalActions";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types for the debug response
// ---------------------------------------------------------------------------

export interface RetrievalDebugResult {
  ok: boolean;
  query: string;
  patient: {
    resolvedPatientUserId: string | null;
    resolvedPatientProfileId: string | null;
    patientName: string | null;
  };
  warnings: string[];
  patientDataSummary: {
    totalReportValues: number;
    totalReports: number;
    totalDocuments: number;
    distinctMetricKeys: string[];
    sampleValues: Array<{
      key: string;
      keyNormalized: string | null;
      value: string;
      unit: string | null;
      observedAt: string | null;
    }>;
  } | null;
  pipeline: {
    intentClassification: {
      result: {
        intent: string;
        metricQuery?: string;
        timeWindowDays?: number;
        startDate?: string;
        endDate?: string;
      };
      latencyMs: number;
    };
    structuredRetrieval: {
      wasExecuted: boolean;
      skipReason: string | null;
      rawResult: unknown;
      convertedToChunks: Array<{
        title: string;
        text: string;
        score?: number;
      }>;
    };
    semanticRetrieval: {
      totalMatches: number;
      results: Array<{
        rank: number;
        parentChunkId: string;
        documentId: string;
        documentTitle: string;
        score: number;
        parentTextPreview: string;
        parentTextLength: number;
      }>;
    };
    mergedContext: {
      totalChunks: number;
      chunks: Array<{
        chunkId: string;
        kind: string;
        title: string;
        score: number;
        textPreview: string;
        textLength: number;
      }>;
      contextBlockForLLM: string;
    };
    retrievalLatencyMs: number;
    totalLatencyMs: number;
  };
}

type RetrievalDebugOptions = {
  forcedStructuredMetric?: string;
};

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

export async function runRetrievalDebug(
  query: string,
  patientUserId: string,
  patientProfileId: string,
  options?: RetrievalDebugOptions
): Promise<RetrievalDebugResult> {
  const trimmedQuery = query.trim();
  const forcedMetricQuery = options?.forcedStructuredMetric?.trim() || null;
  if (!trimmedQuery) {
    return {
      ok: false,
      query: "",
      patient: { resolvedPatientUserId: null, resolvedPatientProfileId: null, patientName: null },
      warnings: ["Query is empty."],
      patientDataSummary: null,
      pipeline: {
        intentClassification: { result: { intent: "GENERAL" }, latencyMs: 0 },
        structuredRetrieval: { wasExecuted: false, skipReason: "Empty query", rawResult: null, convertedToChunks: [] },
        semanticRetrieval: { totalMatches: 0, results: [] },
        mergedContext: { totalChunks: 0, chunks: [], contextBlockForLLM: "" },
        retrievalLatencyMs: 0,
        totalLatencyMs: 0,
      },
    };
  }

  const warnings: string[] = [];
  const startTime = Date.now();
  const resolvedPatientUserId = patientUserId.trim() || null;
  const resolvedPatientProfileId = patientProfileId.trim() || null;

  // Resolve patient name
  let patientName: string | null = null;
  if (resolvedPatientUserId) {
    const user = await prisma.user.findUnique({
      where: { id: resolvedPatientUserId },
      select: { name: true, email: true },
    });
    patientName = user?.name || user?.email || null;
    if (!user) {
      warnings.push(`patientUserId "${resolvedPatientUserId}" not found in DB.`);
    }
  }

  // Patient data summary
  let patientDataSummary: RetrievalDebugResult["patientDataSummary"] = null;
  if (resolvedPatientUserId) {
    const [totalReportValues, totalReports, totalDocuments, distinctKeys, sampleValues] =
      await Promise.all([
        prisma.medicalReportValue.count({ where: { userId: resolvedPatientUserId } }),
        prisma.medicalReport.count({ where: { userId: resolvedPatientUserId } }),
        prisma.document.count({ where: { userId: resolvedPatientUserId, type: "PATIENT" } }),
        prisma.medicalReportValue
          .findMany({
            where: { userId: resolvedPatientUserId },
            select: { keyNormalized: true },
            distinct: ["keyNormalized"],
          })
          .then((rows) =>
            rows.map((r) => r.keyNormalized).filter((k): k is string => k !== null).sort()
          ),
        prisma.medicalReportValue.findMany({
          where: { userId: resolvedPatientUserId },
          select: { key: true, keyNormalized: true, value: true, unit: true, observedAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

    patientDataSummary = {
      totalReportValues,
      totalReports,
      totalDocuments,
      distinctMetricKeys: distinctKeys,
      sampleValues: sampleValues.map((v) => ({
        ...v,
        observedAt: v.observedAt?.toISOString() ?? null,
      })),
    };
  }

  // Intent classification (or deterministic metric mode from a metric click)
  let classifiedIntent: ClassifiedIntent;
  let intentLatencyMs = 0;

  if (forcedMetricQuery) {
    classifiedIntent = {
      intent: "GET_METRIC_HISTORY",
      metricQuery: forcedMetricQuery,
    };
  } else {
    const intentStart = Date.now();
    classifiedIntent = await classifyQueryIntent(trimmedQuery);
    intentLatencyMs = Date.now() - intentStart;
  }

  const isMetricIntent = classifiedIntent.intent !== "GENERAL";
  const canDoStructured = isMetricIntent && resolvedPatientUserId;
  const semanticQuery = forcedMetricQuery
    ? `Metric history for ${forcedMetricQuery}`
    : trimmedQuery;

  // Parallel retrieval
  const retrievalStart = Date.now();

  const [semanticChunks, structuredResult] = await Promise.all([
    searchVectorDatabase(semanticQuery, 50, "all", {
      includePatientDocuments: true,
      patientProfileId: resolvedPatientProfileId,
      patientUserId: resolvedPatientUserId,
    }).catch((error) => {
      warnings.push(`Semantic retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
      return [] as Awaited<ReturnType<typeof searchVectorDatabase>>;
    }),

    canDoStructured
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

  const retrievalLatencyMs = Date.now() - retrievalStart;

  // Merge
  const structuredChunks = structuredResultToChunks(structuredResult);
  const mergedContext = mergeRetrievedChunks({
    semanticChunks,
    structuredChunks,
    maxChunks: 8,
    maxTotalChars: 9000,
    prioritizeStructured: true,
  });

  const totalLatencyMs = Date.now() - startTime;

  return {
    ok: true,
    query: trimmedQuery,
    patient: {
      resolvedPatientUserId,
      resolvedPatientProfileId,
      patientName,
    },
    warnings,
    patientDataSummary,
    pipeline: {
      intentClassification: {
        result: classifiedIntent,
        latencyMs: intentLatencyMs,
      },
      structuredRetrieval: {
        wasExecuted: Boolean(canDoStructured),
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
        contextBlockForLLM: mergedContext.contextBlock,
      },
      retrievalLatencyMs,
      totalLatencyMs,
    },
  };
}

export async function runMetricHistoryDebug(
  metricKey: string,
  patientUserId: string,
  patientProfileId: string
): Promise<RetrievalDebugResult> {
  const trimmedMetric = metricKey.trim();
  if (!trimmedMetric) {
    throw new Error("Metric key is required");
  }

  return runRetrievalDebug(
    `Show me the history for ${trimmedMetric}`,
    patientUserId,
    patientProfileId,
    { forcedStructuredMetric: trimmedMetric }
  );
}
