"use client";

import * as React from "react";
import {
  runRetrievalDebug,
  runMetricHistoryDebug,
  type RetrievalDebugResult,
} from "./actions";

// ---------------------------------------------------------------------------
// Preset queries for quick testing
// ---------------------------------------------------------------------------

const PRESET_QUERIES = [
  "What is this patient's blood pressure history?",
  "Show me the latest HbA1c value",
  "Is blood glucose trending up or down?",
  "Any abnormal lab results?",
  "What are the creatinine levels over the past year?",
  "Show me complete blood count history",
  "Tell me about hypertension treatment options",
  "Latest hemoglobin value",
  "Cholesterol trend over time",
  "What abnormal readings does this patient have?",
];

// ---------------------------------------------------------------------------
// Collapsible JSON viewer
// ---------------------------------------------------------------------------

function JsonBlock({ label, data, defaultOpen = false }: { label: string; data: unknown; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const jsonString = JSON.stringify(data, null, 2);

  return (
    <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">{isOpen ? "▼" : "▶"}</span>
      </button>
      {isOpen && (
        <pre className="overflow-x-auto border-t border-border/40 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-foreground/80 max-h-[500px] overflow-y-auto">
          {jsonString}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat pill
// ---------------------------------------------------------------------------

function Stat({ label, value, color = "default" }: { label: string; value: string | number; color?: "default" | "green" | "yellow" | "red" | "blue" }) {
  const colorClasses = {
    default: "bg-muted text-foreground",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    yellow: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  };

  return (
    <div className={`rounded-lg px-3 py-2 ${colorClasses[color]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function getStructuredPanelTable(rawResult: unknown): {
  columns: string[];
  rows: Array<{
    observedAt: string;
    sourceDocumentTitle: string;
    values: Record<string, string | null>;
  }>;
} | null {
  if (!rawResult || typeof rawResult !== "object") {
    return null;
  }

  const candidate = rawResult as {
    panelColumns?: unknown;
    panelRows?: unknown;
  };

  if (!Array.isArray(candidate.panelColumns) || !Array.isArray(candidate.panelRows)) {
    return null;
  }

  const columns = candidate.panelColumns.filter((item): item is string => typeof item === "string");
  if (columns.length === 0) {
    return null;
  }

  const rows = candidate.panelRows
    .filter((row): row is { observedAt?: unknown; sourceDocumentTitle?: unknown; values?: unknown } =>
      Boolean(row && typeof row === "object")
    )
    .map((row) => ({
      observedAt: typeof row.observedAt === "string" ? row.observedAt : "",
      sourceDocumentTitle:
        typeof row.sourceDocumentTitle === "string" ? row.sourceDocumentTitle : "Untitled Report",
      values:
        row.values && typeof row.values === "object"
          ? Object.fromEntries(
              Object.entries(row.values as Record<string, unknown>).map(([key, value]) => [
                key,
                typeof value === "string" ? value : value === null ? null : String(value),
              ])
            )
          : {},
    }));

  return rows.length > 0 ? { columns, rows } : null;
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function RetrievalTestPage() {
  const [query, setQuery] = React.useState("");
  const [patientUserId, setPatientUserId] = React.useState("1fd519e1-478c-44bb-a520-4f0c5315fc36");
  const [patientProfileId, setPatientProfileId] = React.useState("a2da765d-a679-4c3c-88be-ad97bc6ad937");
  const [isLoading, setIsLoading] = React.useState(false);
  const [result, setResult] = React.useState<RetrievalDebugResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedMetricKey, setSelectedMetricKey] = React.useState<string | null>(null);
  const structuredPanelTable = React.useMemo(
    () => getStructuredPanelTable(result?.pipeline.structuredRetrieval.rawResult ?? null),
    [result]
  );

  const handleSubmit = React.useCallback(async (queryOverride?: string) => {
    const q = queryOverride ?? query;
    if (!q.trim()) return;

    setSelectedMetricKey(null);
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await runRetrievalDebug(q.trim(), patientUserId, patientProfileId);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [query, patientUserId, patientProfileId]);

  const handlePresetClick = React.useCallback((preset: string) => {
    setQuery(preset);
    void handleSubmit(preset);
  }, [handleSubmit]);

  const handleMetricClick = React.useCallback(async (metricKey: string) => {
    setSelectedMetricKey(metricKey);
    setQuery(`Show me ${metricKey} history`);
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await runMetricHistoryDebug(metricKey, patientUserId, patientProfileId);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [patientUserId, patientProfileId]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Hybrid Retrieval Debugger
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Test the full retrieval pipeline: Intent Classification → Structured SQL + Semantic Vector → Merged Context
          </p>
        </div>

        {/* Patient config */}
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Patient Scope
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="patientUserId" className="mb-1 block text-xs font-medium text-foreground">
                Patient User ID
              </label>
              <input
                id="patientUserId"
                type="text"
                value={patientUserId}
                onChange={(e) => setPatientUserId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Patient user ID"
              />
            </div>
            <div>
              <label htmlFor="patientProfileId" className="mb-1 block text-xs font-medium text-foreground">
                Patient Profile ID
              </label>
              <input
                id="patientProfileId"
                type="text"
                value={patientProfileId}
                onChange={(e) => setPatientProfileId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Patient profile ID"
              />
            </div>
          </div>
        </div>

        {/* Query input */}
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Query
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isLoading) void handleSubmit();
              }}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Ask a clinical question..."
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isLoading || !query.trim()}
              className="rounded-md bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isLoading ? "Running…" : "Test"}
            </button>
          </div>

          {/* Presets */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {PRESET_QUERIES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetClick(preset)}
                disabled={isLoading}
                className="rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card p-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
            <div>
              <div className="text-sm font-medium text-foreground">Running hybrid retrieval…</div>
              <div className="text-xs text-muted-foreground">
                Classifying intent (Mistral) → Structured SQL + Semantic Pinecone → Merging
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="mb-1 text-xs font-semibold uppercase text-amber-700 dark:text-amber-400">Warnings</div>
                {result.warnings.map((w, i) => (
                  <div key={i} className="text-xs text-amber-800 dark:text-amber-300">• {w}</div>
                ))}
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <Stat label="Intent" value={result.pipeline.intentClassification.result.intent} color="blue" />
              <Stat
                label="Metric"
                value={result.pipeline.intentClassification.result.metricQuery || "—"}
                color={result.pipeline.intentClassification.result.metricQuery ? "green" : "default"}
              />
              <Stat label="Structured" value={result.pipeline.structuredRetrieval.wasExecuted ? "✓ Yes" : "✗ No"} color={result.pipeline.structuredRetrieval.wasExecuted ? "green" : "yellow"} />
              <Stat label="Semantic" value={result.pipeline.semanticRetrieval.totalMatches} color={result.pipeline.semanticRetrieval.totalMatches > 0 ? "green" : "red"} />
              <Stat label="Merged" value={result.pipeline.mergedContext.totalChunks} />
              <Stat label="Latency" value={`${result.pipeline.totalLatencyMs}ms`} color={result.pipeline.totalLatencyMs < 3000 ? "green" : "yellow"} />
            </div>

            {/* Patient info */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patient</h3>
              <div className="text-sm text-foreground">
                <span className="font-semibold">{result.patient.patientName || "Unknown"}</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  {result.patient.resolvedPatientUserId}
                </span>
              </div>
              {result.patientDataSummary && (
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span><strong>{result.patientDataSummary.totalReportValues}</strong> metric values</span>
                  <span><strong>{result.patientDataSummary.totalReports}</strong> reports</span>
                  <span><strong>{result.patientDataSummary.totalDocuments}</strong> documents</span>
                  <span><strong>{result.patientDataSummary.distinctMetricKeys.length}</strong> distinct metrics</span>
                </div>
              )}
            </div>

            {/* Available metrics */}
            {result.patientDataSummary && result.patientDataSummary.distinctMetricKeys.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Available Metrics in DB ({result.patientDataSummary.distinctMetricKeys.length})
                </h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Click a metric to run deterministic SQL history retrieval for that exact metric key.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.patientDataSummary.distinctMetricKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => void handleMetricClick(key)}
                      disabled={isLoading}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                        selectedMetricKey === key
                          ? "border-blue-500 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-900/40 dark:text-blue-300"
                          : "border-border/60 bg-muted text-foreground hover:bg-muted/70"
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Intent Classification */}
            <JsonBlock
              label={`1. Intent Classification (${result.pipeline.intentClassification.latencyMs}ms)`}
              data={result.pipeline.intentClassification}
              defaultOpen={true}
            />

            {/* Structured Retrieval */}
            <JsonBlock
              label={`2. Structured Retrieval (SQL) — ${result.pipeline.structuredRetrieval.wasExecuted ? "Executed" : "Skipped"}`}
              data={result.pipeline.structuredRetrieval}
              defaultOpen={result.pipeline.structuredRetrieval.wasExecuted}
            />

            {structuredPanelTable && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Structured Panel Timeline
                </h3>
                <div className="overflow-x-auto rounded-md border border-border/60">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="border-b border-border/60 px-3 py-2 text-left font-semibold text-foreground">Date</th>
                        {structuredPanelTable.columns.map((column) => (
                          <th key={column} className="border-b border-border/60 px-3 py-2 text-left font-semibold text-foreground">
                            {column}
                          </th>
                        ))}
                        <th className="border-b border-border/60 px-3 py-2 text-left font-semibold text-foreground">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {structuredPanelTable.rows.map((row, index) => (
                        <tr key={`${row.observedAt}-${index}`} className="odd:bg-background even:bg-muted/10">
                          <td className="border-b border-border/40 px-3 py-2 text-foreground/90">
                            {row.observedAt ? row.observedAt.slice(0, 10) : "unknown-date"}
                          </td>
                          {structuredPanelTable.columns.map((column) => (
                            <td key={`${row.observedAt}-${column}-${index}`} className="border-b border-border/40 px-3 py-2 text-foreground/90">
                              {row.values[column] ?? "-"}
                            </td>
                          ))}
                          <td className="border-b border-border/40 px-3 py-2 text-foreground/90">
                            {row.sourceDocumentTitle || "Untitled Report"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Semantic Retrieval */}
            <JsonBlock
              label={`3. Semantic Retrieval (Pinecone) — ${result.pipeline.semanticRetrieval.totalMatches} matches`}
              data={result.pipeline.semanticRetrieval}
              defaultOpen={result.pipeline.semanticRetrieval.totalMatches > 0}
            />

            {/* Merged Context */}
            <JsonBlock
              label={`4. Merged Context → LLM (${result.pipeline.mergedContext.totalChunks} chunks)`}
              data={result.pipeline.mergedContext}
              defaultOpen={true}
            />

            {/* LLM Context Preview */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Context Block Sent to LLM
              </h3>
              <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs leading-relaxed text-foreground/80 max-h-[600px] overflow-y-auto whitespace-pre-wrap">
                {result.pipeline.mergedContext.contextBlockForLLM || "No context was generated."}
              </pre>
            </div>

            {/* Full raw result */}
            <JsonBlock label="Full Raw Response" data={result} />
          </div>
        )}
      </div>
    </div>
  );
}
