import { CANONICAL_METRICS, METRIC_STOP_WORDS } from "./metricAliasDictionary";

interface ResolvedMetricKey {
  canonicalKey: string;
  normalizedKey: string;
  isAliasMapped: boolean;
  strategy: "exact" | "regex" | "fuzzy" | "fallback";
  bestCandidate?: {
    canonicalKey: string;
    score: number;
  };
}

export interface MetricQueryResolution {
  rawQuery: string;
  normalizedQuery: string | null;
  canonicalKey: string | null;
  isAliasMapped: boolean;
  strategy: "exact" | "regex" | "fuzzy" | "fallback";
  confidence: number;
  suggestedCanonicalKey: string | null;
}

const EXACT_ALIAS_INDEX = buildExactAliasIndex();

export function resolveMetricQuery(
  metricQuery: string,
  unitHint?: string | null
): MetricQueryResolution {
  const normalizedQuery = normalizeMetricKey(metricQuery);
  if (!normalizedQuery) {
    return {
      rawQuery: metricQuery,
      normalizedQuery: null,
      canonicalKey: null,
      isAliasMapped: false,
      strategy: "fallback",
      confidence: 0,
      suggestedCanonicalKey: null,
    };
  }

  const resolved = resolveCanonicalMetricKey(
    metricQuery,
    normalizeMetricUnit(unitHint ?? null)
  );

  const canonicalKey =
    resolved.canonicalKey === "unknown metric" ? null : resolved.canonicalKey;
  const suggestedCanonicalKey =
    resolved.bestCandidate && resolved.bestCandidate.score >= 0.5
      ? resolved.bestCandidate.canonicalKey
      : null;

  return {
    rawQuery: metricQuery,
    normalizedQuery,
    canonicalKey,
    isAliasMapped: resolved.isAliasMapped,
    strategy: resolved.strategy,
    confidence: Number((resolved.bestCandidate?.score ?? 0).toFixed(3)),
    suggestedCanonicalKey,
  };
}

function normalizeMetricKey(key: string): string | null {
  if (!key) {
    return null;
  }

  const normalized = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized : null;
}

function normalizeMetricUnit(unit: string | null): string | null {
  if (!unit) {
    return null;
  }

  const normalized = unit.trim().toUpperCase().replace(/\s+/g, "");
  return normalized.length > 0 ? normalized : null;
}

function resolveCanonicalMetricKey(
  rawKey: string,
  unitNormalized: string | null
): ResolvedMetricKey {
  const normalizedKey = normalizeMetricKey(rawKey);
  if (!normalizedKey) {
    return {
      canonicalKey: "unknown metric",
      normalizedKey: "unknown metric",
      isAliasMapped: false,
      strategy: "fallback",
    };
  }

  const exactMatch = EXACT_ALIAS_INDEX.get(normalizedKey);
  if (exactMatch) {
    return {
      canonicalKey: exactMatch,
      normalizedKey,
      isAliasMapped: true,
      strategy: "exact",
    };
  }

  let bestCandidate: { canonicalKey: string; score: number } | null = null;

  for (const definition of CANONICAL_METRICS) {
    if (definition.regexPatterns?.some((pattern) => pattern.test(normalizedKey))) {
      return {
        canonicalKey: definition.canonicalKey,
        normalizedKey,
        isAliasMapped: true,
        strategy: "regex",
      };
    }

    const aliasScore = getBestAliasSimilarity(normalizedKey, definition.aliases);
    let score = aliasScore;

    if (unitNormalized && definition.unitHints?.includes(unitNormalized)) {
      score += 0.08;
    }

    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = {
        canonicalKey: definition.canonicalKey,
        score,
      };
    }
  }

  if (bestCandidate && bestCandidate.score >= 0.72) {
    return {
      canonicalKey: bestCandidate.canonicalKey,
      normalizedKey,
      isAliasMapped: true,
      strategy: "fuzzy",
      bestCandidate,
    };
  }

  return {
    canonicalKey: normalizedKey,
    normalizedKey,
    isAliasMapped: false,
    strategy: "fallback",
    bestCandidate: bestCandidate ?? undefined,
  };
}

function buildExactAliasIndex(): Map<string, string> {
  const index = new Map<string, string>();

  for (const metric of CANONICAL_METRICS) {
    const canonicalNormalized = normalizeMetricKey(metric.canonicalKey);
    if (canonicalNormalized) {
      index.set(canonicalNormalized, metric.canonicalKey);
    }

    for (const alias of metric.aliases) {
      const aliasNormalized = normalizeMetricKey(alias);
      if (aliasNormalized) {
        index.set(aliasNormalized, metric.canonicalKey);
      }
    }
  }

  return index;
}

function getBestAliasSimilarity(key: string, aliases: string[]): number {
  let best = 0;

  for (const alias of aliases) {
    const aliasNormalized = normalizeMetricKey(alias);
    if (!aliasNormalized) {
      continue;
    }

    const similarity = getTokenSimilarity(key, aliasNormalized);
    if (similarity > best) {
      best = similarity;
    }
  }

  return best;
}

function getTokenSimilarity(a: string, b: string): number {
  const aTokens = tokenizeMetricKey(a);
  const bTokens = tokenizeMetricKey(b);

  if (aTokens.length === 0 || bTokens.length === 0) {
    return 0;
  }

  let overlap = 0;
  const bSet = new Set(bTokens);
  for (const token of aTokens) {
    if (bSet.has(token)) {
      overlap += 1;
    }
  }

  const overlapScore = overlap / Math.max(aTokens.length, bTokens.length);
  const charSimilarity = normalizedLevenshteinSimilarity(a, b);
  return overlapScore * 0.75 + charSimilarity * 0.25;
}

function tokenizeMetricKey(value: string): string[] {
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !METRIC_STOP_WORDS.has(token));
}

function normalizedLevenshteinSimilarity(a: string, b: string): number {
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) {
    return 1;
  }
  return 1 - dist / maxLen;
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
