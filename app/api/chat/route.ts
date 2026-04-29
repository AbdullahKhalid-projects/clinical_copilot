import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText, tool, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import neo4j, { type Driver } from "neo4j-driver";
import {
  buildGenerationPrompt,
  formatSoapNoteForModel,
  formatTranscriptForModel,
  mergeRetrievedChunks,
  structuredResultToChunks,
} from "@/retrieval_actions/generation";
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
import {
  getLastSessionTranscript,
  getLastSoapNote,
} from "@/app/doctor/clinical-session/actions";
import { searchVectorDatabase } from "@/retrieval_actions/actions";
import { z } from "zod";
import {
  getPatientClinicalSummaryQuery,
  suggestSafeAlternativesQuery,
  verifyPrescriptionSafetyQuery,
} from "@/code";

const SYSTEM_PROMPT =
  "You are Shifa, a clinical copilot assistant. Provide thorough, clinically useful responses with relevant analysis when warranted. Acknowledge uncertainty and suggest next best questions when appropriate. However, do not offer to perform actions you cannot carry out (such as generating charts, creating documents, or using tools beyond those explicitly provided to you). Do not ask if the user wants you to do anything else at the end of your response.";

const RAG_MODEL_BASE_URL =
  process.env.CHAT_PANEL_MODEL_URL?.trim() ||
  "https://openrouter.ai/api/v1";
const RAG_MODEL_NAME =
  process.env.CHAT_PANEL_MODEL_NAME?.trim() ||
  "qwen/qwen3.6-plus";
const CHAT_PANEL_MODEL_API_KEY =
  process.env.OPENROUTER_API_KEY ??
  process.env.RAG_MODEL_API_KEY ??
  "dummy-key";
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
const RAG_UPSTREAM_TIMEOUT_MS = Math.max(
  10000,
  Number.parseInt(process.env.RAG_UPSTREAM_TIMEOUT_MS ?? "45000", 10) || 45000
);
const STRUCTURED_TOOL_CALLING_ENABLED =
  (process.env.STRUCTURED_TOOL_CALLING_ENABLED ?? "false").toLowerCase() === "true";
const STRUCTURED_TOOL_DEBUG_LOGS_ENABLED =
  (process.env.STRUCTURED_TOOL_DEBUG_LOGS_ENABLED ?? "true").toLowerCase() === "true";
const CHAT_DEBUG_LOGS_ENABLED =
  (process.env.CHAT_DEBUG_LOGS_ENABLED ?? "true").toLowerCase() === "true";
const NEO4J_URI = process.env.NEO4J_URI?.trim() ?? "";
const NEO4J_USERNAME = process.env.NEO4J_USERNAME?.trim() ?? "";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "";
const NEO4J_DATABASE = process.env.NEO4J_DATABASE?.trim() || undefined;
const RAG_PRESERVE_THINKING_ENABLED =
  (process.env.RAG_PRESERVE_THINKING_ENABLED ?? "false").toLowerCase() === "true";
const SEMANTIC_SEND_REASONING =
  (process.env.SEMANTIC_SEND_REASONING ?? "false").toLowerCase() === "true";
const SEMANTIC_MAX_OUTPUT_TOKENS = Math.max(
  128,
  Number.parseInt(process.env.SEMANTIC_MAX_OUTPUT_TOKENS ?? "700", 10) || 700
);
const SEMANTIC_RETRIEVAL_TOP_K = Math.max(
  1,
  Number.parseInt(process.env.SEMANTIC_RETRIEVAL_TOP_K ?? "24", 10) || 24
);
const RAG_MAX_CONTEXT_CHUNKS = Math.max(
  1,
  Number.parseInt(process.env.RAG_MAX_CONTEXT_CHUNKS ?? "5", 10) || 5
);
const RAG_MAX_CHUNK_CHARS = Math.max(
  400,
  Number.parseInt(process.env.RAG_MAX_CHUNK_CHARS ?? "1800", 10) || 1800
);
const RAG_MAX_TOTAL_CHARS = Math.max(
  1200,
  Number.parseInt(process.env.RAG_MAX_TOTAL_CHARS ?? "7000", 10) || 7000
);
const STRUCTURED_HISTORY_MAX_ITEMS = 300;
const TOOL_RESULT_MAX_CHUNKS = 4;
const TOOL_RESULT_MAX_CHUNK_CHARS = 3200;
const TOOL_RESULT_MAX_TOTAL_CHARS = 9000;
const CONVERSATION_CONTEXT_MAX_MESSAGES = 6;
const CONVERSATION_CONTEXT_MAX_CHARS = Math.max(
  300,
  Number.parseInt(process.env.CONVERSATION_CONTEXT_MAX_CHARS ?? "1400", 10) || 1400
);
const NEO4J_TOOL_RESULT_MAX_ROWS = Math.max(
  1,
  Number.parseInt(process.env.NEO4J_TOOL_RESULT_MAX_ROWS ?? "25", 10) || 25
);
const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

let neo4jDriverSingleton: Driver | null = null;

// Uses an OpenAI-compatible endpoint hosted outside OpenAI (OpenRouter by default).
const ragModelProvider = createOpenAI({
  baseURL: RAG_MODEL_BASE_URL,
  apiKey: CHAT_PANEL_MODEL_API_KEY,
  fetch: async (input, init) => {
    const requestUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    const withPreserveThinking = (requestInit: RequestInit | undefined): RequestInit | undefined => {
      if (!RAG_PRESERVE_THINKING_ENABLED) {
        return requestInit;
      }

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

    const attemptFetch = async () => {
      const baseInit = withPreserveThinking(init) ?? {};
      const timeoutController = new AbortController();

      if (baseInit.signal) {
        if (baseInit.signal.aborted) {
          timeoutController.abort();
        } else {
          baseInit.signal.addEventListener(
            "abort",
            () => timeoutController.abort(),
            { once: true }
          );
        }
      }

      const timeoutHandle = setTimeout(() => {
        timeoutController.abort();
      }, RAG_UPSTREAM_TIMEOUT_MS);

      try {
        return await fetch(input, {
          ...baseInit,
          signal: timeoutController.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          const timeoutError = Object.assign(
            new Error(`Model upstream timed out after ${RAG_UPSTREAM_TIMEOUT_MS}ms.`),
            { statusCode: 504 }
          );
          throw timeoutError;
        }
        throw error;
      } finally {
        clearTimeout(timeoutHandle);
      }
    };
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
          `Model endpoint returned HTTP 204 (empty body). Retrying ${emptyBodyAttempts}/${RAG_EMPTY_204_RETRY_COUNT}.`
        );
        await sleep(RAG_RETRY_BASE_DELAY_MS * emptyBodyAttempts);
        response = await attemptFetch();
        continue;
      }

      if (shouldRetry5xx(response.status) && serverErrorAttempts < RAG_5XX_RETRY_COUNT) {
        serverErrorAttempts += 1;
        console.warn(
          `Model endpoint returned HTTP ${response.status}. Retrying ${serverErrorAttempts}/${RAG_5XX_RETRY_COUNT}.`
        );
        await sleep(RAG_RETRY_BASE_DELAY_MS * serverErrorAttempts);
        response = await attemptFetch();
        continue;
      }

      if (CHAT_DEBUG_LOGS_ENABLED && totalAttempts > 1) {
        console.info("Model upstream retry summary", {
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

  if (maybeError.statusCode === 504) {
    return "The model endpoint timed out before completing the response. Please retry with a shorter query or reduced context.";
  }

  const message = typeof maybeError.message === "string" ? maybeError.message.toLowerCase() : "";
  if (message.includes("empty response body")) {
    return "The model endpoint returned an empty response. Please try again.";
  }

  if (message.includes("timed out") || message.includes("timeout")) {
    return "The model endpoint timed out before completing the response. Please retry with a shorter query or reduced context.";
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

  const combined = recent.join("\n");
  if (combined.length <= CONVERSATION_CONTEXT_MAX_CHARS) {
    return combined;
  }

  return combined.slice(combined.length - CONVERSATION_CONTEXT_MAX_CHARS).trimStart();
}

type ChatContextPayload = {
  appointmentId?: string | null;
  patientProfileId?: string | null;
  patientUserId?: string | null;
  patientMetricCatalog?: string[] | null;
  includePatientDocuments?: boolean;
  retrievalMode?: "normal" | "semantic";
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

type LastSessionToolResult = {
  ok: boolean;
  appointmentId: string | null;
  appointmentDate: string | null;
  transcriptText: string;
  entryCount: number;
  error?: string;
};

type LastSoapNoteToolResult = {
  ok: boolean;
  appointmentId: string | null;
  appointmentDate: string | null;
  soapNoteText: string;
  error?: string;
};

type Neo4jPatientClinicalSummaryResult = {
  ok: boolean;
  patientId: string;
  rows: Array<{
    category: string;
    item: string;
    date: string | null;
  }>;
  summaryTable: string;
  error?: string;
};

type Neo4jPrescriptionSafetyResult = {
  ok: boolean;
  patientId: string;
  proposedDrug: string;
  proposedMedicine: string | null;
  warningAllergies: string[];
  warningInteractions: string[];
  warningContraindications: string[];
  error?: string;
};

type Neo4jSafeAlternativesResult = {
  ok: boolean;
  patientId: string;
  diseaseName: string;
  alternatives: Array<{
    safeAlternative: string;
    foundVia: string | null;
    treatmentDetails: string | null;
  }>;
  alternativesTable: string;
  error?: string;
};

type Neo4jQueryRow = Record<string, unknown>;

function getNeo4jDriverOrError(): { driver: Driver | null; error?: string } {
  if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
    const missing = [
      !NEO4J_URI && "NEO4J_URI",
      !NEO4J_USERNAME && "NEO4J_USERNAME",
      !NEO4J_PASSWORD && "NEO4J_PASSWORD",
    ].filter(Boolean).join(", ");
    console.warn("[Neo4j] Driver init skipped — missing env:", missing);
    return {
      driver: null,
      error:
        "Neo4j is not configured. Set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD environment variables.",
    };
  }

  if (!neo4jDriverSingleton) {
    console.info("[Neo4j] Creating driver singleton for URI:", NEO4J_URI, "database:", NEO4J_DATABASE ?? "default");
    neo4jDriverSingleton = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
      {
        disableLosslessIntegers: true,
      }
    );
  }

  return { driver: neo4jDriverSingleton };
}

async function runNeo4jReadQuery(
  query: string,
  params: Record<string, unknown>
): Promise<{ ok: true; rows: Neo4jQueryRow[] } | { ok: false; error: string }> {
  const { driver, error } = getNeo4jDriverOrError();
  if (!driver) {
    console.warn("[Neo4j] runNeo4jReadQuery aborted — driver unavailable:", error);
    return {
      ok: false,
      error: error ?? "Neo4j driver is not available.",
    };
  }

  console.info("[Neo4j] Executing read query", { params });

  const session = driver.session(
    NEO4J_DATABASE
      ? {
          defaultAccessMode: neo4j.session.READ,
          database: NEO4J_DATABASE,
        }
      : {
          defaultAccessMode: neo4j.session.READ,
        }
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

    console.info("[Neo4j] Query succeeded — rows returned:", rows.length);
    if (rows.length > 0) {
      console.info("[Neo4j] First row sample:", rows[0]);
    }

    return { ok: true, rows };
  } catch (queryError) {
    const message = queryError instanceof Error ? queryError.message : "Neo4j query failed.";
    console.error("[Neo4j] Query failed:", message, { params });
    return {
      ok: false,
      error: message,
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

function formatNeo4jPatientClinicalSummaryToolOutput(result: Neo4jPatientClinicalSummaryResult): string {
  if (!result.ok) {
    return `Failed to retrieve patient clinical summary: ${result.error ?? "Unknown Neo4j error."}`;
  }

  return [
    `Patient summary retrieved for: ${result.patientId}`,
    `Rows: ${result.rows.length}`,
    "",
    result.summaryTable,
  ].join("\n");
}

function formatNeo4jPrescriptionSafetyToolOutput(result: Neo4jPrescriptionSafetyResult): string {
  if (!result.ok) {
    return `Failed to verify prescription safety: ${result.error ?? "Unknown Neo4j error."}`;
  }

  const allergies =
    result.warningAllergies.length > 0 ? result.warningAllergies.join(", ") : "None detected";
  const interactions =
    result.warningInteractions.length > 0
      ? result.warningInteractions.join(", ")
      : "None detected";
  const contraindications =
    result.warningContraindications.length > 0
      ? result.warningContraindications.join(", ")
      : "None detected";
  const hasWarnings =
    result.warningAllergies.length > 0 ||
    result.warningInteractions.length > 0 ||
    result.warningContraindications.length > 0;

  return [
    `Prescription safety verification completed for patient: ${result.patientId}`,
    `Proposed drug: ${result.proposedMedicine ?? result.proposedDrug}`,
    `Overall status: ${hasWarnings ? "WARNINGS FOUND" : "NO WARNINGS FOUND"}`,
    "",
    `Allergy conflicts: ${allergies}`,
    `Drug interactions: ${interactions}`,
    `Contraindications: ${contraindications}`,
  ].join("\n");
}

function formatNeo4jSafeAlternativesToolOutput(result: Neo4jSafeAlternativesResult): string {
  if (!result.ok) {
    return `Failed to suggest safe alternatives: ${result.error ?? "Unknown Neo4j error."}`;
  }

  return [
    `Safe alternatives generated for patient: ${result.patientId}`,
    `Disease context: ${result.diseaseName}`,
    `Alternatives found: ${result.alternatives.length}`,
    "",
    result.alternativesTable,
  ].join("\n");
}

function formatLastSessionToolOutput(result: LastSessionToolResult): string {
  if (!result.ok) {
    return `Failed to retrieve last session transcript: ${result.error ?? "Unknown error."}`;
  }

  return [
    `Successfully retrieved last session transcript.`,
    `Session ID: ${result.appointmentId ?? "unknown"}`,
    `Session Date: ${result.appointmentDate ?? "unknown"}`,
    `Entries: ${result.entryCount}`,
    "",
    "Transcript:",
    result.transcriptText,
  ].join("\n");
}

function formatLastSoapNoteToolOutput(result: LastSoapNoteToolResult): string {
  if (!result.ok) {
    return `Failed to retrieve last SOAP note: ${result.error ?? "Unknown error."}`;
  }

  return [
    `Successfully retrieved last SOAP note.`,
    `Session ID: ${result.appointmentId ?? "unknown"}`,
    `Session Date: ${result.appointmentDate ?? "unknown"}`,
    "",
    "SOAP Note:",
    result.soapNoteText,
  ].join("\n");
}

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

async function resolveNeo4jPatientIdentifier(
  chatContext: ChatContextPayload,
  resolvedPatientUserId: string | null
): Promise<string | null> {
  const HARD_CODED_NEO4J_PATIENT_ID = "38cc16ef-8b17-4841-985e-bdafe4c92e37";

  const candidates: string[] = [];

  const addCandidate = (value: string | null | undefined) => {
    const normalized = value?.trim() ?? "";
    if (!normalized) {
      return;
    }

    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  const appointmentId = chatContext.appointmentId?.trim() || null;
  if (appointmentId) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        patientId: true,
        patient: {
          select: {
            id: true,
            userId: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Prioritise stable IDs over display names for graph lookups.
    addCandidate(appointment?.patient?.id ?? null);
    addCandidate(appointment?.patient?.userId ?? null);
    addCandidate(appointment?.patientId ?? null);
    addCandidate(appointment?.patient?.user?.name ?? null);
    addCandidate(appointment?.patient?.user?.email ?? null);
  }

  // Fallback to explicit chat context identifiers if appointment-derived details are unavailable.
  addCandidate(chatContext.patientProfileId);
  addCandidate(chatContext.patientUserId);

  // Keep this as a final fallback because some graphs use app user IDs as patient keys.
  addCandidate(resolvedPatientUserId);

  const resolved = candidates[0] ?? null;
  console.info("[Neo4j] Resolved patient identifier candidates:", candidates, "selected:", resolved, "HARD_CODED:", HARD_CODED_NEO4J_PATIENT_ID);
  return HARD_CODED_NEO4J_PATIENT_ID;
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

async function executeLastSessionTranscriptTool(context: {
  appointmentId: string | null;
}): Promise<LastSessionToolResult> {
  if (!context.appointmentId) {
    return {
      ok: false,
      appointmentId: null,
      appointmentDate: null,
      transcriptText: "",
      entryCount: 0,
      error: "No appointment ID was available in chat context.",
    };
  }

  try {
    const result = await getLastSessionTranscript(context.appointmentId);
    if (!result.success) {
      return {
        ok: false,
        appointmentId: result.appointmentId,
        appointmentDate: result.appointmentDate
          ? result.appointmentDate.toISOString().slice(0, 10)
          : null,
        transcriptText: "",
        entryCount: 0,
        error: result.error ?? "Failed to retrieve last session transcript.",
      };
    }

    const transcriptText = formatTranscriptForModel(result.transcript);
    return {
      ok: true,
      appointmentId: result.appointmentId,
      appointmentDate: result.appointmentDate
        ? result.appointmentDate.toISOString().slice(0, 10)
        : null,
      transcriptText,
      entryCount: result.transcript?.length ?? 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transcript retrieval error.";
    return {
      ok: false,
      appointmentId: null,
      appointmentDate: null,
      transcriptText: "",
      entryCount: 0,
      error: message,
    };
  }
}

async function executeLastSoapNoteTool(context: {
  appointmentId: string | null;
}): Promise<LastSoapNoteToolResult> {
  if (!context.appointmentId) {
    return {
      ok: false,
      appointmentId: null,
      appointmentDate: null,
      soapNoteText: "",
      error: "No appointment ID was available in chat context.",
    };
  }

  try {
    const result = await getLastSoapNote(context.appointmentId);
    if (!result.success) {
      return {
        ok: false,
        appointmentId: result.appointmentId,
        appointmentDate: result.appointmentDate
          ? result.appointmentDate.toISOString().slice(0, 10)
          : null,
        soapNoteText: "",
        error: result.error ?? "Failed to retrieve last SOAP note.",
      };
    }

    const soapNoteText = formatSoapNoteForModel(result.soapNote);
    return {
      ok: true,
      appointmentId: result.appointmentId,
      appointmentDate: result.appointmentDate
        ? result.appointmentDate.toISOString().slice(0, 10)
        : null,
      soapNoteText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SOAP note retrieval error.";
    return {
      ok: false,
      appointmentId: null,
      appointmentDate: null,
      soapNoteText: "",
      error: message,
    };
  }
}

async function executeNeo4jPatientClinicalSummaryTool(
  input: {
    patientId?: string;
  },
  context: {
    resolvedPatientId: string | null;
  }
): Promise<Neo4jPatientClinicalSummaryResult> {
  const patientId = input.patientId?.trim() || context.resolvedPatientId || "";
  console.info("[Neo4j Tool] get_patient_clinical_summary — input.patientId:", input.patientId, "resolvedPatientId:", context.resolvedPatientId, "effective:", patientId);

  if (!patientId) {
    console.warn("[Neo4j Tool] get_patient_clinical_summary aborted — no patientId resolved.");
    return {
      ok: false,
      patientId: "",
      rows: [],
      summaryTable: "Could not resolve patient identifier from clinical session context.",
      error: "patientId is required or must be resolvable from chatContext.appointmentId.",
    };
  }

  const queryResult = await runNeo4jReadQuery(getPatientClinicalSummaryQuery, {
    patientId,
  });

  if (!queryResult.ok) {
    console.warn("[Neo4j Tool] get_patient_clinical_summary query failed:", queryResult.error);
    return {
      ok: false,
      patientId,
      rows: [],
      summaryTable: "Neo4j patient summary query failed.",
      error: queryResult.error,
    };
  }

  const rows = queryResult.rows.slice(0, NEO4J_TOOL_RESULT_MAX_ROWS).map((row) => ({
    category: typeof row.Category === "string" && row.Category.trim() ? row.Category.trim() : "Unknown",
    item: typeof row.Item === "string" && row.Item.trim() ? row.Item.trim() : "Unknown",
    date: row.Date == null ? null : String(row.Date),
  }));

  console.info("[Neo4j Tool] get_patient_clinical_summary — mapped rows:", rows.length);

  const summaryTable = rows.length
    ? [
        "| Category | Item | Date |",
        "| --- | --- | --- |",
        ...rows.map((row) => `| ${row.category} | ${row.item} | ${row.date ?? "n/a"} |`),
      ].join("\n")
    : "No clinical summary rows found for this patient filter.";

  return {
    ok: true,
    patientId,
    rows,
    summaryTable,
  };
}

async function executeNeo4jVerifyPrescriptionSafetyTool(
  input: {
    patientId?: string;
    proposedDrug: string;
  },
  context: {
    resolvedPatientId: string | null;
  }
): Promise<Neo4jPrescriptionSafetyResult> {
  const patientId = input.patientId?.trim() || context.resolvedPatientId || "";
  const proposedDrug = input.proposedDrug.trim();
  console.info("[Neo4j Tool] verify_prescription_safety — input.patientId:", input.patientId, "resolvedPatientId:", context.resolvedPatientId, "effective:", patientId, "proposedDrug:", proposedDrug);

  if (!patientId || !proposedDrug) {
    console.warn("[Neo4j Tool] verify_prescription_safety aborted — missing patientId or proposedDrug.");
    return {
      ok: false,
      patientId,
      proposedDrug,
      proposedMedicine: null,
      warningAllergies: [],
      warningInteractions: [],
      warningContraindications: [],
      error:
        "proposedDrug is required, and patientId must be provided or resolvable from clinical session context.",
    };
  }

  const queryResult = await runNeo4jReadQuery(verifyPrescriptionSafetyQuery, {
    patientId,
    proposedDrug,
  });

  if (!queryResult.ok) {
    console.warn("[Neo4j Tool] verify_prescription_safety query failed:", queryResult.error);
    return {
      ok: false,
      patientId,
      proposedDrug,
      proposedMedicine: null,
      warningAllergies: [],
      warningInteractions: [],
      warningContraindications: [],
      error: queryResult.error,
    };
  }

  const firstRow = queryResult.rows[0];
  if (!firstRow) {
    console.warn("[Neo4j Tool] verify_prescription_safety — no rows returned for patientId:", patientId, "proposedDrug:", proposedDrug);
    return {
      ok: false,
      patientId,
      proposedDrug,
      proposedMedicine: null,
      warningAllergies: [],
      warningInteractions: [],
      warningContraindications: [],
      error: "No Neo4j result rows found. Confirm patient and drug exist in graph.",
    };
  }

  console.info("[Neo4j Tool] verify_prescription_safety — first row:", firstRow);

  return {
    ok: true,
    patientId,
    proposedDrug,
    proposedMedicine:
      typeof firstRow.ProposedMedicine === "string" && firstRow.ProposedMedicine.trim()
        ? firstRow.ProposedMedicine.trim()
        : null,
    warningAllergies: toStringArray(firstRow.Warning_Allergies),
    warningInteractions: toStringArray(firstRow.Warning_Interactions),
    warningContraindications: toStringArray(firstRow.Warning_Contraindications),
  };
}

async function executeNeo4jSuggestSafeAlternativesTool(
  input: {
    patientId?: string;
    diseaseName: string;
  },
  context: {
    resolvedPatientId: string | null;
  }
): Promise<Neo4jSafeAlternativesResult> {
  const patientId = input.patientId?.trim() || context.resolvedPatientId || "";
  const diseaseName = input.diseaseName.trim();
  console.info("[Neo4j Tool] suggest_safe_alternatives — input.patientId:", input.patientId, "resolvedPatientId:", context.resolvedPatientId, "effective:", patientId, "diseaseName:", diseaseName);

  if (!patientId || !diseaseName) {
    console.warn("[Neo4j Tool] suggest_safe_alternatives aborted — missing patientId or diseaseName.");
    return {
      ok: false,
      patientId,
      diseaseName,
      alternatives: [],
      alternativesTable:
        "diseaseName is required, and patientId must be provided or resolved from clinical session context.",
      error:
        "diseaseName is required, and patientId must be provided or resolved from clinical session context.",
    };
  }

  const queryResult = await runNeo4jReadQuery(suggestSafeAlternativesQuery, {
    patientId,
    diseaseName,
  });

  if (!queryResult.ok) {
    console.warn("[Neo4j Tool] suggest_safe_alternatives query failed:", queryResult.error);
    return {
      ok: false,
      patientId,
      diseaseName,
      alternatives: [],
      alternativesTable: "Neo4j safe alternatives query failed.",
      error: queryResult.error,
    };
  }

  const alternatives = queryResult.rows.slice(0, NEO4J_TOOL_RESULT_MAX_ROWS).map((row) => ({
    safeAlternative:
      typeof row.SafeAlternative === "string" && row.SafeAlternative.trim()
        ? row.SafeAlternative.trim()
        : "Unknown",
    foundVia: row.FoundVia == null ? null : String(row.FoundVia),
    treatmentDetails: row.TreatmentDetails == null ? null : String(row.TreatmentDetails),
  }));

  console.info("[Neo4j Tool] suggest_safe_alternatives — mapped alternatives:", alternatives.length);

  const alternativesTable = alternatives.length
    ? [
        "| Safe Alternative | Found Via | Details |",
        "| --- | --- | --- |",
        ...alternatives.map(
          (row) =>
            `| ${row.safeAlternative} | ${row.foundVia ?? "n/a"} | ${row.treatmentDetails ?? "n/a"} |`
        ),
      ].join("\n")
    : "No safe alternatives found for the provided disease and patient constraints.";

  return {
    ok: true,
    patientId,
    diseaseName,
    alternatives,
    alternativesTable,
  };
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
        prompt: "Give a brief clinical greeting and ask one focused follow-up question. Do not offer to perform actions you cannot carry out after your greeting.",
      });

      return greetingResult.toUIMessageStreamResponse({
        sendReasoning: true,
        onError: (error) => {
          console.error("AI chat stream failed", { requestId, mode: "greeting", error });
          return formatChatStreamError(error);
        },
      });
    }

    const patientUserId = await resolvePatientUserId(chatContext);
    const neo4jPatientId = await resolveNeo4jPatientIdentifier(chatContext, patientUserId);
    const patientMetricCatalog = patientUserId
      ? await getPatientMetricCatalog(patientUserId, chatContext.patientMetricCatalog)
      : [];

    // Semantic retrieval mode: direct RAG via vector search, no tool-calling.
    if (chatContext.retrievalMode === "semantic") {
      try {
        const semanticRetrievalStartedAt = Date.now();
        const semanticResults = await searchVectorDatabase(latestUserQuery, SEMANTIC_RETRIEVAL_TOP_K, "all", {
          includePatientDocuments: true,
          patientUserId,
          patientProfileId: chatContext.patientProfileId ?? null,
        });

        const semanticChunks = semanticResults.map((result) => ({
          parentChunkId: result.parentChunkId,
          parentText: result.parentText,
          documentId: result.documentId,
          documentTitle: result.documentTitle || "Untitled Source",
          score: result.score,
        }));

        const mergedContext = mergeRetrievedChunks({
          semanticChunks,
          maxChunks: RAG_MAX_CONTEXT_CHUNKS,
          maxChunkChars: RAG_MAX_CHUNK_CHARS,
          maxTotalChars: RAG_MAX_TOTAL_CHARS,
          prioritizeStructured: false,
        });

        const conversationContext = getConversationContext(messages);

        const promptPayload = buildGenerationPrompt({
          query: latestUserQuery,
          mergedContext,
          patientContext: conversationContext ? `Recent chat:\n${conversationContext}` : undefined,
          responseStyle: "concise",
        });

        const retrievalPreview = {
          mode: "semantic" as const,
          query: latestUserQuery,
          semanticMatches: semanticChunks.length,
          mergedChunkCount: mergedContext.chunks.length,
          citationCount: mergedContext.citations.length,
          topDocuments: semanticChunks.slice(0, 5).map((chunk) => ({
            chunkId: chunk.parentChunkId,
            title: chunk.documentTitle || "Untitled Source",
            score: Number(chunk.score.toFixed(4)),
          })),
        };

        const semanticResult = streamText({
          model: ragModelProvider.chat(RAG_MODEL_NAME),
          maxOutputTokens: SEMANTIC_MAX_OUTPUT_TOKENS,
          system: [
            SYSTEM_PROMPT,
            promptPayload.systemPrompt,
            "You are in semantic retrieval mode. Ground every statement in the retrieved document passages.",
            "Cite sources by document title when possible.",
            "If the retrieved passages do not contain relevant information, state that clearly and do not speculate.",
            "Do not offer to perform actions you cannot carry out (such as generating charts, creating documents, or using tools beyond those explicitly provided to you). Do not ask if the user wants you to do anything else at the end of your response.",
          ].join("\n"),
          prompt: promptPayload.userPrompt,
        });

        return semanticResult.toUIMessageStreamResponse({
          sendReasoning: SEMANTIC_SEND_REASONING,
          messageMetadata: ({ part }) => {
            if (part.type === "start") {
              return {
                retrieval: retrievalPreview,
                retrievalStartedAt: Date.now(),
              };
            }

            if (part.type === "finish") {
              return {
                model: RAG_MODEL_NAME,
                totalTokens: part.totalUsage.totalTokens,
                retrievalDurationMs: Date.now() - semanticRetrievalStartedAt,
                retrieval: retrievalPreview,
              };
            }
          },
          onError: (error) => {
            console.error("AI chat stream failed", { requestId, mode: "semantic-rag", error });
            return formatChatStreamError(error);
          },
        });
      } catch (error) {
        console.error("Semantic retrieval failed", { requestId, error });
        // Fall through to normal mode as fallback
      }
    }

    // Keep the existing non-tool path available as fallback when patient context is missing.
    if (!patientUserId) {
      const groundedPrompt = await buildGroundedPrompt(messages, chatContext);

        const fallbackResult = streamText({
          model: ragModelProvider.chat(RAG_MODEL_NAME),
          system: `${groundedPrompt.systemPrompt}\nDo not offer to perform actions you cannot carry out (such as generating charts, creating documents, or using tools beyond those explicitly provided to you). Do not ask if the user wants you to do anything else at the end of your response.`,
          prompt: groundedPrompt.userPrompt,
        });

        return fallbackResult.toUIMessageStreamResponse({
          sendReasoning: true,
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
          system: `${groundedPrompt.systemPrompt}\nDo not offer to perform actions you cannot carry out (such as generating charts, creating documents, or using tools beyond those explicitly provided to you). Do not ask if the user wants you to do anything else at the end of your response.`,
          prompt: groundedPrompt.userPrompt,
        });

        return fallbackResult.toUIMessageStreamResponse({
          sendReasoning: true,
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
        "For summarizing the previous visit conversation, use retrieveLastSession.",
        "For reviewing the previous visit SOAP note, use getLastSoapNote.",
        "For a patient overview, medical history, allergy list, or medication list, use get_patient_clinical_summary.",
        "When the doctor asks 'should I give him this medicine', 'can I prescribe', 'is it safe to prescribe', or mentions a specific drug in a prescribing context, use verify_prescription_safety.",
        "When the doctor asks for 'alternatives', 'what else can I give', 'other options', or a 'replacement' for a treatment, use suggest_safe_alternatives.",
        "If a tool returns ok=false, explain the issue and ask a concise follow-up clarifying question.",
        "For tool-provided history tables, preserve all rows in markdown table form when possible.",
        "When summarizing a previous session transcript, focus on the chief complaint, key history, and any changes since the last visit.",
        "When reviewing a previous SOAP note, highlight the prior assessment, plan, and any follow-up items that may be relevant to the current visit.",
        "Do not offer to perform actions you cannot carry out (such as generating charts, creating documents, or using tools beyond those explicitly provided to you). Do not ask if the user wants you to do anything else at the end of your response.",
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
            "Get the latest value for a specific patient metric using structured retrieval. This is for single value retrieval, it is not for complete historical retrieval where many values may be returned - in that case use the more flexible structuredRetrieval tool with the appropriate intent.",
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
        retrieveLastSession: tool({
          description:
            "Retrieve the transcript from the patient's most recent previous clinical session. Use this when the user asks about what happened in the last visit, previous conversation, or wants a summary of the prior session dialogue. Returns a formatted dialogue transcript with speaker labels.",
          inputSchema: z.object({}),
          execute: async () =>
            formatLastSessionToolOutput(
              await executeLastSessionTranscriptTool({
                appointmentId: chatContext.appointmentId ?? null,
              })
            ),
        }),
        getLastSoapNote: tool({
          description:
            "Retrieve the SOAP note from the patient's most recent previous clinical session. Use this when the user asks about the previous visit note, prior assessment, or wants to review what was documented in the last encounter. Returns a formatted SOAP note with sections.",
          inputSchema: z.object({}),
          execute: async () =>
            formatLastSoapNoteToolOutput(
              await executeLastSoapNoteTool({
                appointmentId: chatContext.appointmentId ?? null,
              })
            ),
        }),
        get_patient_clinical_summary: tool({
          description:
            "Retrieve a patient's complete clinical snapshot from the graph database — including conditions, allergies, and current medications. Use this when the doctor asks for a patient overview, medical history, allergy list, or medication list.",
          inputSchema: z.object({
            patientId: z
              .string()
              .optional()
              .describe("Optional patient identifier override. If omitted, resolved from chat context/clinical session."),
          }),
          execute: async ({ patientId }) =>
            formatNeo4jPatientClinicalSummaryToolOutput(
              await executeNeo4jPatientClinicalSummaryTool(
                {
                  patientId,
                },
                {
                  resolvedPatientId: neo4jPatientId,
                }
              )
            ),
        }),
        verify_prescription_safety: tool({
          description:
            "Safety-check a proposed medication before prescribing. Use this whenever the doctor asks things like 'should I give him this medicine', 'can I prescribe', 'is it safe to prescribe', or mentions a specific drug name in a prescribing context. Checks allergies, cross-reactions, drug interactions, and contraindications.",
          inputSchema: z.object({
            patientId: z
              .string()
              .optional()
              .describe("Optional patient identifier override. If omitted, resolved from chat context/clinical session."),
            proposedDrug: z
              .string()
              .min(1)
              .describe("Exact medication name the doctor wants to prescribe."),
          }),
          execute: async ({ patientId, proposedDrug }) =>
            formatNeo4jPrescriptionSafetyToolOutput(
              await executeNeo4jVerifyPrescriptionSafetyTool(
                {
                  patientId,
                  proposedDrug,
                },
                {
                  resolvedPatientId: neo4jPatientId,
                }
              )
            ),
        }),
        suggest_safe_alternatives: tool({
          description:
            "Suggest alternative treatments for a disease/condition while automatically filtering out anything the patient is allergic to or that cross-reacts with known allergies. Use this when the doctor asks for 'alternatives', 'what else can I give', 'other options', or 'replacement' for a current or proposed treatment.",
          inputSchema: z.object({
            patientId: z
              .string()
              .optional()
              .describe("Optional patient identifier override. If omitted, resolved from chat context/clinical session."),
            diseaseName: z
              .string()
              .min(1)
              .describe("Disease or condition name to find treatments for (e.g., hypertension, diabetes, bacterial infection)."),
          }),
          execute: async ({ patientId, diseaseName }) =>
            formatNeo4jSafeAlternativesToolOutput(
              await executeNeo4jSuggestSafeAlternativesTool(
                {
                  patientId,
                  diseaseName,
                },
                {
                  resolvedPatientId: neo4jPatientId,
                }
              )
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
    });

    return toolResult.toUIMessageStreamResponse({
      sendReasoning: true,
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
