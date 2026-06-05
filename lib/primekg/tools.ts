import {
  getPrimeKgDiseasesForDrugQuery,
  getPrimeKgDrugsForDiseaseQuery,
  getPrimeKgDiseaseContextQuery,
  getPrimeKgDrugContextQuery,
  getPrimeKgRelatedDiseasesQuery,
  getPrimeKgTargetsForDrugQuery,
  runPrimeKgReadQuery,
  searchPrimeKgEntitiesQuery,
} from "@/lib/neo4j/primekg";

export type PrimeKgDrugContextResult = {
  ok: boolean;
  drugName: string;
  matchedDrug: string | null;
  indications: string[];
  contraindications: string[];
  targets: Array<{
    protein: string;
    role: string | null;
  }>;
  error?: string;
};

export type PrimeKgDiseaseContextResult = {
  ok: boolean;
  diseaseName: string;
  matchedDisease: string | null;
  indicatedDrugs: string[];
  contraindicatedDrugs: string[];
  relatedDiseases: Array<{
    disease: string;
    linkType: string | null;
  }>;
  error?: string;
};

export type PrimeKgEntitySearchResult = {
  ok: boolean;
  query: string;
  entityType: "any" | "drug" | "disease" | "gene/protein";
  matches: Array<{
    entityName: string;
    entityType: string | null;
    labels: string[];
  }>;
  error?: string;
};

export type PrimeKgDrugsForDiseaseResult = {
  ok: boolean;
  diseaseName: string;
  matchedDisease: string | null;
  indicatedDrugs: string[];
  error?: string;
};

export type PrimeKgDiseasesForDrugResult = {
  ok: boolean;
  drugName: string;
  matchedDrug: string | null;
  indicationDiseases: string[];
  contraindicationDiseases: string[];
  offLabelDiseases: string[];
  error?: string;
};

export type PrimeKgTargetsForDrugResult = {
  ok: boolean;
  drugName: string;
  matchedDrug: string | null;
  targets: Array<{
    protein: string;
    role: string | null;
  }>;
  error?: string;
};

export type PrimeKgRelatedDiseasesResult = {
  ok: boolean;
  diseaseName: string;
  matchedDisease: string | null;
  relatedDiseases: Array<{
    disease: string;
    linkType: string | null;
  }>;
  error?: string;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) =>
      typeof item === "string" ? item.trim() : String(item ?? "").trim(),
    )
    .filter((item) => item.length > 0);
}

function toStringRecordArray(
  value: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

export async function executePrimeKgDrugContextTool(input: {
  drugName: string;
}): Promise<PrimeKgDrugContextResult> {
  const drugName = input.drugName.trim();

  if (!drugName) {
    return {
      ok: false,
      drugName,
      matchedDrug: null,
      indications: [],
      contraindications: [],
      targets: [],
      error: "drugName is required.",
    };
  }

  const queryResult = await runPrimeKgReadQuery(getPrimeKgDrugContextQuery, {
    drugName,
  });

  if (!queryResult.ok) {
    return {
      ok: false,
      drugName,
      matchedDrug: null,
      indications: [],
      contraindications: [],
      targets: [],
      error: queryResult.error,
    };
  }

  const firstRow = queryResult.rows[0];
  if (!firstRow) {
    return {
      ok: false,
      drugName,
      matchedDrug: null,
      indications: [],
      contraindications: [],
      targets: [],
      error: "No PrimeKG result rows found. Confirm the drug exists in the graph.",
    };
  }

  return {
    ok: true,
    drugName,
    matchedDrug:
      typeof firstRow.drug === "string" && firstRow.drug.trim()
        ? firstRow.drug.trim()
        : null,
    indications: toStringArray(firstRow.indications),
    contraindications: toStringArray(firstRow.contraindications),
    targets: toStringRecordArray(firstRow.targets).map((item) => ({
      protein:
        typeof item.protein === "string" && item.protein.trim()
          ? item.protein.trim()
          : "Unknown",
      role:
        typeof item.role === "string" && item.role.trim()
          ? item.role.trim()
          : null,
    })),
  };
}

export async function executePrimeKgEntitySearchTool(input: {
  query: string;
  entityType?: "any" | "drug" | "disease" | "gene/protein";
}): Promise<PrimeKgEntitySearchResult> {
  const query = input.query.trim();
  const entityType = input.entityType ?? "any";

  if (!query) {
    return {
      ok: false,
      query,
      entityType,
      matches: [],
      error: "query is required.",
    };
  }

  const queryResult = await runPrimeKgReadQuery(searchPrimeKgEntitiesQuery, {
    query,
    entityType,
  });

  if (!queryResult.ok) {
    return {
      ok: false,
      query,
      entityType,
      matches: [],
      error: queryResult.error,
    };
  }

  return {
    ok: true,
    query,
    entityType,
    matches: queryResult.rows.map((row) => ({
      entityName:
        typeof row.entity_name === "string" && row.entity_name.trim()
          ? row.entity_name.trim()
          : "Unknown",
      entityType:
        typeof row.entity_type === "string" && row.entity_type.trim()
          ? row.entity_type.trim()
          : null,
      labels: toStringArray(row.labels),
    })),
  };
}

export async function executePrimeKgDrugsForDiseaseTool(input: {
  diseaseName: string;
}): Promise<PrimeKgDrugsForDiseaseResult> {
  const diseaseName = input.diseaseName.trim();

  if (!diseaseName) {
    return {
      ok: false,
      diseaseName,
      matchedDisease: null,
      indicatedDrugs: [],
      error: "diseaseName is required.",
    };
  }

  const queryResult = await runPrimeKgReadQuery(getPrimeKgDrugsForDiseaseQuery, {
    diseaseName,
  });

  if (!queryResult.ok) {
    return {
      ok: false,
      diseaseName,
      matchedDisease: null,
      indicatedDrugs: [],
      error: queryResult.error,
    };
  }

  const firstRow = queryResult.rows[0];
  if (!firstRow) {
    return {
      ok: false,
      diseaseName,
      matchedDisease: null,
      indicatedDrugs: [],
      error:
        "No PrimeKG result rows found. Confirm the disease exists in the graph.",
    };
  }

  return {
    ok: true,
    diseaseName,
    matchedDisease:
      typeof firstRow.disease === "string" && firstRow.disease.trim()
        ? firstRow.disease.trim()
        : null,
    indicatedDrugs: toStringArray(firstRow.indicated_drugs),
  };
}

export async function executePrimeKgDiseasesForDrugTool(input: {
  drugName: string;
}): Promise<PrimeKgDiseasesForDrugResult> {
  const drugName = input.drugName.trim();

  if (!drugName) {
    return {
      ok: false,
      drugName,
      matchedDrug: null,
      indicationDiseases: [],
      contraindicationDiseases: [],
      offLabelDiseases: [],
      error: "drugName is required.",
    };
  }

  const queryResult = await runPrimeKgReadQuery(
    getPrimeKgDiseasesForDrugQuery,
    {
      drugName,
    },
  );

  if (!queryResult.ok) {
    return {
      ok: false,
      drugName,
      matchedDrug: null,
      indicationDiseases: [],
      contraindicationDiseases: [],
      offLabelDiseases: [],
      error: queryResult.error,
    };
  }

  const firstRow = queryResult.rows[0];
  if (!firstRow) {
    return {
      ok: false,
      drugName,
      matchedDrug: null,
      indicationDiseases: [],
      contraindicationDiseases: [],
      offLabelDiseases: [],
      error: "No PrimeKG result rows found. Confirm the drug exists in the graph.",
    };
  }

  return {
    ok: true,
    drugName,
    matchedDrug:
      typeof firstRow.drug === "string" && firstRow.drug.trim()
        ? firstRow.drug.trim()
        : null,
    indicationDiseases: toStringArray(firstRow.indication_diseases),
    contraindicationDiseases: toStringArray(
      firstRow.contraindication_diseases,
    ),
    offLabelDiseases: toStringArray(firstRow.off_label_diseases),
  };
}

export async function executePrimeKgTargetsForDrugTool(input: {
  drugName: string;
}): Promise<PrimeKgTargetsForDrugResult> {
  const drugName = input.drugName.trim();

  if (!drugName) {
    return {
      ok: false,
      drugName,
      matchedDrug: null,
      targets: [],
      error: "drugName is required.",
    };
  }

  const queryResult = await runPrimeKgReadQuery(getPrimeKgTargetsForDrugQuery, {
    drugName,
  });

  if (!queryResult.ok) {
    return {
      ok: false,
      drugName,
      matchedDrug: null,
      targets: [],
      error: queryResult.error,
    };
  }

  const firstRow = queryResult.rows[0];
  if (!firstRow) {
    return {
      ok: false,
      drugName,
      matchedDrug: null,
      targets: [],
      error: "No PrimeKG result rows found. Confirm the drug exists in the graph.",
    };
  }

  return {
    ok: true,
    drugName,
    matchedDrug:
      typeof firstRow.drug === "string" && firstRow.drug.trim()
        ? firstRow.drug.trim()
        : null,
    targets: toStringRecordArray(firstRow.targets).map((item) => ({
      protein:
        typeof item.protein === "string" && item.protein.trim()
          ? item.protein.trim()
          : "Unknown",
      role:
        typeof item.role === "string" && item.role.trim()
          ? item.role.trim()
          : null,
    })),
  };
}

export async function executePrimeKgDiseaseContextTool(input: {
  diseaseName: string;
}): Promise<PrimeKgDiseaseContextResult> {
  const diseaseName = input.diseaseName.trim();

  if (!diseaseName) {
    return {
      ok: false,
      diseaseName,
      matchedDisease: null,
      indicatedDrugs: [],
      contraindicatedDrugs: [],
      relatedDiseases: [],
      error: "diseaseName is required.",
    };
  }

  const queryResult = await runPrimeKgReadQuery(
    getPrimeKgDiseaseContextQuery,
    {
      diseaseName,
    },
  );

  if (!queryResult.ok) {
    return {
      ok: false,
      diseaseName,
      matchedDisease: null,
      indicatedDrugs: [],
      contraindicatedDrugs: [],
      relatedDiseases: [],
      error: queryResult.error,
    };
  }

  const firstRow = queryResult.rows[0];
  if (!firstRow) {
    return {
      ok: false,
      diseaseName,
      matchedDisease: null,
      indicatedDrugs: [],
      contraindicatedDrugs: [],
      relatedDiseases: [],
      error:
        "No PrimeKG result rows found. Confirm the disease exists in the graph.",
    };
  }

  return {
    ok: true,
    diseaseName,
    matchedDisease:
      typeof firstRow.disease === "string" && firstRow.disease.trim()
        ? firstRow.disease.trim()
        : null,
    indicatedDrugs: toStringArray(firstRow.indicated_drugs),
    contraindicatedDrugs: toStringArray(firstRow.contraindicated_drugs),
    relatedDiseases: toStringRecordArray(firstRow.related_diseases).map(
      (item) => ({
        disease:
          typeof item.disease === "string" && item.disease.trim()
            ? item.disease.trim()
            : "Unknown",
        linkType:
          typeof item.link_type === "string" && item.link_type.trim()
            ? item.link_type.trim()
            : null,
      }),
    ),
  };
}

export async function executePrimeKgRelatedDiseasesTool(input: {
  diseaseName: string;
}): Promise<PrimeKgRelatedDiseasesResult> {
  const diseaseName = input.diseaseName.trim();

  if (!diseaseName) {
    return {
      ok: false,
      diseaseName,
      matchedDisease: null,
      relatedDiseases: [],
      error: "diseaseName is required.",
    };
  }

  const queryResult = await runPrimeKgReadQuery(
    getPrimeKgRelatedDiseasesQuery,
    {
      diseaseName,
    },
  );

  if (!queryResult.ok) {
    return {
      ok: false,
      diseaseName,
      matchedDisease: null,
      relatedDiseases: [],
      error: queryResult.error,
    };
  }

  const firstRow = queryResult.rows[0];
  if (!firstRow) {
    return {
      ok: false,
      diseaseName,
      matchedDisease: null,
      relatedDiseases: [],
      error:
        "No PrimeKG result rows found. Confirm the disease exists in the graph.",
    };
  }

  return {
    ok: true,
    diseaseName,
    matchedDisease:
      typeof firstRow.disease === "string" && firstRow.disease.trim()
        ? firstRow.disease.trim()
        : null,
    relatedDiseases: toStringRecordArray(firstRow.related_diseases).map(
      (item) => ({
        disease:
          typeof item.disease === "string" && item.disease.trim()
            ? item.disease.trim()
            : "Unknown",
        linkType:
          typeof item.link_type === "string" && item.link_type.trim()
            ? item.link_type.trim()
            : null,
      }),
    ),
  };
}

export function formatPrimeKgEntitySearchToolOutput(
  result: PrimeKgEntitySearchResult,
): string {
  if (!result.ok) {
    return `Failed to search PrimeKG entities: ${result.error ?? "Unknown PrimeKG error."}`;
  }

  const matchesTable = result.matches.length
    ? [
        "| Entity | Type | Labels |",
        "| --- | --- | --- |",
        ...result.matches.map(
          (item) =>
            `| ${item.entityName} | ${item.entityType ?? "n/a"} | ${item.labels.join(", ") || "n/a"} |`,
        ),
      ].join("\n")
    : "No entity matches found.";

  return [
    `PrimeKG entity search for query: ${result.query}`,
    `Entity type filter: ${result.entityType}`,
    "",
    matchesTable,
  ].join("\n");
}

export function formatPrimeKgDrugContextToolOutput(
  result: PrimeKgDrugContextResult,
): string {
  if (!result.ok) {
    return `Failed to retrieve PrimeKG drug context: ${result.error ?? "Unknown PrimeKG error."}`;
  }

  const targetsTable = result.targets.length
    ? [
        "| Protein | Role |",
        "| --- | --- |",
        ...result.targets.map(
          (item) => `| ${item.protein} | ${item.role ?? "n/a"} |`,
        ),
      ].join("\n")
    : "No target rows found.";

  return [
    `PrimeKG drug context retrieved for query: ${result.drugName}`,
    `Matched drug: ${result.matchedDrug ?? "n/a"}`,
    `Indications: ${result.indications.length ? result.indications.join(", ") : "none"}`,
    `Contraindications: ${result.contraindications.length ? result.contraindications.join(", ") : "none"}`,
    "",
    targetsTable,
  ].join("\n");
}

export function formatPrimeKgDrugsForDiseaseToolOutput(
  result: PrimeKgDrugsForDiseaseResult,
): string {
  if (!result.ok) {
    return `Failed to retrieve PrimeKG disease-to-drug links: ${result.error ?? "Unknown PrimeKG error."}`;
  }

  return [
    `PrimeKG disease-to-drug lookup for query: ${result.diseaseName}`,
    `Matched disease: ${result.matchedDisease ?? "n/a"}`,
    `Indicated drugs: ${result.indicatedDrugs.length ? result.indicatedDrugs.join(", ") : "none"}`,
  ].join("\n");
}

export function formatPrimeKgDiseasesForDrugToolOutput(
  result: PrimeKgDiseasesForDrugResult,
): string {
  if (!result.ok) {
    return `Failed to retrieve PrimeKG drug-to-disease links: ${result.error ?? "Unknown PrimeKG error."}`;
  }

  return [
    `PrimeKG drug-to-disease lookup for query: ${result.drugName}`,
    `Matched drug: ${result.matchedDrug ?? "n/a"}`,
    `Indication diseases: ${result.indicationDiseases.length ? result.indicationDiseases.join(", ") : "none"}`,
    `Contraindication diseases: ${result.contraindicationDiseases.length ? result.contraindicationDiseases.join(", ") : "none"}`,
    `Off-label diseases: ${result.offLabelDiseases.length ? result.offLabelDiseases.join(", ") : "none"}`,
  ].join("\n");
}

export function formatPrimeKgTargetsForDrugToolOutput(
  result: PrimeKgTargetsForDrugResult,
): string {
  if (!result.ok) {
    return `Failed to retrieve PrimeKG drug targets: ${result.error ?? "Unknown PrimeKG error."}`;
  }

  const targetsTable = result.targets.length
    ? [
        "| Protein | Role |",
        "| --- | --- |",
        ...result.targets.map(
          (item) => `| ${item.protein} | ${item.role ?? "n/a"} |`,
        ),
      ].join("\n")
    : "No target rows found.";

  return [
    `PrimeKG drug targets lookup for query: ${result.drugName}`,
    `Matched drug: ${result.matchedDrug ?? "n/a"}`,
    "",
    targetsTable,
  ].join("\n");
}

export function formatPrimeKgDiseaseContextToolOutput(
  result: PrimeKgDiseaseContextResult,
): string {
  if (!result.ok) {
    return `Failed to retrieve PrimeKG disease context: ${result.error ?? "Unknown PrimeKG error."}`;
  }

  const relatedDiseasesTable = result.relatedDiseases.length
    ? [
        "| Related disease | Link type |",
        "| --- | --- |",
        ...result.relatedDiseases.map(
          (item) => `| ${item.disease} | ${item.linkType ?? "n/a"} |`,
        ),
      ].join("\n")
    : "No related disease rows found.";

  return [
    `PrimeKG disease context retrieved for query: ${result.diseaseName}`,
    `Matched disease: ${result.matchedDisease ?? "n/a"}`,
    `Indicated drugs: ${result.indicatedDrugs.length ? result.indicatedDrugs.join(", ") : "none"}`,
    `Contraindicated drugs: ${result.contraindicatedDrugs.length ? result.contraindicatedDrugs.join(", ") : "none"}`,
    "",
    relatedDiseasesTable,
  ].join("\n");
}

export function formatPrimeKgRelatedDiseasesToolOutput(
  result: PrimeKgRelatedDiseasesResult,
): string {
  if (!result.ok) {
    return `Failed to retrieve PrimeKG related diseases: ${result.error ?? "Unknown PrimeKG error."}`;
  }

  const relatedDiseasesTable = result.relatedDiseases.length
    ? [
        "| Related disease | Link type |",
        "| --- | --- |",
        ...result.relatedDiseases.map(
          (item) => `| ${item.disease} | ${item.linkType ?? "n/a"} |`,
        ),
      ].join("\n")
    : "No related disease rows found.";

  return [
    `PrimeKG related diseases lookup for query: ${result.diseaseName}`,
    `Matched disease: ${result.matchedDisease ?? "n/a"}`,
    "",
    relatedDiseasesTable,
  ].join("\n");
}
