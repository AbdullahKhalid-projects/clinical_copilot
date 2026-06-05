import { readFile } from "fs/promises";
import path from "path";

export type MedicationCatalogItem = {
  id: string;
  drugName: string;
  drugNameNormalized: string;
  manufacturer: string | null;
  strength: string | null;
  form: string | null;
  genericName: string | null;
  activeIngredients: string[];
  primekgQueryTerms: string[];
  matchConfidence: "high" | "medium" | "low" | null;
  mappingNotes: string | null;
  indication: string | null;
  sideEffects: string | null;
  availableIn: string | null;
  ageRestriction: string | null;
  prescriptionRequired: boolean;
  price: string | null;
  imageUrl: string | null;
  source: string | null;
};

type CsvMedicationRow = {
  "Drug Name"?: string;
  Manufacturer?: string;
  Strength?: string;
  Form?: string;
  Indication?: string;
  "Side Effects"?: string;
  "Available In"?: string;
  "Age Restriction"?: string;
  "Prescription Required"?: string;
  Price?: string;
};

type AlignmentRow = {
  local_name?: string;
  manufacturer_hint?: string;
  generic_name?: string;
  active_ingredients?: string;
  primekg_query_terms?: string;
  match_confidence?: string;
  mapping_notes?: string;
};

function splitCsvLine(line: string): string[] {
  return line
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map((value) => value.trim().replace(/^"|"$/g, "").replace(/""/g, "\""));
}

function cleanText(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a" || trimmed.toLowerCase() === "nan") {
    return null;
  }

  return trimmed;
}

function normalizeDrugName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function splitMultiValueField(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toMatchConfidence(
  value: string | null,
): "high" | "medium" | "low" | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }

  return null;
}

function buildAlignmentKey(localName: string, manufacturerHint: string | null): string {
  const base = normalizeDrugName(localName);
  const manufacturerPart = manufacturerHint ? `::${normalizeDrugName(manufacturerHint)}` : "";
  return `${base}${manufacturerPart}`;
}

async function loadMedicationAlignmentMap(): Promise<Map<string, AlignmentRow>> {
  const csvPath = path.join(process.cwd(), "medicine_data", "medicine_primekg_alignment.csv");
  const fileContents = await readFile(csvPath, "utf8");
  const lines = fileContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return new Map();
  }

  const headers = splitCsvLine(lines[0]);
  const map = new Map<string, AlignmentRow>();

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index]);
    const row = headers.reduce<Record<string, string>>((acc, header, headerIndex) => {
      acc[header] = values[headerIndex] ?? "";
      return acc;
    }, {}) as AlignmentRow;

    const localName = cleanText(row.local_name);
    if (!localName) {
      continue;
    }

    const manufacturerHint = cleanText(row.manufacturer_hint);
    map.set(buildAlignmentKey(localName, manufacturerHint), row);
    map.set(buildAlignmentKey(localName, null), row);
  }

  return map;
}

function rowToMedicationCatalogItem(
  row: CsvMedicationRow,
  index: number,
  alignment: AlignmentRow | null,
): MedicationCatalogItem | null {
  const drugName = cleanText(row["Drug Name"]);
  if (!drugName) {
    return null;
  }

  const normalized = normalizeDrugName(drugName);

  return {
    id: `csv-${normalized.replace(/\s+/g, "-")}-${index}`,
    drugName,
    drugNameNormalized: normalized,
    manufacturer: cleanText(row.Manufacturer),
    strength: cleanText(row.Strength),
    form: cleanText(row.Form),
    genericName: cleanText(alignment?.generic_name),
    activeIngredients: splitMultiValueField(cleanText(alignment?.active_ingredients)),
    primekgQueryTerms: splitMultiValueField(cleanText(alignment?.primekg_query_terms)),
    matchConfidence: toMatchConfidence(cleanText(alignment?.match_confidence)),
    mappingNotes: cleanText(alignment?.mapping_notes),
    indication: cleanText(row.Indication),
    sideEffects: cleanText(row["Side Effects"]),
    availableIn: cleanText(row["Available In"]),
    ageRestriction: cleanText(row["Age Restriction"]),
    prescriptionRequired: cleanText(row["Prescription Required"])?.toLowerCase() === "yes",
    price: cleanText(row.Price),
    imageUrl: null,
    source: "medicine_data",
  };
}

export async function loadMedicationCatalogFromCsv(): Promise<MedicationCatalogItem[]> {
  const csvPath = path.join(process.cwd(), "medicine_data", "Pakistan Medicines Dataset.csv");
  const fileContents = await readFile(csvPath, "utf8");
  const alignmentMap = await loadMedicationAlignmentMap();
  const lines = fileContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return [];
  }

  const headers = splitCsvLine(lines[0]);
  const records: MedicationCatalogItem[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index]);
    const row = headers.reduce<Record<string, string>>((acc, header, headerIndex) => {
      acc[header] = values[headerIndex] ?? "";
      return acc;
    }, {});

    const localName = cleanText(row["Drug Name"]);
    const manufacturer = cleanText(row.Manufacturer);
    const alignment =
      (localName
        ? alignmentMap.get(buildAlignmentKey(localName, manufacturer)) ??
          alignmentMap.get(buildAlignmentKey(localName, null)) ??
          null
        : null);

    const item = rowToMedicationCatalogItem(row, index, alignment);
    if (item) {
      records.push(item);
    }
  }

  return records.sort((a, b) => a.drugName.localeCompare(b.drugName));
}
