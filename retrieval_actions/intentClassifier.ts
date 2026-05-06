"use server";

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Mistral-based intent classifier for doctor queries
// ---------------------------------------------------------------------------
// Uses Mistral (lightweight, fast) to classify a natural-language clinical
// question into a structured retrieval intent before dispatching to the
// appropriate retrieval backend.
// ---------------------------------------------------------------------------

const MISTRAL_BASE_URL = "https://api.mistral.ai/v1";
const MISTRAL_MODEL = "mistral-small-latest";

function getMistralProvider() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("MISTRAL_API_KEY is not set");
  }

  return createOpenAI({
    baseURL: MISTRAL_BASE_URL,
    apiKey,
    // Mistral is OpenAI-compatible, but does not implement the Responses API.
    compatibility: "compatible",
  });
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const STRUCTURED_INTENTS = [
  "GET_LATEST_METRIC",
  "GET_METRIC_HISTORY",
  "GET_METRIC_TREND",
  "GET_ABNORMAL_READINGS",
  "GENERAL",
] as const;

export type ClassifiedIntentType = (typeof STRUCTURED_INTENTS)[number];

const classifiedIntentSchema = z.object({
  intent: z.enum(STRUCTURED_INTENTS).describe(
    "The retrieval intent. Use GET_LATEST_METRIC when the user asks for the most recent value of a specific lab/vital. " +
    "Use GET_METRIC_HISTORY when the user asks for past values or a timeline. " +
    "Use GET_METRIC_TREND when the user asks whether a metric is going up, down, or stable. " +
    "Use GET_ABNORMAL_READINGS when the user asks about abnormal, out-of-range, or flagged results. " +
    "Use GENERAL for everything else (drug info, disease info, open-ended clinical questions, greetings, etc.)."
  ),
  metricQuery: z
    .string()
    .optional()
    .describe(
      "The clinical metric or lab test name the user is asking about, extracted from the question. " +
      "Examples: 'blood pressure', 'hba1c', 'glucose', 'creatinine', 'cholesterol'. " +
      "Leave empty for GENERAL intent."
    ),
  timeWindowDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "If the user mentions a time range (e.g. 'last 3 months', 'past year'), convert it to days. " +
      "90 for 3 months, 365 for a year, 30 for a month, 7 for a week. Leave empty if no time range mentioned."
    ),
  startDate: z
    .string()
    .optional()
    .describe(
      "If the user mentions a specific start date, provide it in ISO format (YYYY-MM-DD). Leave empty otherwise."
    ),
  endDate: z
    .string()
    .optional()
    .describe(
      "If the user mentions a specific end date, provide it in ISO format (YYYY-MM-DD). Leave empty otherwise."
    ),
});

export type ClassifiedIntent = z.infer<typeof classifiedIntentSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const CLASSIFIER_SYSTEM_PROMPT = [
  "You are a clinical query intent classifier.",
  "Given a doctor's question about a patient, classify the intent and extract parameters.",
  "",
  "Rules:",
  "- If the question asks about a specific lab value, vital sign, or medical metric, classify it as one of the metric intents.",
  "- 'What is the latest X?' or 'Current X value?' → GET_LATEST_METRIC",
  "- 'Show me X history' or 'X values over time' or 'past X readings' → GET_METRIC_HISTORY",
  "- 'Is X going up/down?' or 'X trend' or 'How has X changed?' → GET_METRIC_TREND",
  "- 'Any abnormal results?' or 'Out of range values?' or 'Flagged readings?' → GET_ABNORMAL_READINGS",
  "- For general questions about diseases, medications, treatment plans, or non-metric queries → GENERAL",
  "- Extract the metric name in lowercase clinical form (e.g. 'blood pressure' not 'BP', 'hba1c' not 'HbA1c')",
  "- When the user says 'BP', the metric is 'blood pressure'. When they say 'sugar', the metric is 'blood glucose'.",
].join("\n");

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

const GENERAL_FALLBACK: ClassifiedIntent = {
  intent: "GENERAL",
};

function hasExplicitTemporalConstraint(query: string): boolean {
  const normalized = query.toLowerCase();

  const patterns = [
    /\b(last|past|previous|recent|within|over|during|for)\b/,
    /\b(since|until|between|from|to)\b/,
    /\b\d+\s*(day|days|week|weeks|month|months|year|years)\b/,
    /\b(today|yesterday|this week|this month|this year|currently)\b/,
    /\b\d{4}\b/,
    /\b\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?\b/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function classifyQueryIntent(
  query: string
): Promise<ClassifiedIntent> {
  if (!query.trim()) {
    return GENERAL_FALLBACK;
  }

  try {
    const mistral = getMistralProvider();

    const result = await generateObject({
      // Force chat completions to avoid calls to /v1/responses.
      model: mistral.chat(MISTRAL_MODEL),
      schema: classifiedIntentSchema,
      system: CLASSIFIER_SYSTEM_PROMPT,
      prompt: query,
      temperature: 0,
      maxOutputTokens: 200,
    });

    const classified = result.object;
    const includeTemporalFields = hasExplicitTemporalConstraint(query);

    const normalizedClassified: ClassifiedIntent = {
      intent: classified.intent,
      ...(classified.metricQuery?.trim()
        ? { metricQuery: classified.metricQuery.trim() }
        : {}),
      ...(includeTemporalFields && typeof classified.timeWindowDays === "number"
        ? { timeWindowDays: classified.timeWindowDays }
        : {}),
      ...(includeTemporalFields && classified.startDate
        ? { startDate: classified.startDate }
        : {}),
      ...(includeTemporalFields && classified.endDate
        ? { endDate: classified.endDate }
        : {}),
    };

    // Ensure metricQuery is present for metric intents
    if (normalizedClassified.intent !== "GENERAL" && !normalizedClassified.metricQuery?.trim()) {
      return GENERAL_FALLBACK;
    }

    return normalizedClassified;
  } catch (error) {
    console.error("Intent classification failed, falling back to GENERAL:", error);
    return GENERAL_FALLBACK;
  }
}
