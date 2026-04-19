import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type UIMessage } from "ai";
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

const SYSTEM_PROMPT =
  "You are Shifa, a clinical copilot assistant. Give concise, clinically useful responses, acknowledge uncertainty, and suggest next best questions when appropriate.";

const RAG_MODEL_BASE_URL =
  "https://bsparx128--example-qwen3-6-35b-a3b-awq-inference-vllmser-088df8.modal.run/v1";
const RAG_MODEL_NAME = "cyankiwi/Qwen3.6-35B-A3B-AWQ-4bit";
const RAG_MODEL_API_KEY = process.env.RAG_MODEL_API_KEY ?? "dummy-key";
const RAG_MAX_CONTEXT_CHUNKS = 8;
const RAG_MAX_TOTAL_CHARS = 7000;
const CONVERSATION_CONTEXT_MAX_MESSAGES = 6;
const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

// Uses an OpenAI-compatible endpoint hosted outside OpenAI (Modal/vLLM).
const ragModelProvider = createOpenAI({
  baseURL: RAG_MODEL_BASE_URL,
  apiKey: RAG_MODEL_API_KEY,
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
          const sanitizedDelta = processText(part.delta);
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
          const sanitizedText = processText(part.text);
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

  const structuredChunks = structuredResultToChunks(structuredResult);

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
    structuredChunks: [
      confidenceChunk,
      ...(mappingChunk ? [mappingChunk] : []),
      ...structuredChunks,
    ],
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
  try {
    const body = (await request.json().catch(() => ({}))) as {
      messages?: UIMessage[];
      chatContext?: ChatContextPayload;
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const groundedPrompt = await buildGroundedPrompt(messages, body.chatContext ?? {});

    const result = streamText({
      model: ragModelProvider(RAG_MODEL_NAME),
      system: groundedPrompt.systemPrompt,
      prompt: groundedPrompt.userPrompt,
      experimental_transform: createStripThinkTransform(),
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: false,
    });
  } catch (error) {
    console.error("AI chat route failed", error);
    return NextResponse.json(
      { error: "Failed to generate response." },
      { status: 500 },
    );
  }
}
