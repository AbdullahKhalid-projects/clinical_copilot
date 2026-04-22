import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText, tool, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { buildGenerationPrompt, mergeRetrievedChunks, structuredResultToChunks } from "@/retrieval_actions/generation";
import {
  classifyQueryIntent,
  type ClassifiedIntent,
} from "@/retrieval_actions/intentClassifier";
import {
  runStructuredRetrievalForPatient,
  type StructuredRetrievalResult,
} from "@/app/actions/structuredRetrievalActions";
import { prisma } from "@/lib/prisma";
import { resolveMetricQuery } from "@/retrieval_actions/metricQueryResolver";
import { CANONICAL_METRICS } from "@/retrieval_actions/metricAliasDictionary";
import { z } from "zod";

const SYSTEM_PROMPT =
  "You are Shifa, a clinical copilot assistant. Give concise, clinically useful responses, acknowledge uncertainty, and suggest next best questions when appropriate.";

const RAG_MODEL_BASE_URL =
  "https://muddasirjaved666--example-qwen3-6-35b-a3b-awq-inference--b0eb28.modal.run/v1";
const RAG_MODEL_NAME = "cyankiwi/Qwen3.6-35B-A3B-AWQ-4bit";
const RAG_MODEL_API_KEY = process.env.RAG_MODEL_API_KEY ?? "dummy-key";
const RAG_EMPTY_204_RETRY_COUNT = Math.max(
  0,
  Number.parseInt(process.env.RAG_EMPTY_204_RETRY_COUNT ?? "1", 10) || 1
);
const RAG_5XX_RETRY_COUNT = Math.max(
  0,
  Number.parseInt(process.env.RAG_5XX_RETRY_COUNT ?? "2", 10) || 2
);
const RAG_RETRY_BASE_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.RAG_RETRY_BASE_DELAY_MS ?? "250", 10) || 250
);
const STRUCTURED_TOOL_CALLING_ENABLED =
  (process.env.STRUCTURED_TOOL_CALLING_ENABLED ?? "false").toLowerCase() === "true";
const STRUCTURED_TOOL_DEBUG_LOGS_ENABLED =
  (process.env.STRUCTURED_TOOL_DEBUG_LOGS_ENABLED ?? "true").toLowerCase() === "true";
const CHAT_DEBUG_LOGS_ENABLED =
  (process.env.CHAT_DEBUG_LOGS_ENABLED ?? "true").toLowerCase() === "true";
const RAG_MAX_CONTEXT_CHUNKS = 8;
const RAG_MAX_CHUNK_CHARS = 14000;
const RAG_MAX_TOTAL_CHARS = 28000;
const STRUCTURED_HISTORY_MAX_ITEMS = 300;
const TOOL_RESULT_MAX_CHUNKS = 4;
const TOOL_RESULT_MAX_CHUNK_CHARS = 3200;
const TOOL_RESULT_MAX_TOTAL_CHARS = 9000;
const CONVERSATION_CONTEXT_MAX_MESSAGES = 6;
const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

// Uses an OpenAI-compatible endpoint hosted outside OpenAI (Modal/vLLM).
const ragModelProvider = createOpenAI({
  baseURL: RAG_MODEL_BASE_URL,
  apiKey: RAG_MODEL_API_KEY,
  fetch: async (input, init) => {
    const requestUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    const withPreserveThinking = (requestInit: RequestInit | undefined): RequestInit | undefined => {
      if (!requestUrl.includes("/chat/completions")) {
        return requestInit;
      }

      if (!requestInit?.body || typeof requestInit.body !== "string") {
        return requestInit;
      }

      try {
        const parsed = JSON.parse(requestInit.body) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return requestInit;
        }

        const existingKwargsRaw = parsed.chat_template_kwargs;
        const existingKwargs =
          existingKwargsRaw && typeof existingKwargsRaw === "object" && !Array.isArray(existingKwargsRaw)
            ? (existingKwargsRaw as Record<string, unknown>)
            : {};

        const nextBody = JSON.stringify({
          ...parsed,
          chat_template_kwargs: {
            ...existingKwargs,
            preserve_thinking: true,
          },
        });

        const nextHeaders = new Headers(requestInit.headers);
        nextHeaders.delete("content-length");

        return {
          ...requestInit,
          headers: nextHeaders,
          body: nextBody,
        };
      } catch {
        return requestInit;
      }
    };

    const attemptFetch = async () => fetch(input, withPreserveThinking(init));
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const shouldRetry5xx = (status: number) => [500, 502, 503, 504].includes(status);

    let response = await attemptFetch();
    let emptyBodyAttempts = 0;
    let serverErrorAttempts = 0;
    let totalAttempts = 0;

    while (true) {
      totalAttempts += 1;

      if (response.status === 204 && emptyBodyAttempts < RAG_EMPTY_204_RETRY_COUNT) {
        emptyBodyAttempts += 1;
        console.warn(
          `Modal endpoint returned HTTP 204 (empty body). Retrying ${emptyBodyAttempts}/${RAG_EMPTY_204_RETRY_COUNT}.`
        );
        await sleep(RAG_RETRY_BASE_DELAY_MS * emptyBodyAttempts);
        response = await attemptFetch();
        continue;
      }

      if (shouldRetry5xx(response.status) && serverErrorAttempts < RAG_5XX_RETRY_COUNT) {
        serverErrorAttempts += 1;
        console.warn(
          `Modal endpoint returned HTTP ${response.status}. Retrying ${serverErrorAttempts}/${RAG_5XX_RETRY_COUNT}.`
        );
        await sleep(RAG_RETRY_BASE_DELAY_MS * serverErrorAttempts);
        response = await attemptFetch();
        continue;
      }

      if (CHAT_DEBUG_LOGS_ENABLED && totalAttempts > 1) {
        console.info("Modal upstream retry summary", {
          finalStatus: response.status,
          totalAttempts,
          emptyBodyAttempts,
          serverErrorAttempts,
        });
      }

      return response;
    }
  },
});

function longestTagPrefixAtEnd(text: string, tag: string): number {
  const maxLength = Math.min(text.length, tag.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (text.endsWith(tag.slice(0, length))) {
      return length;
    }
  }

  return 0;
}

function createStripThinkTransform() {
  let pending = "";
  let insideThink = false;

  const stripInternalChunkRefs = (value: string): string =>
    value
      .replace(/\s*\[CTX-(?:[A-Z]-)?\d+\]/gi, "")
      .replace(/\bCTX-(?:[A-Z]-)?\d+\b/gi, "")
      .replace(/\s{2,}/g, " ");

  const processText = (incomingText: string): string => {
    const combined = `${pending}${incomingText}`;
    const lowered = combined.toLowerCase();
    pending = "";

    let output = "";
    let cursor = 0;

    while (cursor < combined.length) {
      if (insideThink) {
        const closeIndex = lowered.indexOf(THINK_CLOSE_TAG, cursor);
        if (closeIndex === -1) {
          const remainder = lowered.slice(cursor);
          const closeTail = longestTagPrefixAtEnd(remainder, THINK_CLOSE_TAG);
          if (closeTail > 0) {
            pending = combined.slice(combined.length - closeTail);
          }
          return output;
        }

        cursor = closeIndex + THINK_CLOSE_TAG.length;
        insideThink = false;
        continue;
      }

      const openIndex = lowered.indexOf(THINK_OPEN_TAG, cursor);
      const closeIndex = lowered.indexOf(THINK_CLOSE_TAG, cursor);

      if (openIndex === -1 && closeIndex === -1) {
        const remainder = combined.slice(cursor);
        const remainderLowered = lowered.slice(cursor);
        const tailLength = Math.max(
          longestTagPrefixAtEnd(remainderLowered, THINK_OPEN_TAG),
          longestTagPrefixAtEnd(remainderLowered, THINK_CLOSE_TAG)
        );

        if (tailLength > 0) {
          output += remainder.slice(0, remainder.length - tailLength);
          pending = remainder.slice(remainder.length - tailLength);
        } else {
          output += remainder;
        }

        return output;
      }

      const nextTagIndex =
        openIndex === -1
          ? closeIndex
          : closeIndex === -1
            ? openIndex
            : Math.min(openIndex, closeIndex);

      if (nextTagIndex > cursor) {
        output += combined.slice(cursor, nextTagIndex);
      }

      if (nextTagIndex === openIndex) {
        cursor = openIndex + THINK_OPEN_TAG.length;
        insideThink = true;
      } else {
        cursor = closeIndex + THINK_CLOSE_TAG.length;
      }
    }

    return output;
  };

  return () =>
    new TransformStream<any, any>({
      transform(part, controller) {
        if (!part || typeof part !== "object") {
          controller.enqueue(part);
          return;
        }

        if (part.type === "text-delta" && typeof part.delta === "string") {
          const sanitizedDelta = stripInternalChunkRefs(processText(part.delta));
          if (sanitizedDelta.length === 0) {
            return;
          }

          controller.enqueue({
            ...part,
            delta: sanitizedDelta,
          });
          return;
        }

        if (part.type === "text" && typeof part.text === "string") {
          const sanitizedText = stripInternalChunkRefs(processText(part.text));
          if (sanitizedText.length === 0) {
            return;
          }

          controller.enqueue({
            ...part,
            text: sanitizedText,
          });
          return;
        }

        controller.enqueue(part);
      },
    });
}

function formatChatStreamError(error: unknown): string {
  const fallback =
    "I ran into a temporary model response issue while generating your answer. Please retry in a moment.";

  if (!error || typeof error !== "object") {
    return fallback;
  }

  const maybeError = error as {
    statusCode?: number;
    message?: string;
    cause?: unknown;
  };

  if (maybeError.statusCode === 204) {
    return "The model endpoint returned an empty response (HTTP 204). Please try again.";
  }

  if (maybeError.statusCode === 500) {
    return "The model endpoint returned an internal error (HTTP 500). Please retry in a few seconds.";
  }

  const message = typeof maybeError.message === "string" ? maybeError.message.toLowerCase() : "";
  if (message.includes("empty response body")) {
    return "The model endpoint returned an empty response. Please try again.";
  }

  return fallback;
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0)
    .join(" ")
    .trim();
}

function getLatestUserQuery(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    const text = getMessageText(message);
    if (text.length > 0) {
      return text;
    }
  }

  return "";
}

function getConversationContext(messages: UIMessage[]): string {
  const recent = messages
    .slice(-CONVERSATION_CONTEXT_MAX_MESSAGES)
    .map((message) => {
      const text = getMessageText(message);
      if (!text) {
        return null;
      }

      return `${message.role}: ${text}`;
    })
    .filter((line): line is string => line !== null);

  return recent.join("\n");
}

type ChatContextPayload = {
  appointmentId?: string | null;
  patientProfileId?: string | null;
  patientUserId?: string | null;
  patientMetricCatalog?: string[] | null;
  includePatientDocuments?: boolean;
};

const STRUCTURED_TOOL_INTENTS = [
  "GET_LATEST_METRIC",
  "GET_METRIC_HISTORY",
  "GET_METRIC_TREND",
  "GET_ABNORMAL_READINGS",
] as const;

type StructuredToolIntent = (typeof STRUCTURED_TOOL_INTENTS)[number];

type StructuredToolInput = {
  intent: StructuredToolIntent;
  metricQuery?: string;
  timeWindowDays?: number;
  startDate?: string;
  endDate?: string;
};

type StructuredToolResult = {
  ok: boolean;
  intent: StructuredToolIntent;
  requestedMetric: string | null;
  resolvedMetric: string | null;
  mapping: {
    strategy: "exact" | "contains" | "fuzzy" | "none";
    score: number;
  } | null;
  confidence?: {
    level: string;
    score: number;
    rationale: string[];
  };
  structuredChunks: Array<{ title: string; text: string; score?: number }>;
  error?: string;
};

type LatestReportsToolResult = {
  ok: boolean;
  maxReports: number;
  reports: Array<{
    id: string;
    title: string;
    reportDate: string | null;
    createdAt: string;
    hospitalName: string | null;
    reportLink: string | null;
  }>;
  latestReportsTable: string;
  error?: string;
};

function formatStructuredToolOutput(result: StructuredToolResult): string {
  if (!result.ok) {
    return `Tool execution failed: ${result.error ?? "Unknown structured retrieval error."}`;
  }

  const chunksText = result.structuredChunks
    .map((chunk) => `### ${chunk.title}\n${chunk.text}`)
    .join("\n\n");

  return `Tool executed successfully for metric: ${result.resolvedMetric ?? "unknown"}\n\nResults:\n${chunksText}`;
}

function formatLatestReportsToolOutput(result: LatestReportsToolResult): string {
  if (!result.ok) {
    return `Failed to get reports: ${result.error ?? "Unknown latest report retrieval error."}`;
  }

  return `Successfully retrieved latest reports.\n\n${result.latestReportsTable}`;
}

function trimToolResultText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function boundToolResultChunks(
  chunks: Array<{ title: string; text: string; score?: number }>
): Array<{ title: string; text: string; score?: number }> {
  const limitedByCount = chunks.slice(0, TOOL_RESULT_MAX_CHUNKS);
  let totalChars = 0;
  const bounded: Array<{ title: string; text: string; score?: number }> = [];

  for (const chunk of limitedByCount) {
    const boundedText = trimToolResultText(chunk.text, TOOL_RESULT_MAX_CHUNK_CHARS);
    const projected = totalChars + chunk.title.length + boundedText.length;

    if (projected > TOOL_RESULT_MAX_TOTAL_CHARS) {
      break;
    }

    bounded.push({
      title: chunk.title,
      text: boundedText,
      score: chunk.score,
    });
    totalChars = projected;
  }

  if (bounded.length === 0 && chunks.length > 0) {
    const first = chunks[0];
    return [
      {
        title: first.title,
        text: trimToolResultText(first.text, Math.min(TOOL_RESULT_MAX_CHUNK_CHARS, 1200)),
        score: first.score,
      },
    ];
  }

  if (bounded.length < chunks.length) {
    bounded.push({
      title: "Structured tool output note",
      text:
        "Tool output was truncated for model stability. Ask follow-up requests for additional rows or narrower time windows.",
      score: 1,
    });
  }

  return bounded;
}

function normalizeMetricKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenizeMetric(value: string): string[] {
  return normalizeMetricKey(value)
    .split(" ")
    .filter((token) => token.length > 0);
}

function tokenOverlapScore(a: string, b: string): number {
  const aTokens = tokenizeMetric(a);
  const bTokens = tokenizeMetric(b);
  if (aTokens.length === 0 || bTokens.length === 0) {
    return 0;
  }

  const bSet = new Set(bTokens);
  let overlap = 0;
  for (const token of aTokens) {
    if (bSet.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(aTokens.length, bTokens.length);
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );

  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function normalizedLevenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) {
    return 1;
  }

  return 1 - levenshteinDistance(a, b) / maxLen;
}

function getMetricAliasCandidates(metricQuery: string): string[] {
  const resolution = resolveMetricQuery(metricQuery);

  const directCandidates = [
    metricQuery,
    resolution.canonicalKey,
    resolution.normalizedQuery,
    resolution.suggestedCanonicalKey,
  ]
    .filter((value): value is string => Boolean(value && value.length > 0))
    .map((value) => normalizeMetricKey(value));

  const canonicalCandidates = [resolution.canonicalKey, resolution.suggestedCanonicalKey]
    .filter((value): value is string => Boolean(value && value.length > 0))
    .map((value) => normalizeMetricKey(value));

  const expandedAliases = CANONICAL_METRICS.flatMap((definition) => {
    const normalizedCanonical = normalizeMetricKey(definition.canonicalKey);
    if (!canonicalCandidates.includes(normalizedCanonical)) {
      return [];
    }

    return [definition.canonicalKey, ...definition.aliases].map((item) => normalizeMetricKey(item));
  });

  return Array.from(new Set([...directCandidates, ...expandedAliases]));
}

function resolveMetricAgainstCatalog(
  metricQuery: string,
  patientMetricCatalog: string[]
): { matchedMetric: string | null; strategy: "exact" | "contains" | "fuzzy" | "none"; score: number } {
  if (!metricQuery || patientMetricCatalog.length === 0) {
    return { matchedMetric: null, strategy: "none", score: 0 };
  }

  const catalog = Array.from(new Set(patientMetricCatalog.map((item) => normalizeMetricKey(item))));
  const catalogSet = new Set(catalog);
  const aliasCandidates = getMetricAliasCandidates(metricQuery);

  const exactMatch = aliasCandidates.find((candidate) => catalogSet.has(candidate));
  if (exactMatch) {
    return {
      matchedMetric: exactMatch,
      strategy: "exact",
      score: 1,
    };
  }

  const containsMatch = catalog.find((metricKey) =>
    aliasCandidates.some(
      (candidate) =>
        candidate.length >= 4 && (metricKey.includes(candidate) || candidate.includes(metricKey))
    )
  );
  if (containsMatch) {
    return {
      matchedMetric: containsMatch,
      strategy: "contains",
      score: 0.84,
    };
  }

  const scored = catalog
    .map((metricKey) => ({
      metricKey,
      score: aliasCandidates.reduce((best, candidate) => {
        const overlap = tokenOverlapScore(candidate, metricKey);
        const typoSimilarity = normalizedLevenshteinSimilarity(candidate, metricKey) * 0.9;
        return Math.max(best, overlap, typoSimilarity);
      }, 0),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.72) {
    return { matchedMetric: null, strategy: "none", score: best?.score ?? 0 };
  }

  return {
    matchedMetric: best.metricKey,
    strategy: "fuzzy",
    score: Number(best.score.toFixed(3)),
  };
}

async function getPatientMetricCatalog(
  patientUserId: string,
  requestedCatalog: string[] | null | undefined
): Promise<string[]> {
  const fromContext = Array.isArray(requestedCatalog)
    ? requestedCatalog
        .map((item) => normalizeMetricKey(String(item || "")))
        .filter((item) => item.length > 0)
    : [];

  if (fromContext.length > 0) {
    return Array.from(new Set(fromContext));
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

  return Array.from(
    new Set(
      rows
        .map((row) => row.keyNormalized)
        .filter((value): value is string => Boolean(value && value.length > 0))
        .map((value) => normalizeMetricKey(value))
    )
  );
}

async function resolvePatientUserId(chatContext: ChatContextPayload): Promise<string | null> {
  const directUserId = chatContext.patientUserId?.trim() || null;
  if (directUserId) {
    return directUserId;
  }

  const patientProfileId = chatContext.patientProfileId?.trim() || null;
  if (patientProfileId) {
    const profile = await prisma.patientProfile.findUnique({
      where: { id: patientProfileId },
      select: { userId: true },
    });

    if (profile?.userId) {
      return profile.userId;
    }
  }

  const appointmentId = chatContext.appointmentId?.trim() || null;
  if (appointmentId) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        patient: {
          select: {
            userId: true,
          },
        },
      },
    });

    return appointment?.patient?.userId ?? null;
  }

  return null;
}

async function runStructuredOnlyRetrieval(
  latestUserQuery: string,
  chatContext: ChatContextPayload
): Promise<{
  classifiedIntent: ClassifiedIntent;
  structuredResult: StructuredRetrievalResult | null;
  structuredChunks: Array<{ title: string; text: string; score?: number }>;
}> {
  const classifiedIntent = await classifyQueryIntent(latestUserQuery);

  if (classifiedIntent.intent === "GENERAL") {
    return {
      classifiedIntent,
      structuredResult: null,
      structuredChunks: [
        {
          title: "Structured retrieval mode",
          text:
            "Structured-only mode is enabled. Ask for a concrete patient metric such as latest hemoglobin, creatinine trend, DLC history, or abnormal readings.",
          score: 1,
        },
      ],
    };
  }

  const patientUserId = await resolvePatientUserId(chatContext);
  if (!patientUserId) {
    return {
      classifiedIntent,
      structuredResult: null,
      structuredChunks: [
        {
          title: "Missing patient context",
          text:
            "A metric intent was detected but no patient user id was available in chat context, so structured retrieval could not be executed.",
          score: 1,
        },
      ],
    };
  }

  const patientMetricCatalog = await getPatientMetricCatalog(
    patientUserId,
    chatContext.patientMetricCatalog
  );

  const mapping = classifiedIntent.metricQuery
    ? resolveMetricAgainstCatalog(classifiedIntent.metricQuery, patientMetricCatalog)
    : { matchedMetric: null, strategy: "none" as const, score: 0 };

  if (classifiedIntent.metricQuery && patientMetricCatalog.length > 0 && !mapping.matchedMetric) {
    const preview = patientMetricCatalog.slice(0, 40).join(", ");

    return {
      classifiedIntent,
      structuredResult: null,
      structuredChunks: [
        {
          title: "Structured metric mapping",
          text: `No patient metric in catalog matched query='${classifiedIntent.metricQuery}'.`,
          score: 0.25,
        },
        {
          title: "Patient normalized metric catalog",
          text: `catalogSize=${patientMetricCatalog.length} available=${preview || "none"}`,
          score: 0.35,
        },
      ],
    };
  }

  const effectiveMetricQuery = mapping.matchedMetric ?? classifiedIntent.metricQuery;

  const structuredResult = await runStructuredRetrievalForPatient(patientUserId, {
    intent: classifiedIntent.intent as Exclude<typeof classifiedIntent.intent, "GENERAL">,
    metricQuery: effectiveMetricQuery,
    timeWindowDays: classifiedIntent.timeWindowDays,
    startDate: classifiedIntent.startDate,
    endDate: classifiedIntent.endDate,
  });

  const structuredChunks = structuredResultToChunks(structuredResult, {
    maxItems: STRUCTURED_HISTORY_MAX_ITEMS,
  });

  const confidenceChunk = {
    title: "Structured confidence",
    text: `level=${structuredResult.confidence.level} score=${structuredResult.confidence.score.toFixed(2)} rationale=${structuredResult.confidence.rationale.join(" | ")}`,
    score: structuredResult.confidence.score,
  };

  const mappingChunk = classifiedIntent.metricQuery
    ? {
        title: "Structured metric mapping",
        text: `query='${classifiedIntent.metricQuery}' mapped='${effectiveMetricQuery ?? "none"}' strategy=${mapping.strategy} score=${mapping.score.toFixed(3)} catalogSize=${patientMetricCatalog.length}`,
        score: 0.95,
      }
    : null;

  return {
    classifiedIntent,
    structuredResult,
    structuredChunks: boundToolResultChunks([
      confidenceChunk,
      ...(mappingChunk ? [mappingChunk] : []),
      ...structuredChunks,
    ]),
  };
}

async function executeStructuredRetrievalTool(
  input: StructuredToolInput,
  context: {
    patientUserId: string | null;
    patientMetricCatalog: string[];
  }
): Promise<StructuredToolResult> {
  if (!context.patientUserId) {
    return {
      ok: false,
      intent: input.intent,
      requestedMetric: input.metricQuery?.trim() || null,
      resolvedMetric: null,
      mapping: null,
      structuredChunks: [
        {
          title: "Missing patient context",
          text:
            "No patient user id was available in chat context, so structured retrieval could not be executed.",
          score: 1,
        },
      ],
      error: "Missing patient user id.",
    };
  }

  const needsMetric = input.intent !== "GET_ABNORMAL_READINGS";
  const requestedMetric = input.metricQuery?.trim() || null;

  if (needsMetric && !requestedMetric) {
    return {
      ok: false,
      intent: input.intent,
      requestedMetric: null,
      resolvedMetric: null,
      mapping: null,
      structuredChunks: [
        {
          title: "Missing metric query",
          text: `Intent ${input.intent} requires a metricQuery value.`,
          score: 1,
        },
      ],
      error: "metricQuery is required.",
    };
  }

  const mapping = requestedMetric
    ? resolveMetricAgainstCatalog(requestedMetric, context.patientMetricCatalog)
    : { matchedMetric: null, strategy: "none" as const, score: 0 };

  if (
    requestedMetric &&
    context.patientMetricCatalog.length > 0 &&
    !mapping.matchedMetric &&
    needsMetric
  ) {
    const preview = context.patientMetricCatalog.slice(0, 40).join(", ");
    return {
      ok: false,
      intent: input.intent,
      requestedMetric,
      resolvedMetric: null,
      mapping: {
        strategy: mapping.strategy,
        score: mapping.score,
      },
      structuredChunks: [
        {
          title: "Structured metric mapping",
          text: `No patient metric in catalog matched query='${requestedMetric}'.`,
          score: 0.25,
        },
        {
          title: "Patient normalized metric catalog",
          text: `catalogSize=${context.patientMetricCatalog.length} available=${preview || "none"}`,
          score: 0.35,
        },
      ],
      error: "No matching metric in patient catalog.",
    };
  }

  const effectiveMetricQuery = mapping.matchedMetric ?? requestedMetric;

  try {
    const structuredResult = await runStructuredRetrievalForPatient(context.patientUserId, {
      intent: input.intent,
      metricQuery: effectiveMetricQuery ?? undefined,
      timeWindowDays: input.timeWindowDays,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    const structuredChunks = structuredResultToChunks(structuredResult, {
      maxItems: STRUCTURED_HISTORY_MAX_ITEMS,
    });

    const confidenceChunk = {
      title: "Structured confidence",
      text: `level=${structuredResult.confidence.level} score=${structuredResult.confidence.score.toFixed(2)} rationale=${structuredResult.confidence.rationale.join(" | ")}`,
      score: structuredResult.confidence.score,
    };

    const mappingChunk = requestedMetric
      ? {
          title: "Structured metric mapping",
          text: `query='${requestedMetric}' mapped='${effectiveMetricQuery ?? "none"}' strategy=${mapping.strategy} score=${mapping.score.toFixed(3)} catalogSize=${context.patientMetricCatalog.length}`,
          score: 0.95,
        }
      : null;

    return {
      ok: true,
      intent: input.intent,
      requestedMetric,
      resolvedMetric: effectiveMetricQuery ?? null,
      mapping: requestedMetric
        ? {
            strategy: mapping.strategy,
            score: mapping.score,
          }
        : null,
      confidence: {
        level: structuredResult.confidence.level,
        score: structuredResult.confidence.score,
        rationale: structuredResult.confidence.rationale,
      },
      structuredChunks: boundToolResultChunks([
        confidenceChunk,
        ...(mappingChunk ? [mappingChunk] : []),
        ...structuredChunks,
      ]),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown structured retrieval error.";
    return {
      ok: false,
      intent: input.intent,
      requestedMetric,
      resolvedMetric: effectiveMetricQuery ?? null,
      mapping: requestedMetric
        ? {
            strategy: mapping.strategy,
            score: mapping.score,
          }
        : null,
      structuredChunks: [
        {
          title: "Structured retrieval error",
          text: "Structured retrieval execution failed for this request. Try narrowing the metric or time window and retry.",
          score: 1,
        },
      ],
      error: message,
    };
  }
}

async function executeLatestReportsTool(context: {
  patientUserId: string | null;
}): Promise<LatestReportsToolResult> {
  const maxReports = 3;

  if (!context.patientUserId) {
    return {
      ok: false,
      maxReports,
      reports: [],
      latestReportsTable: "No patient user id was available in chat context.",
      error: "Missing patient user id.",
    };
  }

  try {
    const reports = await prisma.medicalReport.findMany({
      where: {
        userId: context.patientUserId,
      },
      include: {
        document: {
          select: {
            title: true,
          },
        },
      },
      orderBy: [
        { reportDate: "desc" },
        { createdAt: "desc" },
      ],
      take: maxReports,
    });

    const normalizedReports = reports.map((report) => {
      const reportLink = report.reportURL?.trim() ? report.reportURL.trim() : null;
      return {
        id: report.id,
        title: report.document.title,
        reportDate: report.reportDate ? report.reportDate.toISOString().slice(0, 10) : null,
        createdAt: report.createdAt.toISOString(),
        hospitalName: report.hospitalName,
        reportLink,
      };
    });

    const latestReportsTable = normalizedReports.length
      ? [
          "| Date | Title | Hospital | Link |",
          "| --- | --- | --- | --- |",
          ...normalizedReports.map((item) => {
            const linkCell = item.reportLink ? `[Open report](${item.reportLink})` : "No link";
            return `| ${item.reportDate ?? "n/a"} | ${item.title} | ${item.hospitalName ?? "n/a"} | ${linkCell} |`;
          }),
        ].join("\n")
      : "No reports found for this patient.";

    return {
      ok: true,
      maxReports,
      reports: normalizedReports,
      latestReportsTable,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown report retrieval error.";
    return {
      ok: false,
      maxReports,
      reports: [],
      latestReportsTable: "Latest report retrieval failed.",
      error: message,
    };
  }
}

async function buildGroundedPrompt(
  messages: UIMessage[],
  chatContext: ChatContextPayload = {}
): Promise<{
  systemPrompt: string;
  userPrompt: string;
}> {
  const latestUserQuery = getLatestUserQuery(messages);

  if (!latestUserQuery) {
    return {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: "Give a brief clinical greeting and ask one focused follow-up question.",
    };
  }

  let structuredChunks: Array<{ title: string; text: string; score?: number }> = [];
  try {
    const structuredOnlyResult = await runStructuredOnlyRetrieval(latestUserQuery, chatContext);
    structuredChunks = structuredOnlyResult.structuredChunks;
  } catch (error) {
    console.error("Structured-only retrieval failed", error);
    structuredChunks = [
      {
        title: "Structured retrieval error",
        text: "Structured retrieval failed due to an internal error.",
        score: 1,
      },
    ];
  }

  const mergedContext = mergeRetrievedChunks({
    structuredChunks,
    maxChunks: RAG_MAX_CONTEXT_CHUNKS,
    maxChunkChars: RAG_MAX_CHUNK_CHARS,
    maxTotalChars: RAG_MAX_TOTAL_CHARS,
    prioritizeStructured: true,
  });

  const conversationContext = getConversationContext(messages);

  const promptPayload = buildGenerationPrompt({
    query: latestUserQuery,
    mergedContext,
    patientContext: conversationContext ? `Recent chat:\n${conversationContext}` : undefined,
    responseStyle: "concise",
  });

  return {
    systemPrompt: promptPayload.systemPrompt,
    userPrompt: promptPayload.userPrompt,
  };
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      messages?: UIMessage[];
      chatContext?: ChatContextPayload;
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const chatContext = body.chatContext ?? {};
    const latestUserQuery = getLatestUserQuery(messages);

    if (CHAT_DEBUG_LOGS_ENABLED) {
      console.info("Chat request start", {
        requestId,
        hasMessages: messages.length > 0,
        hasLatestUserQuery: latestUserQuery.length > 0,
      });
    }

    if (!latestUserQuery) {
      const greetingResult = streamText({
        model: ragModelProvider.chat(RAG_MODEL_NAME),
        system: SYSTEM_PROMPT,
        prompt: "Give a brief clinical greeting and ask one focused follow-up question.",
        experimental_transform: createStripThinkTransform(),
      });

      return greetingResult.toUIMessageStreamResponse({
        sendReasoning: false,
        onError: (error) => {
          console.error("AI chat stream failed", { requestId, mode: "greeting", error });
          return formatChatStreamError(error);
        },
      });
    }

    const patientUserId = await resolvePatientUserId(chatContext);
    const patientMetricCatalog = patientUserId
      ? await getPatientMetricCatalog(patientUserId, chatContext.patientMetricCatalog)
      : [];

    // Keep the existing non-tool path available as fallback when patient context is missing.
    if (!patientUserId) {
      const groundedPrompt = await buildGroundedPrompt(messages, chatContext);

      const fallbackResult = streamText({
        model: ragModelProvider.chat(RAG_MODEL_NAME),
        system: groundedPrompt.systemPrompt,
        prompt: groundedPrompt.userPrompt,
        experimental_transform: createStripThinkTransform(),
      });

      return fallbackResult.toUIMessageStreamResponse({
        sendReasoning: false,
        onError: (error) => {
          console.error("AI chat stream failed", { requestId, mode: "fallback-no-patient", error });
          return formatChatStreamError(error);
        },
      });
    }

    // Explicitly gate tool-calling because not all OpenAI-compatible endpoints support tool payloads.
    if (!STRUCTURED_TOOL_CALLING_ENABLED) {
      const groundedPrompt = await buildGroundedPrompt(messages, chatContext);

      const fallbackResult = streamText({
        model: ragModelProvider.chat(RAG_MODEL_NAME),
        system: groundedPrompt.systemPrompt,
        prompt: groundedPrompt.userPrompt,
        experimental_transform: createStripThinkTransform(),
      });

      return fallbackResult.toUIMessageStreamResponse({
        sendReasoning: false,
        onError: (error) => {
          console.error("AI chat stream failed", { requestId, mode: "fallback-tooling-disabled", error });
          return formatChatStreamError(error);
        },
      });
    }

    const conversationContext = getConversationContext(messages);

    const toolResult = streamText({
      // Force chat completions so SDK does not call /v1/responses.
      model: ragModelProvider.chat(RAG_MODEL_NAME),
      system: [
        SYSTEM_PROMPT,
        "You can use retrieval tools to answer patient metric questions.",
        "For direct latest-value requests, prefer the structuredLatestMetric tool.",
        "For history, trend, and abnormal requests, use structuredRetrieval.",
        "For recent report summary requests, use getLatestReports.",
        "If a tool returns ok=false, explain the issue and ask a concise follow-up clarifying question.",
        "For tool-provided history tables, preserve all rows in markdown table form when possible.",
      ].join("\n"),
      prompt: [
        "Clinical question:",
        latestUserQuery,
        conversationContext ? `Recent chat:\n${conversationContext}` : "",
      ]
        .filter((line) => line.length > 0)
        .join("\n\n"),
      tools: {
        structuredLatestMetric: tool({
          description:
            "Get the latest value for a specific patient metric using structured retrieval.",
          inputSchema: z.object({
            metricQuery: z
              .string()
              .min(1)
              .describe("Normalized or natural-language metric name, for example hemoglobin."),
            timeWindowDays: z
              .number()
              .int()
              .positive()
              .optional()
              .describe("Optional lookback window in days."),
            startDate: z
              .string()
              .optional()
              .describe("Optional ISO start date (YYYY-MM-DD)."),
            endDate: z
              .string()
              .optional()
              .describe("Optional ISO end date (YYYY-MM-DD)."),
          }),
          execute: async ({ metricQuery, timeWindowDays, startDate, endDate }) =>
            formatStructuredToolOutput(
              await executeStructuredRetrievalTool(
                {
                  intent: "GET_LATEST_METRIC",
                  metricQuery,
                  timeWindowDays,
                  startDate,
                  endDate,
                },
                {
                  patientUserId,
                  patientMetricCatalog,
                }
              )
            ),
        }),
        structuredRetrieval: tool({
          description:
            "Run patient-scoped structured retrieval for metric history, trend, abnormalities, or latest value.",
          inputSchema: z.object({
            intent: z
              .enum(STRUCTURED_TOOL_INTENTS)
              .describe("Structured retrieval intent to execute."),
            metricQuery: z
              .string()
              .optional()
              .describe("Metric name; required for latest/history/trend and optional for abnormal readings."),
            timeWindowDays: z
              .number()
              .int()
              .positive()
              .optional()
              .describe("Optional lookback window in days."),
            startDate: z
              .string()
              .optional()
              .describe("Optional ISO start date (YYYY-MM-DD)."),
            endDate: z
              .string()
              .optional()
              .describe("Optional ISO end date (YYYY-MM-DD)."),
          }),
          execute: async ({ intent, metricQuery, timeWindowDays, startDate, endDate }) =>
            formatStructuredToolOutput(
              await executeStructuredRetrievalTool(
                {
                  intent,
                  metricQuery,
                  timeWindowDays,
                  startDate,
                  endDate,
                },
                {
                  patientUserId,
                  patientMetricCatalog,
                }
              )
            ),
        }),
        getLatestReports: tool({
          description:
            "Get the 3 latest medical reports for the patient. Always returns at most 3 reports and includes reportLink when present.",
          inputSchema: z.object({}),
          execute: async () =>
            formatLatestReportsToolOutput(
              await executeLatestReportsTool({
                patientUserId,
              })
            ),
        }),
      },
      stopWhen: stepCountIs(5),
      providerOptions: {
        openai: {
          parallelToolCalls: false,
        },
      },
      onStepFinish: ({ toolCalls, toolResults, finishReason }) => {
        if (!STRUCTURED_TOOL_DEBUG_LOGS_ENABLED) {
          return;
        }

        console.log("Structured tool step", {
          requestId,
          finishReason,
          toolCalls: toolCalls.map((item) => item.toolName),
          toolResults: toolResults.map((item) => ({
            toolName: item.toolName,
            hasOutput: Boolean(item.output),
          })),
        });
      },
      experimental_transform: createStripThinkTransform(),
    });

    return toolResult.toUIMessageStreamResponse({
      sendReasoning: false,
      onError: (error) => {
        console.error("AI chat stream failed", { requestId, mode: "tool-calling", error });
        return formatChatStreamError(error);
      },
    });
  } catch (error) {
    console.error("AI chat route failed", {
      requestId,
      elapsedMs: Date.now() - startedAt,
      error,
    });
    return NextResponse.json(
      { error: "Failed to generate response." },
      { status: 500 },
    );
  }
}
