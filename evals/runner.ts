import "dotenv/config";
import { generateText, tool, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { cases, type EvalCase, type EvalLang } from "./cases";
import { TOOL_ROUTING_SYSTEM_PROMPT } from "./prompts";

const RAG_MODEL_BASE_URL =
  process.env.CHAT_PANEL_MODEL_URL?.trim() ||
  "https://bsparx64--example-qwen3-6-27b-awq-inference2-vllmserver-serve.modal.run/v1";
const RAG_MODEL_NAME =
  process.env.CHAT_PANEL_MODEL_NAME?.trim() ||
  "Intel/Qwen3.6-27B-int4-AutoRound";
const CHAT_PANEL_MODEL_API_KEY =
  process.env.OPENROUTER_API_KEY ??
  process.env.RAG_MODEL_API_KEY ??
  "dummy-key";

const ragModelProvider = createOpenAI({
  baseURL: RAG_MODEL_BASE_URL,
  apiKey: CHAT_PANEL_MODEL_API_KEY,
});

const STRUCTURED_TOOL_INTENTS = [
  "GET_LATEST_METRIC",
  "GET_METRIC_HISTORY",
  "GET_METRIC_TREND",
  "GET_ABNORMAL_READINGS",
] as const;

const stubTools = {
  structuredLatestMetric: tool({
    description:
      "Get the latest value for a specific patient metric using structured retrieval. This is for single value retrieval, it is not for complete historical retrieval where many values may be returned - in that case use the more flexible structuredRetrieval tool with the appropriate intent.",
    inputSchema: z.object({
      metricQuery: z
        .string()
        .min(1)
        .describe(
          "Normalized or natural-language metric name, for example hemoglobin.",
        ),
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
    execute: async (args) => `stub: ${JSON.stringify(args)}`,
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
        .describe(
          "Metric name; required for latest/history/trend and optional for abnormal readings.",
        ),
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
    execute: async (args) => `stub: ${JSON.stringify(args)}`,
  }),
  getLatestReports: tool({
    description:
      "Get the 3 latest medical reports for the patient. Always returns at most 3 reports and includes reportLink when present.",
    inputSchema: z.object({}),
    execute: async () => "stub",
  }),
  retrieveLastSession: tool({
    description:
      "Retrieve the transcript from the patient's most recent previous clinical session. Use this when the user asks about what happened in the last visit, previous conversation, or wants a summary of the prior session dialogue. Returns a formatted dialogue transcript with speaker labels.",
    inputSchema: z.object({}),
    execute: async () => "stub",
  }),
  getLastSoapNote: tool({
    description:
      "Retrieve the SOAP note from the patient's most recent previous clinical session. Use this when the user asks about the previous visit note, prior assessment, or wants to review what was documented in the last encounter. Returns a formatted SOAP note with sections.",
    inputSchema: z.object({}),
    execute: async () => "stub",
  }),
  get_patient_clinical_summary: tool({
    description:
      "Retrieve a patient's complete clinical snapshot from the graph database — including conditions, allergies, and current medications. Use this when the doctor asks for a patient overview, medical history, allergy list, or medication list.",
    inputSchema: z.object({
      patientId: z
        .string()
        .optional()
        .describe(
          "Optional patient identifier override. If omitted, resolved from chat context/clinical session.",
        ),
    }),
    execute: async (args) => `stub: ${JSON.stringify(args)}`,
  }),
  verify_prescription_safety: tool({
    description:
      "Safety-check a proposed medication before prescribing. Use this whenever the doctor asks things like 'should I give him this medicine', 'can I prescribe', 'is it safe to prescribe', or mentions a specific drug name in a prescribing context. Checks allergies, cross-reactions, drug interactions, and contraindications.",
    inputSchema: z.object({
      patientId: z
        .string()
        .optional()
        .describe(
          "Optional patient identifier override. If omitted, resolved from chat context/clinical session.",
        ),
      proposedDrug: z
        .string()
        .min(1)
        .describe("Exact medication name the doctor wants to prescribe."),
    }),
    execute: async (args) => `stub: ${JSON.stringify(args)}`,
  }),
  suggest_safe_alternatives: tool({
    description:
      "Suggest alternative treatments for a disease/condition while automatically filtering out anything the patient is allergic to or that cross-reacts with known allergies. Use this when the doctor asks for 'alternatives', 'what else can I give', 'other options', or 'replacement' for a current or proposed treatment.",
    inputSchema: z.object({
      patientId: z
        .string()
        .optional()
        .describe(
          "Optional patient identifier override. If omitted, resolved from chat context/clinical session.",
        ),
      diseaseName: z
        .string()
        .min(1)
        .describe(
          "Disease or condition name to find treatments for (e.g., hypertension, diabetes, bacterial infection).",
        ),
    }),
    execute: async (args) => `stub: ${JSON.stringify(args)}`,
  }),
};

type EvalResult = {
  id: string;
  lang: EvalLang;
  prompt: string;
  pass: boolean;
  actualTools: string[];
  expectedTools: string[];
  failReason?: string;
};

function normalizeString(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function partialMatch(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  return Object.entries(expected).every(([k, v]) => {
    const a = actual[k];
    if (a === undefined || a === null) return false;
    if (typeof v === "string" && typeof a === "string") {
      const normA = normalizeString(a);
      const normV = normalizeString(v);
      return normA.includes(normV) || normV.includes(normA);
    }
    return JSON.stringify(a) === JSON.stringify(v);
  });
}

function getExpectedTools(c: EvalCase): string[] {
  if ("expectedTools" in c) return c.expectedTools;
  return [c.expectedTool];
}

function getExpectedArgs(
  c: EvalCase,
): Record<string, unknown> | undefined {
  if ("expectedTool" in c) return c.expectedArgs;
  return undefined;
}

async function runCase(c: EvalCase): Promise<EvalResult> {
  const expectedTools = getExpectedTools(c);
  const expectedArgs = getExpectedArgs(c);
  const isMulti = expectedTools.length > 1;

  const result = await generateText({
    model: ragModelProvider.chat(RAG_MODEL_NAME),
    temperature: 0,
    system: TOOL_ROUTING_SYSTEM_PROMPT,
    prompt: `Clinical question:\n\n${c.prompt}`,
    tools: stubTools,
    stopWhen: stepCountIs(isMulti ? 8 : 5),
    providerOptions: {
      openai: {
        parallelToolCalls: false,
      },
    },
  });

  const allToolCalls = result.steps.flatMap((step) => step.toolCalls ?? []);
  const actualTools = allToolCalls.map((tc) => tc.toolName);
  const actualToolSet = new Set(actualTools);

  const missingTools = expectedTools.filter((t) => !actualToolSet.has(t));

  if (missingTools.length > 0) {
    return {
      id: c.id,
      lang: c.lang,
      prompt: c.prompt,
      pass: false,
      actualTools,
      expectedTools,
      failReason: `Missing tools: [${missingTools.join(", ")}]. Got: [${actualTools.join(", ") || "none"}]`,
    };
  }

  if (c.notExpectedTools) {
    const forbidden = actualTools.filter((t) =>
      c.notExpectedTools!.includes(t),
    );
    if (forbidden.length > 0) {
      return {
        id: c.id,
        lang: c.lang,
        prompt: c.prompt,
        pass: false,
        actualTools,
        expectedTools,
        failReason: `Forbidden tools called: ${forbidden.join(", ")}`,
      };
    }
  }

  if (expectedArgs) {
    const match = allToolCalls.find(
      (tc) => tc.toolName === expectedTools[0],
    );
    if (match) {
      const matchInput =
        (match as { input?: Record<string, unknown> }).input ?? {};
      if (!partialMatch(matchInput, expectedArgs)) {
        return {
          id: c.id,
          lang: c.lang,
          prompt: c.prompt,
          pass: false,
          actualTools,
          expectedTools,
          failReason: `Args mismatch for ${expectedTools[0]}. Expected ${JSON.stringify(expectedArgs)}, got ${JSON.stringify(matchInput)}`,
        };
      }
    }
  }

  return {
    id: c.id,
    lang: c.lang,
    prompt: c.prompt,
    pass: true,
    actualTools,
    expectedTools,
  };
}

function langLabel(lang: EvalLang): string {
  switch (lang) {
    case "en":
      return "English";
    case "ur-roman":
      return "Romanized Urdu";
    case "ur":
      return "Urdu Script";
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function printResults(results: EvalResult[], elapsedMs: number) {
  const byLang = new Map<EvalLang, EvalResult[]>();
  for (const r of results) {
    if (!byLang.has(r.lang)) byLang.set(r.lang, []);
    byLang.get(r.lang)!.push(r);
  }

  for (const [lang, langResults] of byLang) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  ${langLabel(lang)} (${langResults.length} cases)`);
    console.log(`${"=".repeat(70)}`);

    for (const r of langResults) {
      const status = r.pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
      const multiTag = r.expectedTools.length > 1 ? " [MULTI]" : "";
      const ambTag = r.id.includes("-amb-") ? " [AMB]" : "";
      console.log(`  ${status}  ${r.id}${ambTag}${multiTag}`);
      console.log(`       Prompt:    "${r.prompt.slice(0, 100)}${r.prompt.length > 100 ? "..." : ""}"`);
      console.log(
        `       Expected:  [${r.expectedTools.join(", ")}]`,
      );
      console.log(
        `       Actual:    [${r.actualTools.join(", ") || "none"}]`,
      );
      if (r.failReason) {
        console.log(`       Reason:    ${r.failReason}`);
      }
      console.log();
    }
  }

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  const singleCases = results.filter((r) => r.expectedTools.length === 1);
  const multiCases = results.filter((r) => r.expectedTools.length > 1);
  const singlePassed = singleCases.filter((r) => r.pass).length;
  const multiPassed = multiCases.filter((r) => r.pass).length;
  const ambCases = results.filter((r) => r.id.includes("-amb-"));
  const ambPassed = ambCases.filter((r) => r.pass).length;

  console.log(`${"=".repeat(70)}`);
  console.log(`  TOTAL: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(
    `  Single-tool:      ${singlePassed}/${singleCases.length} passed`,
  );
  console.log(
    `  Multi-tool:       ${multiPassed}/${multiCases.length} passed`,
  );
  console.log(
    `  Ambiguous (hard): ${ambPassed}/${ambCases.length} passed`,
  );
  console.log(`  Duration:         ${formatElapsed(elapsedMs)}`);
  console.log(`${"=".repeat(70)}\n`);
}

function generateReport(results: EvalResult[], startedAt: Date, elapsedMs: number): string {
  const now = startedAt;
  const timestamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  const singleCases = results.filter((r) => r.expectedTools.length === 1);
  const multiCases = results.filter((r) => r.expectedTools.length > 1);
  const singlePassed = singleCases.filter((r) => r.pass).length;
  const multiPassed = multiCases.filter((r) => r.pass).length;
  const ambCases = results.filter((r) => r.id.includes("-amb-"));
  const ambPassed = ambCases.filter((r) => r.pass).length;

  const byLang = new Map<EvalLang, EvalResult[]>();
  for (const r of results) {
    if (!byLang.has(r.lang)) byLang.set(r.lang, []);
    byLang.get(r.lang)!.push(r);
  }

  const lines: string[] = [];

  lines.push(`# Shifa Agent Eval Report`);
  lines.push(``);
  lines.push(`**Model:** \`${RAG_MODEL_NAME}\`  `);
  lines.push(`**Endpoint:** \`${RAG_MODEL_BASE_URL}\`  `);
  lines.push(`**Date:** ${now.toISOString()}  `);
  lines.push(`**Total cases:** ${total}  `);
  lines.push(`**Duration:** ${formatElapsed(elapsedMs)}  `);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Metric | Result |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Total | **${passed}/${total}** passed |`);
  lines.push(`| Single-tool | ${singlePassed}/${singleCases.length} |`);
  lines.push(`| Multi-tool | ${multiPassed}/${multiCases.length} |`);
  lines.push(`| Ambiguous (hard) | ${ambPassed}/${ambCases.length} |`);
  lines.push(``);

  for (const [lang, langResults] of byLang) {
    const langPassed = langResults.filter((r) => r.pass).length;
    lines.push(`## ${langLabel(lang)} — ${langPassed}/${langResults.length} passed`);
    lines.push(``);
    lines.push(`| Status | ID | Prompt | Expected | Actual |`);
    lines.push(`| --- | --- | --- | --- | --- |`);

    for (const r of langResults) {
      const status = r.pass ? "PASS" : "FAIL";
      const promptShort =
        r.prompt.length > 80
          ? r.prompt.slice(0, 77) + "..."
          : r.prompt;
      const expected = r.expectedTools.join(", ");
      const actual = r.actualTools.join(", ") || "none";
      lines.push(
        `| ${status} | \`${r.id}\` | ${promptShort} | ${expected} | ${actual} |`,
      );
    }

    const failures = langResults.filter((r) => !r.pass);
    if (failures.length > 0) {
      lines.push(``);
      lines.push(`### Failures`);
      lines.push(``);
      for (const r of failures) {
        lines.push(`- **\`${r.id}\`** — ${r.failReason}`);
        lines.push(`  - Prompt: "${r.prompt}"`);
        lines.push(`  - Expected: [${r.expectedTools.join(", ")}]`);
        lines.push(`  - Actual: [${r.actualTools.join(", ") || "none"}]`);
      }
    }

    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`*Report generated by Shifa eval runner*`);
  lines.push(``);

  const report = lines.join("\n");

  const reportsDir = path.join(process.cwd(), "evals", "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filePath = path.join(reportsDir, `test_${timestamp}.md`);
  fs.writeFileSync(filePath, report, "utf-8");

  return filePath;
}

async function main() {
  const runStartedAt = new Date();
  const runStartedMs = Date.now();

  console.log(`\nShifa Agent Evals — ${cases.length} test cases`);
  console.log(`Model: ${RAG_MODEL_NAME}`);
  console.log(`Endpoint: ${RAG_MODEL_BASE_URL}\n`);

  const results: EvalResult[] = [];
  let index = 0;

  for (const c of cases) {
    index += 1;
    const multiTag =
      ("expectedTools" in c ? c.expectedTools.length : 1) > 1 ? " [MULTI]" : "";
    const ambTag = c.id.includes("-amb-") ? " [AMB]" : "";
    process.stdout.write(
      `[${String(index).padStart(2)}/${cases.length}] ${c.id}${ambTag}${multiTag}... `,
    );

    try {
      const r = await runCase(c);
      results.push(r);
      console.log(r.pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      console.log(`\x1b[31mERROR\x1b[0m — ${message}`);
      results.push({
        id: c.id,
        lang: c.lang,
        prompt: c.prompt,
        pass: false,
        actualTools: [],
        expectedTools: getExpectedTools(c),
        failReason: `Runner error: ${message}`,
      });
    }
  }

  const elapsedMs = Date.now() - runStartedMs;
  printResults(results, elapsedMs);

  const reportPath = generateReport(results, runStartedAt, elapsedMs);
  console.log(`Report saved to: ${reportPath}`);

  const allPassed = results.every((r) => r.pass);
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
