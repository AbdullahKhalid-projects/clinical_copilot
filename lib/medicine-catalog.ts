import { readFile } from "fs/promises";
import path from "path";

export type MedicationCatalogItem = {
  id: string;
  drugName: string;
  drugNameNormalized: string;
  manufacturer: string | null;
  strength: string | null;
  form: string | null;
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

function rowToMedicationCatalogItem(row: CsvMedicationRow, index: number): MedicationCatalogItem | null {
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

    const item = rowToMedicationCatalogItem(row, index);
    if (item) {
      records.push(item);
    }
  }

  return records.sort((a, b) => a.drugName.localeCompare(b.drugName));
}
