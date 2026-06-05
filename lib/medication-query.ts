type MedicationQuerySource = {
  drugName: string;
  genericName?: string | null;
  activeIngredients?: string[] | null;
  primekgQueryTerms?: string[] | null;
  fallbackQueryDrug?: string | null;
};

function normalizeLookupTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMedicationQueryCandidates(
  source: MedicationQuerySource,
): string[] {
  const candidates = [
    ...(source.primekgQueryTerms ?? []),
    source.genericName ?? null,
    ...(source.activeIngredients ?? []),
    source.fallbackQueryDrug ?? null,
    source.drugName,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = normalizeLookupTerm(candidate);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(candidate);
  }

  return unique;
}

export function getPrimaryMedicationQueryCandidate(
  source: MedicationQuerySource,
): string {
  return buildMedicationQueryCandidates(source)[0] ?? source.drugName.trim();
}
