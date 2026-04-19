// Retrieval generation utilities — merging, prompt building, citation formatting.
// This is a shared utility module imported by API routes and server actions.

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
  "=== CLINICAL COPILOT: EVIDENCE MODE ===",
  "You are a clinical assistant helping a licensed clinician.",
  "Ground every statement in the supplied evidence context.",
  "If evidence is insufficient, explicitly say what is missing.",
  "Do not invent labs, diagnoses, medications, dates, or ranges.",
  "When requested data is unavailable, do not speculate about possible conditions.",
  "Keep the answer clinically useful, clear, and actionable.",
  "When referencing evidence, cite chunk IDs in square brackets, e.g. [CTX-1].",
  "",
  "=== STRUCTURED SQL MAPPING MODE ===",
  "Treat metric retrieval as a mapping from user phrasing to normalized SQL metric keys provided by retrieval evidence.",
  "If mapping evidence indicates no matching metric, state that directly and request the exact normalized metric from the available catalog.",
  "Prefer presenting objective values and tables before interpretation.",
].join("\n");

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

function splitValueAndUnit(observation: MetricObservation): { value: string; unit: string } {
  const value = observation.value?.trim() || "-";
  const unit = observation.unit?.trim() || "-";
  return { value, unit };
}

function formatMetricHistoryTable(observations: MetricObservation[]): string {
  if (observations.length === 0) {
    return "No metric history was found for the requested criteria.";
  }

  const header = ["Date", "Metric", "Value", "Unit", "Source"];
  const separator = header.map(() => "---");
  const body = observations.map((observation) => {
    const { value, unit } = splitValueAndUnit(observation);
    return [
      formatIsoDate(observation.observedAt),
      observation.key,
      value,
      unit,
      observation.source.documentTitle || "Untitled Report",
    ];
  });

  return [header, separator, ...body]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

function formatAbnormalTable(items: AbnormalMetricObservation[]): string {
  if (items.length === 0) {
    return "No abnormal readings were found for the requested criteria.";
  }

  const header = ["Date", "Metric", "Value", "Unit", "Normal Range", "Deviation", "Source"];
  const separator = header.map(() => "---");

  const body = items.map((item) => {
    const { observation } = item;
    const { value, unit } = splitValueAndUnit(observation);
    const range = `${item.normalRange.min}-${item.normalRange.max}${
      item.normalRange.unit ? ` ${item.normalRange.unit}` : ""
    }`;
    const deviation =
      item.deviation.below !== null
        ? `below ${item.deviation.below}`
        : item.deviation.above !== null
          ? `above ${item.deviation.above}`
          : "-";

    return [
      formatIsoDate(observation.observedAt),
      observation.key,
      value,
      unit,
      range,
      deviation,
      observation.source.documentTitle || "Untitled Report",
    ];
  });

  return [header, separator, ...body]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
}

function formatPanelHistoryTable(
  columns: string[],
  rows: Array<{
    observedAt: Date;
    sourceDocumentTitle: string;
    values: Record<string, string | null>;
  }>
): string {
  if (rows.length === 0) {
    return "No panel history rows were found for the requested criteria.";
  }

  const header = ["Date", ...columns, "Source"];
  const separator = header.map(() => "---");
  const body = rows.map((row) => [
    formatIsoDate(row.observedAt),
    ...columns.map((column) => row.values[column] ?? "-"),
    row.sourceDocumentTitle || "Untitled Report",
  ]);

  return [header, separator, ...body]
    .map((cells) => `| ${cells.join(" | ")} |`)
    .join("\n");
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
      const panelRows = result.panelRows?.slice(0, maxItems) ?? [];
      const hasPanel = Boolean(result.panelColumns && result.panelColumns.length > 0 && panelRows.length > 0);
      return [
        {
          title: `Structured history ${result.metric}`,
          text: hasPanel
            ? formatPanelHistoryTable(result.panelColumns ?? [], panelRows)
            : formatMetricHistoryTable(selected),
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
          text: [
            trendSummary,
            "",
            formatMetricHistoryTable(selected),
          ].join("\n"),
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
          text: formatAbnormalTable(selected),
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
    "If structured evidence reports no matching rows for the requested metric, state that clearly, list the missing data fields, and avoid differential diagnosis speculation.",
    "When structured evidence contains clinical values over time, include a markdown table of actual values (with Date, Metric, Value, Unit, Source) before your interpretation.",
    "For panel metrics (for example DLC), preserve and present the full table rows from evidence; do not collapse to prose-only summaries.",
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
