"use server";

import type { Prisma } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { CANONICAL_METRICS } from "@/retrieval_actions/metricAliasDictionary";
import {
  resolveMetricQuery,
  type MetricQueryResolution,
} from "@/retrieval_actions/metricQueryResolver";

export type StructuredRetrievalIntent =
  | "GET_LATEST_METRIC"
  | "GET_METRIC_HISTORY"
  | "GET_METRIC_TREND"
  | "GET_ABNORMAL_READINGS";

export interface StructuredRetrievalQuery {
  intent: StructuredRetrievalIntent;
  metricQuery?: string;
  startDate?: string;
  endDate?: string;
  timeWindowDays?: number;
  limit?: number;
}

export interface MetricObservation {
  id: string;
  key: string;
  keyNormalized: string | null;
  value: string;
  valueNumeric: number | null;
  unit: string | null;
  observedAt: Date;
  source: {
    reportId: string;
    reportDate: Date | null;
    reportUrl: string | null;
    hospitalName: string | null;
    documentId: string;
    documentTitle: string;
  };
}

export type StructuredRetrievalConfidenceLevel = "high" | "medium" | "low";

export interface StructuredRetrievalConfidence {
  level: StructuredRetrievalConfidenceLevel;
  score: number;
  rationale: string[];
}

export interface StructuredLatestMetricResult {
  intent: "GET_LATEST_METRIC";
  metric: string;
  resolution: MetricQueryResolution;
  latest: MetricObservation | null;
  confidence: StructuredRetrievalConfidence;
}

export interface StructuredMetricHistoryResult {
  intent: "GET_METRIC_HISTORY";
  metric: string;
  resolution: MetricQueryResolution;
  observations: MetricObservation[];
  confidence: StructuredRetrievalConfidence;
  panelColumns?: string[];
  panelRows?: Array<{
    observedAt: Date;
    sourceDocumentTitle: string;
    sourceReportUrl: string | null;
    sourceHospitalName: string | null;
    values: Record<string, string | null>;
  }>;
}

export interface StructuredMetricTrendResult {
  intent: "GET_METRIC_TREND";
  metric: string;
  resolution: MetricQueryResolution;
  observations: MetricObservation[];
  confidence: StructuredRetrievalConfidence;
  trend: {
    direction: "up" | "down" | "stable";
    delta: number;
    deltaPercent: number | null;
  } | null;
}

export interface AbnormalMetricObservation {
  observation: MetricObservation;
  normalRange: {
    min: number;
    max: number;
    unit: string | null;
  };
  deviation: {
    below: number | null;
    above: number | null;
  };
}

export interface StructuredAbnormalReadingsResult {
  intent: "GET_ABNORMAL_READINGS";
  metric: string | null;
  resolution: MetricQueryResolution | null;
  abnormalReadings: AbnormalMetricObservation[];
  confidence: StructuredRetrievalConfidence;
}

export type StructuredRetrievalResult =
  | StructuredLatestMetricResult
  | StructuredMetricHistoryResult
  | StructuredMetricTrendResult
  | StructuredAbnormalReadingsResult;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

const BLOOD_PRESSURE_KEY_VARIANTS = [
  "blood pressure",
  "blood pressure systolic",
  "blood pressure diastolic",
  "sbp",
  "dbp",
  "sbpt",
  "dbpt",
] as const;

const DLC_PANEL_COLUMNS = [
  "Neutrophils",
  "Lymphocytes",
  "Monocytes",
  "Eosinophils",
  "Basophils",
] as const;

const DLC_PANEL_COMPONENT_KEYS: Record<(typeof DLC_PANEL_COLUMNS)[number], string[]> = {
  Neutrophils: ["neutrophils"],
  Lymphocytes: ["lymphocyte", "lymphocytes"],
  Monocytes: ["monocyte", "monocytes"],
  Eosinophils: ["eosinophil", "eosinophils"],
  Basophils: ["basophil", "basophils"],
};

const DLC_QUERY_ALIASES = new Set([
  "dlc",
  "differential leukocyte count",
  "differential leucocyte count",
  "differential count",
]);

const METRIC_NORMAL_RANGES: Record<
  string,
  {
    min: number;
    max: number;
    unit: string | null;
  }
> = {
  "blood glucose": { min: 70, max: 140, unit: "MG/DL" },
  hba1c: { min: 4.0, max: 5.6, unit: "%" },
  creatinine: { min: 0.6, max: 1.3, unit: "MG/DL" },
  "white blood cell count": { min: 4.0, max: 11.0, unit: "10^9/L" },
  "platelet count": { min: 150, max: 450, unit: "10^9/L" },
  sodium: { min: 135, max: 145, unit: "MMOL/L" },
  potassium: { min: 3.5, max: 5.1, unit: "MMOL/L" },
  hemoglobin: { min: 12, max: 17.5, unit: "G/DL" },
};

async function getCurrentDbUserId(): Promise<string> {
  const user = await currentUser();
  if (!user) {
    redirect("/");
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    select: { id: true },
  });

  if (!dbUser) {
    throw new Error("User not found in database.");
  }

  return dbUser.id;
}

function parseDateInput(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDateFilter(query: StructuredRetrievalQuery): Prisma.DateTimeNullableFilter | null {
  const startDate = parseDateInput(query.startDate);
  const endDate = parseDateInput(query.endDate);

  if (startDate || endDate) {
    return {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  if (query.timeWindowDays && query.timeWindowDays > 0) {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - query.timeWindowDays);
    return { gte: from, lte: now };
  }

  return null;
}

function normalizeFreeTextMetricKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sanitizeLimit(limit?: number): number {
  if (!limit || limit <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(limit, MAX_LIMIT);
}

function clampConfidence(value: number): number {
  return Math.min(0.99, Math.max(0.05, Number(value.toFixed(2))));
}

function strategyConfidenceBonus(strategy: MetricQueryResolution["strategy"]): number {
  switch (strategy) {
    case "exact":
      return 0.3;
    case "regex":
      return 0.25;
    case "fuzzy":
      return 0.2;
    case "fallback":
      return 0.08;
    default:
      return 0;
  }
}

function buildStructuredConfidence(input: {
  resolution: MetricQueryResolution | null;
  hasData: boolean;
  observationCount?: number;
  panelRowsCount?: number;
  hasTrend?: boolean;
}): StructuredRetrievalConfidence {
  const rationale: string[] = [];

  if (!input.hasData) {
    rationale.push("No matching structured rows were returned.");
    return {
      level: "low",
      score: 0.2,
      rationale,
    };
  }

  let score = 0.5;

  if (input.resolution) {
    score += strategyConfidenceBonus(input.resolution.strategy);
    rationale.push(`Metric resolution strategy: ${input.resolution.strategy}.`);
  } else {
    rationale.push("No metric resolution metadata was available.");
  }

  if ((input.observationCount ?? 0) >= 2) {
    score += 0.08;
    rationale.push("Multiple observations support the result.");
  }

  if ((input.panelRowsCount ?? 0) > 0) {
    score += 0.1;
    rationale.push("Panel rows were reconstructed from component metrics.");
  }

  if (input.hasTrend) {
    score += 0.07;
    rationale.push("Numeric trend calculation was available.");
  }

  const bounded = clampConfidence(score);
  const level: StructuredRetrievalConfidenceLevel =
    bounded >= 0.8 ? "high" : bounded >= 0.55 ? "medium" : "low";

  return {
    level,
    score: bounded,
    rationale,
  };
}

function tokenizeMetricForMatching(value: string): string[] {
  return normalizeFreeTextMetricKey(value)
    .split(" ")
    .filter((token) => token.length > 0);
}

function tokenOverlapScore(a: string, b: string): number {
  const aTokens = tokenizeMetricForMatching(a);
  const bTokens = tokenizeMetricForMatching(b);

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

function getMetricAliasCandidates(
  metricQuery: string,
  resolution: MetricQueryResolution
): string[] {
  const directCandidates = [
    metricQuery,
    resolution.canonicalKey,
    resolution.normalizedQuery,
    resolution.suggestedCanonicalKey,
  ]
    .filter((value): value is string => Boolean(value && value.length > 0))
    .map((value) => normalizeFreeTextMetricKey(value));

  const canonicalCandidates = [resolution.canonicalKey, resolution.suggestedCanonicalKey]
    .filter((value): value is string => Boolean(value && value.length > 0))
    .map((value) => normalizeFreeTextMetricKey(value));

  const expandedAliases = CANONICAL_METRICS.flatMap((definition) => {
    const canonicalNormalized = normalizeFreeTextMetricKey(definition.canonicalKey);
    if (!canonicalCandidates.includes(canonicalNormalized)) {
      return [];
    }

    return [definition.canonicalKey, ...definition.aliases].map((item) =>
      normalizeFreeTextMetricKey(item)
    );
  });

  return Array.from(new Set([...directCandidates, ...expandedAliases]));
}

async function getNormalizedMetricCatalogForUser(userId: string): Promise<string[]> {
  const rows = await prisma.medicalReportValue.findMany({
    where: {
      userId,
      keyNormalized: {
        not: null,
      },
    },
    select: {
      keyNormalized: true,
    },
    distinct: ["keyNormalized"],
  });

  return rows
    .map((row) => row.keyNormalized)
    .filter((value): value is string => value !== null)
    .map((value) => normalizeFreeTextMetricKey(value));
}

function resolvePatientMetricKeys(
  metricQuery: string,
  resolution: MetricQueryResolution,
  patientMetricCatalog: string[]
): string[] {
  const catalog = Array.from(new Set(patientMetricCatalog.filter((item) => item.length > 0)));
  const catalogSet = new Set(catalog);

  if (catalog.length === 0) {
    return [];
  }

  const normalizedQuery = normalizeFreeTextMetricKey(metricQuery);
  const aliasCandidates = getMetricAliasCandidates(metricQuery, resolution);

  const exactMatches = Array.from(
    new Set(aliasCandidates.filter((candidate) => catalogSet.has(candidate)))
  );
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const containsMatches = catalog.filter((metricKey) =>
    aliasCandidates.some(
      (candidate) =>
        candidate.length >= 4 && (metricKey.includes(candidate) || candidate.includes(metricKey))
    )
  );
  if (containsMatches.length > 0) {
    return containsMatches;
  }

  const scored = catalog
    .map((metricKey) => ({
      metricKey,
      score: aliasCandidates.reduce((best, candidate) => {
        const overlap = tokenOverlapScore(candidate, metricKey);
        const typoResilientSimilarity = normalizedLevenshteinSimilarity(candidate, metricKey) * 0.9;
        return Math.max(best, overlap, typoResilientSimilarity);
      }, 0),
    }))
    .sort((a, b) => b.score - a.score);

  const bestScore = scored[0]?.score ?? 0;
  if (bestScore < 0.72) {
    return [];
  }

  return scored
    .filter((item) => item.score >= bestScore)
    .slice(0, 3)
    .map((item) => item.metricKey);
}

function isDlcPanelQuery(metricQuery: string, resolution: MetricQueryResolution): boolean {
  const candidates = [
    metricQuery,
    resolution.canonicalKey,
    resolution.normalizedQuery,
    resolution.suggestedCanonicalKey,
  ]
    .filter((value): value is string => Boolean(value && value.length > 0))
    .map((value) => normalizeFreeTextMetricKey(value));

  return candidates.some((candidate) => DLC_QUERY_ALIASES.has(candidate));
}

async function fetchDlcPanelRowsForUser(
  userId: string,
  query: StructuredRetrievalQuery,
  options?: { ascending?: boolean }
): Promise<StructuredMetricHistoryResult["panelRows"]> {
  const dateFilter = buildDateFilter(query);
  const componentKeys = Array.from(
    new Set(Object.values(DLC_PANEL_COMPONENT_KEYS).flatMap((keys) => keys))
  );

  const where: Prisma.MedicalReportValueWhereInput = {
    userId,
    ...(dateFilter
      ? {
          OR: [
            { observedAt: dateFilter },
            { report: { reportDate: dateFilter } },
          ],
        }
      : {}),
    keyNormalized: {
      in: componentKeys,
    },
  };

  const rows = await prisma.medicalReportValue.findMany({
    where,
    include: {
      report: {
        select: {
          id: true,
          reportDate: true,
          reportURL: true,
          hospitalName: true,
          document: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: options?.ascending
      ? [
          { observedAt: "asc" },
          { report: { reportDate: "asc" } },
          { createdAt: "asc" },
        ]
      : [
          { observedAt: "desc" },
          { report: { reportDate: "desc" } },
          { createdAt: "desc" },
        ],
    take: sanitizeLimit(query.limit) * Math.max(1, DLC_PANEL_COLUMNS.length),
  });

  const byReport = new Map<
    string,
    {
      observedAt: Date;
      sourceDocumentTitle: string;
      sourceReportUrl: string | null;
      sourceHospitalName: string | null;
      values: Record<string, string | null>;
    }
  >();

  for (const row of rows) {
    const observedAt = row.observedAt ?? row.report.reportDate ?? row.createdAt;
    const reportId = row.report.id;
    const existing = byReport.get(reportId);

    const valueText = row.unit ? `${row.value} ${row.unit}` : row.value;

    const column = DLC_PANEL_COLUMNS.find((label) =>
      DLC_PANEL_COMPONENT_KEYS[label].includes((row.keyNormalized ?? "").toLowerCase())
    );

    if (!column) {
      continue;
    }

    if (!existing) {
      byReport.set(reportId, {
        observedAt,
        sourceDocumentTitle: row.report.document.title,
        sourceReportUrl: row.report.reportURL ?? null,
        sourceHospitalName: row.report.hospitalName,
        values: Object.fromEntries(DLC_PANEL_COLUMNS.map((label) => [label, null])),
      });
    }

    const target = byReport.get(reportId);
    if (!target) {
      continue;
    }

    if (!target.values[column]) {
      target.values[column] = valueText;
    }
  }

  const sorted = Array.from(byReport.values()).sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime()
  );

  return sorted.slice(0, sanitizeLimit(query.limit));
}

function isBloodPressureFamilyQuery(metricQuery: string, resolution: MetricQueryResolution): boolean {
  const queryNormalized = normalizeFreeTextMetricKey(metricQuery);
  const candidates = [
    queryNormalized,
    resolution.canonicalKey,
    resolution.normalizedQuery,
    resolution.suggestedCanonicalKey,
  ].filter((value): value is string => Boolean(value && value.length > 0));

  return candidates.some((candidate) =>
    BLOOD_PRESSURE_KEY_VARIANTS.includes(candidate as (typeof BLOOD_PRESSURE_KEY_VARIANTS)[number])
  );
}

function buildMetricCondition(
  metricQuery: string,
  resolution: MetricQueryResolution,
  matchedMetricKeys: string[]
): Prisma.MedicalReportValueWhereInput {
  if (matchedMetricKeys.length > 0) {
    const normalizedMatchCondition: Prisma.MedicalReportValueWhereInput =
      matchedMetricKeys.length === 1
        ? { keyNormalized: matchedMetricKeys[0] }
        : { keyNormalized: { in: matchedMetricKeys } };

    if (isBloodPressureFamilyQuery(metricQuery, resolution)) {
      const bloodPressureSignalConditions: Prisma.MedicalReportValueWhereInput[] = [
        { unit: { contains: "mmhg", mode: "insensitive" } },
        { unit: { contains: "mm hg", mode: "insensitive" } },
        { value: { contains: "/", mode: "insensitive" } },
        { key: { contains: "blood pressure", mode: "insensitive" } },
        { key: { contains: "systolic", mode: "insensitive" } },
        { key: { contains: "diastolic", mode: "insensitive" } },
      ];

      return {
        AND: [
          normalizedMatchCondition,
          { OR: bloodPressureSignalConditions },
        ],
      };
    }

    return normalizedMatchCondition;
  }

  const aliasCandidates = getMetricAliasCandidates(metricQuery, resolution);

  const keyContainsCandidates = Array.from(
    new Set(aliasCandidates.filter((candidate) => candidate.length >= 4))
  );

  const metricConditions: Prisma.MedicalReportValueWhereInput[] = [
    { key: { contains: metricQuery, mode: "insensitive" } },
    ...keyContainsCandidates.map((candidate) => ({
      key: { contains: candidate, mode: "insensitive" as const },
    })),
  ];

  if (aliasCandidates.length > 0) {
    metricConditions.push({
      keyNormalized: {
        in: aliasCandidates,
      },
    });
  }

  if (resolution.canonicalKey) {
    metricConditions.push({ keyNormalized: resolution.canonicalKey });
  }

  if (resolution.normalizedQuery) {
    metricConditions.push({
      keyNormalized: {
        contains: resolution.normalizedQuery,
        mode: "insensitive",
      },
    });
  }

  if (resolution.suggestedCanonicalKey) {
    metricConditions.push({ keyNormalized: resolution.suggestedCanonicalKey });
  }

  if (isBloodPressureFamilyQuery(metricQuery, resolution)) {
    metricConditions.push({
      keyNormalized: {
        in: [...BLOOD_PRESSURE_KEY_VARIANTS],
      },
    });
    metricConditions.push({ key: { contains: "systolic", mode: "insensitive" } });
    metricConditions.push({ key: { contains: "diastolic", mode: "insensitive" } });

    // Guardrail: avoid false positives where OCR/noisy keys resemble BP labels
    // but units/values are clearly non-BP (for example enzyme units like IU/L).
    const bloodPressureSignalConditions: Prisma.MedicalReportValueWhereInput[] = [
      { unit: { contains: "mmhg", mode: "insensitive" } },
      { unit: { contains: "mm hg", mode: "insensitive" } },
      { value: { contains: "/", mode: "insensitive" } },
      { key: { contains: "blood pressure", mode: "insensitive" } },
      { key: { contains: "systolic", mode: "insensitive" } },
      { key: { contains: "diastolic", mode: "insensitive" } },
    ];

    return {
      AND: [
        { OR: metricConditions },
        { OR: bloodPressureSignalConditions },
      ],
    };
  }

  return { OR: metricConditions };
}

function buildObservationWhereClause(
  userId: string,
  query: StructuredRetrievalQuery,
  resolution: MetricQueryResolution | null,
  matchedMetricKeys: string[]
): Prisma.MedicalReportValueWhereInput {
  const andClauses: Prisma.MedicalReportValueWhereInput[] = [];

  const dateFilter = buildDateFilter(query);
  if (dateFilter) {
    andClauses.push({
      OR: [
        { observedAt: dateFilter },
        { report: { reportDate: dateFilter } },
      ],
    });
  }

  if (query.metricQuery && resolution) {
    andClauses.push(buildMetricCondition(query.metricQuery, resolution, matchedMetricKeys));
  }

  return {
    userId,
    ...(andClauses.length > 0 ? { AND: andClauses } : {}),
  };
}

function parseNumeric(value: string, valueNumeric: number | null): number | null {
  if (valueNumeric !== null && Number.isFinite(valueNumeric)) {
    return valueNumeric;
  }

  const parsed = Number.parseFloat(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toObservation(row: {
  id: string;
  key: string;
  keyNormalized: string | null;
  value: string;
  valueNumeric: number | null;
  unit: string | null;
  observedAt: Date | null;
  createdAt: Date;
  report: {
    id: string;
    reportDate: Date | null;
    reportURL: string | null;
    hospitalName: string | null;
    document: {
      id: string;
      title: string;
    };
  };
}): MetricObservation {
  const effectiveObservedAt = row.observedAt ?? row.report.reportDate ?? row.createdAt;
  const valueNumeric = parseNumeric(row.value, row.valueNumeric);

  return {
    id: row.id,
    key: row.key,
    keyNormalized: row.keyNormalized,
    value: row.value,
    valueNumeric,
    unit: row.unit,
    observedAt: effectiveObservedAt,
    source: {
      reportId: row.report.id,
      reportDate: row.report.reportDate,
      reportUrl: row.report.reportURL,
      hospitalName: row.report.hospitalName,
      documentId: row.report.document.id,
      documentTitle: row.report.document.title,
    },
  };
}

async function fetchObservations(
  query: StructuredRetrievalQuery,
  options?: { forceLimit?: number; ascending?: boolean }
): Promise<{ observations: MetricObservation[]; resolution: MetricQueryResolution | null }> {
  const userId = await getCurrentDbUserId();
  const resolution = query.metricQuery ? resolveMetricQuery(query.metricQuery) : null;
  const matchedMetricKeys =
    query.metricQuery && resolution
      ? resolvePatientMetricKeys(
          query.metricQuery,
          resolution,
          await getNormalizedMetricCatalogForUser(userId)
        )
      : [];

  const where = buildObservationWhereClause(userId, query, resolution, matchedMetricKeys);

  const limit = options?.forceLimit ?? sanitizeLimit(query.limit);

  const rows = await prisma.medicalReportValue.findMany({
    where,
    include: {
      report: {
        select: {
          id: true,
          reportDate: true,
          reportURL: true,
          hospitalName: true,
          document: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: options?.ascending
      ? [
          { observedAt: "asc" },
          { report: { reportDate: "asc" } },
          { createdAt: "asc" },
        ]
      : [
          { observedAt: "desc" },
          { report: { reportDate: "desc" } },
          { createdAt: "desc" },
        ],
    take: limit,
  });

  return {
    observations: rows.map(toObservation),
    resolution,
  };
}

function calculateTrend(observations: MetricObservation[]): {
  direction: "up" | "down" | "stable";
  delta: number;
  deltaPercent: number | null;
} | null {
  const numericObservations = observations.filter((item) => item.valueNumeric !== null);
  if (numericObservations.length < 2) {
    return null;
  }

  const first = numericObservations[0].valueNumeric as number;
  const last = numericObservations[numericObservations.length - 1].valueNumeric as number;

  const delta = Number((last - first).toFixed(4));
  const deltaPercent = first !== 0 ? Number((((last - first) / Math.abs(first)) * 100).toFixed(2)) : null;

  const direction = Math.abs(delta) < 0.0001 ? "stable" : delta > 0 ? "up" : "down";

  return {
    direction,
    delta,
    deltaPercent,
  };
}

function findNormalRange(observation: MetricObservation): {
  min: number;
  max: number;
  unit: string | null;
} | null {
  const normalized = observation.keyNormalized ?? normalizeFreeTextMetricKey(observation.key);
  return METRIC_NORMAL_RANGES[normalized] ?? null;
}

export async function getStructuredLatestMetric(
  query: Omit<StructuredRetrievalQuery, "intent"> & { metricQuery: string }
): Promise<StructuredLatestMetricResult> {
  const { observations, resolution } = await fetchObservations(
    {
      ...query,
      intent: "GET_LATEST_METRIC",
      limit: 1,
    },
    { forceLimit: 1 }
  );

  return {
    intent: "GET_LATEST_METRIC",
    metric: query.metricQuery,
    resolution: resolution ?? resolveMetricQuery(query.metricQuery),
    latest: observations[0] ?? null,
    confidence: buildStructuredConfidence({
      resolution: resolution ?? resolveMetricQuery(query.metricQuery),
      hasData: Boolean(observations[0]),
      observationCount: observations.length,
    }),
  };
}

export async function getStructuredMetricHistory(
  query: Omit<StructuredRetrievalQuery, "intent"> & { metricQuery: string }
): Promise<StructuredMetricHistoryResult> {
  const { observations, resolution } = await fetchObservations(
    {
      ...query,
      intent: "GET_METRIC_HISTORY",
    },
    { ascending: true }
  );

  const resolvedMetric = resolution ?? resolveMetricQuery(query.metricQuery);
  const panelRows = isDlcPanelQuery(query.metricQuery, resolvedMetric)
    ? await fetchDlcPanelRowsForUser(await getCurrentDbUserId(), { ...query, intent: "GET_METRIC_HISTORY" }, {
        ascending: true,
      })
    : undefined;
  const hasData = observations.length > 0 || Boolean(panelRows && panelRows.length > 0);

  return {
    intent: "GET_METRIC_HISTORY",
    metric: query.metricQuery,
    resolution: resolvedMetric,
    observations,
    confidence: buildStructuredConfidence({
      resolution: resolvedMetric,
      hasData,
      observationCount: observations.length,
      panelRowsCount: panelRows?.length ?? 0,
    }),
    ...(panelRows && panelRows.length > 0
      ? {
          panelColumns: [...DLC_PANEL_COLUMNS],
          panelRows,
        }
      : {}),
  };
}

export async function getStructuredMetricTrend(
  query: Omit<StructuredRetrievalQuery, "intent"> & { metricQuery: string }
): Promise<StructuredMetricTrendResult> {
  const historyResult = await getStructuredMetricHistory(query);
  const trend = calculateTrend(historyResult.observations);

  return {
    intent: "GET_METRIC_TREND",
    metric: query.metricQuery,
    resolution: historyResult.resolution,
    observations: historyResult.observations,
    trend,
    confidence: buildStructuredConfidence({
      resolution: historyResult.resolution,
      hasData: historyResult.observations.length > 0,
      observationCount: historyResult.observations.length,
      hasTrend: Boolean(trend),
    }),
  };
}

export async function getStructuredAbnormalReadings(
  query: Omit<StructuredRetrievalQuery, "intent">
): Promise<StructuredAbnormalReadingsResult> {
  const { observations, resolution } = await fetchObservations(
    {
      ...query,
      intent: "GET_ABNORMAL_READINGS",
    },
    { ascending: true }
  );

  const abnormalReadings: AbnormalMetricObservation[] = observations
    .filter((observation) => observation.valueNumeric !== null)
    .flatMap((observation) => {
      const range = findNormalRange(observation);
      if (!range) {
        return [];
      }

      const value = observation.valueNumeric as number;
      if (value >= range.min && value <= range.max) {
        return [];
      }

      return [
        {
          observation,
          normalRange: range,
          deviation: {
            below: value < range.min ? Number((range.min - value).toFixed(4)) : null,
            above: value > range.max ? Number((value - range.max).toFixed(4)) : null,
          },
        },
      ];
    });

  return {
    intent: "GET_ABNORMAL_READINGS",
    metric: query.metricQuery ?? null,
    resolution,
    abnormalReadings,
    confidence: buildStructuredConfidence({
      resolution,
      hasData: abnormalReadings.length > 0,
      observationCount: abnormalReadings.length,
    }),
  };
}

export async function runStructuredRetrieval(
  query: StructuredRetrievalQuery
): Promise<StructuredRetrievalResult> {
  switch (query.intent) {
    case "GET_LATEST_METRIC": {
      if (!query.metricQuery) {
        throw new Error("metricQuery is required for GET_LATEST_METRIC");
      }
      return getStructuredLatestMetric({
        ...query,
        metricQuery: query.metricQuery,
      });
    }

    case "GET_METRIC_HISTORY": {
      if (!query.metricQuery) {
        throw new Error("metricQuery is required for GET_METRIC_HISTORY");
      }
      return getStructuredMetricHistory({
        ...query,
        metricQuery: query.metricQuery,
      });
    }

    case "GET_METRIC_TREND": {
      if (!query.metricQuery) {
        throw new Error("metricQuery is required for GET_METRIC_TREND");
      }
      return getStructuredMetricTrend({
        ...query,
        metricQuery: query.metricQuery,
      });
    }

    case "GET_ABNORMAL_READINGS": {
      return getStructuredAbnormalReadings(query);
    }

    default: {
      const exhaustiveCheck: never = query.intent;
      throw new Error(`Unsupported intent: ${String(exhaustiveCheck)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Patient-scoped retrieval
// ---------------------------------------------------------------------------
// These functions accept an explicit patientUserId instead of deriving the
// user from Clerk auth. This is needed when the logged-in user is a doctor
// querying data about a specific patient via the clinical copilot chat.
// ---------------------------------------------------------------------------

async function fetchObservationsForPatient(
  patientUserId: string,
  query: StructuredRetrievalQuery,
  options?: { forceLimit?: number; ascending?: boolean }
): Promise<{ observations: MetricObservation[]; resolution: MetricQueryResolution | null }> {
  const resolution = query.metricQuery ? resolveMetricQuery(query.metricQuery) : null;
  const matchedMetricKeys =
    query.metricQuery && resolution
      ? resolvePatientMetricKeys(
          query.metricQuery,
          resolution,
          await getNormalizedMetricCatalogForUser(patientUserId)
        )
      : [];

  const where = buildObservationWhereClause(patientUserId, query, resolution, matchedMetricKeys);

  const limit = options?.forceLimit ?? sanitizeLimit(query.limit);

  const rows = await prisma.medicalReportValue.findMany({
    where,
    include: {
      report: {
        select: {
          id: true,
          reportDate: true,
          reportURL: true,
          hospitalName: true,
          document: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: options?.ascending
      ? [
          { observedAt: "asc" },
          { report: { reportDate: "asc" } },
          { createdAt: "asc" },
        ]
      : [
          { observedAt: "desc" },
          { report: { reportDate: "desc" } },
          { createdAt: "desc" },
        ],
    take: limit,
  });

  return {
    observations: rows.map(toObservation),
    resolution,
  };
}

export async function runStructuredRetrievalForPatient(
  patientUserId: string,
  query: StructuredRetrievalQuery
): Promise<StructuredRetrievalResult> {
  switch (query.intent) {
    case "GET_LATEST_METRIC": {
      if (!query.metricQuery) {
        throw new Error("metricQuery is required for GET_LATEST_METRIC");
      }

      const { observations, resolution } = await fetchObservationsForPatient(
        patientUserId,
        { ...query, intent: "GET_LATEST_METRIC", limit: 1 },
        { forceLimit: 1 }
      );

      return {
        intent: "GET_LATEST_METRIC",
        metric: query.metricQuery,
        resolution: resolution ?? resolveMetricQuery(query.metricQuery),
        latest: observations[0] ?? null,
        confidence: buildStructuredConfidence({
          resolution: resolution ?? resolveMetricQuery(query.metricQuery),
          hasData: Boolean(observations[0]),
          observationCount: observations.length,
        }),
      };
    }

    case "GET_METRIC_HISTORY": {
      if (!query.metricQuery) {
        throw new Error("metricQuery is required for GET_METRIC_HISTORY");
      }

      const { observations, resolution } = await fetchObservationsForPatient(
        patientUserId,
        { ...query, intent: "GET_METRIC_HISTORY" },
        { ascending: true }
      );

      const resolvedMetric = resolution ?? resolveMetricQuery(query.metricQuery);
      const panelRows = isDlcPanelQuery(query.metricQuery, resolvedMetric)
        ? await fetchDlcPanelRowsForUser(patientUserId, { ...query, intent: "GET_METRIC_HISTORY" }, {
            ascending: true,
          })
        : undefined;
      const hasData = observations.length > 0 || Boolean(panelRows && panelRows.length > 0);

      return {
        intent: "GET_METRIC_HISTORY",
        metric: query.metricQuery,
        resolution: resolvedMetric,
        observations,
        confidence: buildStructuredConfidence({
          resolution: resolvedMetric,
          hasData,
          observationCount: observations.length,
          panelRowsCount: panelRows?.length ?? 0,
        }),
        ...(panelRows && panelRows.length > 0
          ? {
              panelColumns: [...DLC_PANEL_COLUMNS],
              panelRows,
            }
          : {}),
      };
    }

    case "GET_METRIC_TREND": {
      if (!query.metricQuery) {
        throw new Error("metricQuery is required for GET_METRIC_TREND");
      }

      const { observations, resolution } = await fetchObservationsForPatient(
        patientUserId,
        { ...query, intent: "GET_METRIC_HISTORY" },
        { ascending: true }
      );
      const trend = calculateTrend(observations);

      return {
        intent: "GET_METRIC_TREND",
        metric: query.metricQuery,
        resolution: resolution ?? resolveMetricQuery(query.metricQuery),
        observations,
        trend,
        confidence: buildStructuredConfidence({
          resolution: resolution ?? resolveMetricQuery(query.metricQuery),
          hasData: observations.length > 0,
          observationCount: observations.length,
          hasTrend: Boolean(trend),
        }),
      };
    }

    case "GET_ABNORMAL_READINGS": {
      const { observations, resolution } = await fetchObservationsForPatient(
        patientUserId,
        { ...query, intent: "GET_ABNORMAL_READINGS" },
        { ascending: true }
      );

      const abnormalReadings: AbnormalMetricObservation[] = observations
        .filter((observation) => observation.valueNumeric !== null)
        .flatMap((observation) => {
          const range = findNormalRange(observation);
          if (!range) {
            return [];
          }

          const value = observation.valueNumeric as number;
          if (value >= range.min && value <= range.max) {
            return [];
          }

          return [
            {
              observation,
              normalRange: range,
              deviation: {
                below: value < range.min ? Number((range.min - value).toFixed(4)) : null,
                above: value > range.max ? Number((value - range.max).toFixed(4)) : null,
              },
            },
          ];
        });

      return {
        intent: "GET_ABNORMAL_READINGS",
        metric: query.metricQuery ?? null,
        resolution,
        abnormalReadings,
        confidence: buildStructuredConfidence({
          resolution,
          hasData: abnormalReadings.length > 0,
          observationCount: abnormalReadings.length,
        }),
      };
    }

    default: {
      const exhaustiveCheck: never = query.intent;
      throw new Error(`Unsupported intent: ${String(exhaustiveCheck)}`);
    }
  }
}
