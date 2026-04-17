"use server";

import type { ParentSearchResult } from "@/retrieval_actions/actions";
import type {
  AbnormalMetricObservation,
  MetricObservation,
  StructuredRetrievalResult,
} from "@/app/actions/structuredRetrievalActions";

export type RetrievalChunkKind = "semantic" | "structured";

export interface StructuredContextChunkInput {
  id?: string;
  title: string;
  text: string;
  score?: number;
}

export interface GenerationCitation {
  chunkId: string;
  kind: RetrievalChunkKind;
  title: string;
  score: number;
}

export interface MergedGenerationChunk {
  chunkId: string;
  kind: RetrievalChunkKind;
  title: string;
  text: string;
  score: number;
}

export interface MergedGenerationContext {
  chunks: MergedGenerationChunk[];
  citations: GenerationCitation[];
  contextBlock: string;
}

export interface MergeRetrievedChunksInput {
  semanticChunks?: ParentSearchResult[];
  structuredChunks?: StructuredContextChunkInput[];
  maxChunks?: number;
  maxChunkChars?: number;
  maxTotalChars?: number;
  prioritizeStructured?: boolean;
}

export interface StructuredToChunksOptions {
  maxItems?: number;
}

export interface BuildGenerationPromptInput {
  query: string;
  mergedContext: MergedGenerationContext;
  patientContext?: string;
  responseStyle?: "concise" | "detailed";
}

export interface GenerationPromptPayload {
  systemPrompt: string;
  userPrompt: string;
  citations: GenerationCitation[];
}

const DEFAULT_MAX_CHUNKS = 10;
const DEFAULT_MAX_CHUNK_CHARS = 1200;
const DEFAULT_MAX_TOTAL_CHARS = 9000;

const BASE_SYSTEM_PROMPT = [
  "You are a clinical assistant helping a licensed clinician.",
  "Ground every statement in the supplied evidence context.",
  "If evidence is insufficient, explicitly say what is missing.",
  "Do not invent labs, diagnoses, medications, dates, or ranges.",
  "Keep the answer clinically useful, clear, and actionable.",
  "When referencing evidence, cite chunk IDs in square brackets, e.g. [CTX-1].",
].join(" ");

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toBoundedText(value: string, maxChars: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function formatIsoDate(value: Date | null | undefined): string {
  if (!value) {
    return "unknown-date";
  }
  return value.toISOString().slice(0, 10);
}

function formatObservationLine(observation: MetricObservation): string {
  const unit = observation.unit ? ` ${observation.unit}` : "";
  const source = observation.source.documentTitle || "Untitled Report";
  return `${formatIsoDate(observation.observedAt)} | ${observation.key}: ${observation.value}${unit} | source=${source}`;
}

function formatAbnormalLine(item: AbnormalMetricObservation): string {
  const observation = item.observation;
  const below = item.deviation.below !== null ? `below=${item.deviation.below}` : "";
  const above = item.deviation.above !== null ? `above=${item.deviation.above}` : "";
  const deviation = [below, above].filter((part) => part.length > 0).join(" ");
  const rangeText = `normal=${item.normalRange.min}-${item.normalRange.max}${
    item.normalRange.unit ? ` ${item.normalRange.unit}` : ""
  }`;

  return `${formatObservationLine(observation)} | ${rangeText}${deviation ? ` | ${deviation}` : ""}`;
}

export function structuredResultToChunks(
  result: StructuredRetrievalResult | null | undefined,
  options?: StructuredToChunksOptions
): StructuredContextChunkInput[] {
  if (!result) {
    return [];
  }

  const maxItems = clampPositive(options?.maxItems, 12);

  switch (result.intent) {
    case "GET_LATEST_METRIC": {
      if (!result.latest) {
        return [
          {
            title: `Structured latest ${result.metric}`,
            text: "No metric observation was found for the requested metric.",
            score: 1,
          },
        ];
      }

      return [
        {
          title: `Structured latest ${result.metric}`,
          text: formatObservationLine(result.latest),
          score: 1,
        },
      ];
    }

    case "GET_METRIC_HISTORY": {
      const selected = result.observations.slice(0, maxItems);
      return [
        {
          title: `Structured history ${result.metric}`,
          text:
            selected.length > 0
              ? selected.map(formatObservationLine).join("\n")
              : "No metric history was found for the requested criteria.",
          score: 1,
        },
      ];
    }

    case "GET_METRIC_TREND": {
      const selected = result.observations.slice(0, maxItems);
      const trendSummary = result.trend
        ? `direction=${result.trend.direction} delta=${result.trend.delta} deltaPercent=${
            result.trend.deltaPercent ?? "n/a"
          }`
        : "Trend unavailable: insufficient numeric observations.";

      return [
        {
          title: `Structured trend ${result.metric}`,
          text: [trendSummary, ...selected.map(formatObservationLine)].join("\n"),
          score: 1,
        },
      ];
    }

    case "GET_ABNORMAL_READINGS": {
      const selected = result.abnormalReadings.slice(0, maxItems);
      return [
        {
          title: result.metric
            ? `Structured abnormal ${result.metric}`
            : "Structured abnormal readings",
          text:
            selected.length > 0
              ? selected.map(formatAbnormalLine).join("\n")
              : "No abnormal readings were found for the requested criteria.",
          score: 1,
        },
      ];
    }

    default: {
      const exhaustiveCheck: never = result;
      throw new Error(`Unsupported structured result: ${String(exhaustiveCheck)}`);
    }
  }
}

function clampPositive(value: number | undefined, fallback: number): number {
  if (!value || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function semanticToMergedChunks(
  chunks: ParentSearchResult[],
  maxChunkChars: number
): MergedGenerationChunk[] {
  return chunks.map((chunk, index) => ({
    chunkId: `CTX-S-${index + 1}`,
    kind: "semantic",
    title: chunk.documentTitle || "Untitled Source",
    text: toBoundedText(chunk.parentText, maxChunkChars),
    score: Number(chunk.score.toFixed(6)),
  }));
}

function structuredToMergedChunks(
  chunks: StructuredContextChunkInput[],
  maxChunkChars: number
): MergedGenerationChunk[] {
  return chunks.map((chunk, index) => ({
    chunkId: chunk.id?.trim() || `CTX-T-${index + 1}`,
    kind: "structured",
    title: chunk.title || "Structured Retrieval",
    text: toBoundedText(chunk.text, maxChunkChars),
    score: typeof chunk.score === "number" ? Number(chunk.score.toFixed(6)) : 1,
  }));
}

function dedupeChunks(chunks: MergedGenerationChunk[]): MergedGenerationChunk[] {
  const seen = new Set<string>();
  const output: MergedGenerationChunk[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.title.toLowerCase()}::${chunk.text.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(chunk);
  }

  return output;
}

function enforceTotalCharBudget(
  chunks: MergedGenerationChunk[],
  maxTotalChars: number
): MergedGenerationChunk[] {
  let used = 0;
  const selected: MergedGenerationChunk[] = [];

  for (const chunk of chunks) {
    const entryLength = chunk.title.length + chunk.text.length + 48;
    if (used + entryLength > maxTotalChars) {
      break;
    }
    used += entryLength;
    selected.push(chunk);
  }

  return selected;
}

function formatContextBlock(chunks: MergedGenerationChunk[]): string {
  if (chunks.length === 0) {
    return "No retrieval context was provided.";
  }

  return chunks
    .map((chunk) => {
      const scoreLabel = Number.isFinite(chunk.score) ? chunk.score.toFixed(4) : "0.0000";
      return [
        `[${chunk.chunkId}] kind=${chunk.kind} score=${scoreLabel} title=${chunk.title}`,
        chunk.text,
      ].join("\n");
    })
    .join("\n\n");
}

function toCitations(chunks: MergedGenerationChunk[]): GenerationCitation[] {
  return chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    kind: chunk.kind,
    title: chunk.title,
    score: chunk.score,
  }));
}

export function mergeRetrievedChunks(
  input: MergeRetrievedChunksInput
): MergedGenerationContext {
  const maxChunks = clampPositive(input.maxChunks, DEFAULT_MAX_CHUNKS);
  const maxChunkChars = clampPositive(input.maxChunkChars, DEFAULT_MAX_CHUNK_CHARS);
  const maxTotalChars = clampPositive(input.maxTotalChars, DEFAULT_MAX_TOTAL_CHARS);

  const semanticChunks = semanticToMergedChunks(input.semanticChunks ?? [], maxChunkChars);
  const structuredChunks = structuredToMergedChunks(input.structuredChunks ?? [], maxChunkChars);

  const prioritizeStructured = input.prioritizeStructured ?? true;

  const ordered = prioritizeStructured
    ? [
        ...structuredChunks.sort((a, b) => b.score - a.score),
        ...semanticChunks.sort((a, b) => b.score - a.score),
      ]
    : [
        ...semanticChunks.sort((a, b) => b.score - a.score),
        ...structuredChunks.sort((a, b) => b.score - a.score),
      ];

  const unique = dedupeChunks(ordered);
  const topK = unique.slice(0, maxChunks);
  const budgeted = enforceTotalCharBudget(topK, maxTotalChars);

  return {
    chunks: budgeted,
    citations: toCitations(budgeted),
    contextBlock: formatContextBlock(budgeted),
  };
}

export function buildGenerationPrompt(
  input: BuildGenerationPromptInput
): GenerationPromptPayload {
  const responseStyleInstruction =
    input.responseStyle === "detailed"
      ? "Provide a detailed clinical answer with key evidence and practical next steps."
      : "Provide a concise clinical answer with only the most relevant evidence.";

  const patientContext = input.patientContext?.trim()
    ? `Patient context:\n${input.patientContext.trim()}\n\n`
    : "";

  const userPrompt = [
    "Clinical question:",
    input.query.trim(),
    "",
    patientContext ? patientContext.trimEnd() : "",
    "Evidence context (retrieved chunks):",
    input.mergedContext.contextBlock,
    "",
    "Answer requirements:",
    responseStyleInstruction,
    "Separate uncertain conclusions from supported findings.",
    "Reference evidence chunk IDs for factual claims.",
    "If there is a contradiction across chunks, call it out explicitly.",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  return {
    systemPrompt: BASE_SYSTEM_PROMPT,
    userPrompt,
    citations: input.mergedContext.citations,
  };
}
