"use server";

import type { Prisma } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
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
    hospitalName: string | null;
    documentId: string;
    documentTitle: string;
  };
}

export interface StructuredLatestMetricResult {
  intent: "GET_LATEST_METRIC";
  metric: string;
  resolution: MetricQueryResolution;
  latest: MetricObservation | null;
}

export interface StructuredMetricHistoryResult {
  intent: "GET_METRIC_HISTORY";
  metric: string;
  resolution: MetricQueryResolution;
  observations: MetricObservation[];
}

export interface StructuredMetricTrendResult {
  intent: "GET_METRIC_TREND";
  metric: string;
  resolution: MetricQueryResolution;
  observations: MetricObservation[];
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
}

export type StructuredRetrievalResult =
  | StructuredLatestMetricResult
  | StructuredMetricHistoryResult
  | StructuredMetricTrendResult
  | StructuredAbnormalReadingsResult;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

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

function buildMetricCondition(metricQuery: string, resolution: MetricQueryResolution): Prisma.MedicalReportValueWhereInput {
  const metricConditions: Prisma.MedicalReportValueWhereInput[] = [
    { key: { contains: metricQuery, mode: "insensitive" } },
  ];

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

  return { OR: metricConditions };
}

function buildObservationWhereClause(
  userId: string,
  query: StructuredRetrievalQuery,
  resolution: MetricQueryResolution | null
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
    andClauses.push(buildMetricCondition(query.metricQuery, resolution));
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

  const where = buildObservationWhereClause(userId, query, resolution);

  const limit = options?.forceLimit ?? sanitizeLimit(query.limit);

  const rows = await prisma.medicalReportValue.findMany({
    where,
    include: {
      report: {
        select: {
          id: true,
          reportDate: true,
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

  return {
    intent: "GET_METRIC_HISTORY",
    metric: query.metricQuery,
    resolution: resolution ?? resolveMetricQuery(query.metricQuery),
    observations,
  };
}

export async function getStructuredMetricTrend(
  query: Omit<StructuredRetrievalQuery, "intent"> & { metricQuery: string }
): Promise<StructuredMetricTrendResult> {
  const historyResult = await getStructuredMetricHistory(query);

  return {
    intent: "GET_METRIC_TREND",
    metric: query.metricQuery,
    resolution: historyResult.resolution,
    observations: historyResult.observations,
    trend: calculateTrend(historyResult.observations),
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
