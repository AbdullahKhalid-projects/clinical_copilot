require("dotenv/config");
const fs = require("fs");
const path = require("path");
const dns = require("dns");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
const originalLookup = dns.lookup;

dns.lookup = function lookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  if (typeof hostname === "string" && hostname.includes(".neon.tech")) {
    options = { ...options, family: 4 };
  }

  return originalLookup(hostname, options, callback);
};

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function splitCsvLine(line) {
  return line
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map((value) => value.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
}

function cleanText(value) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === "n/a" || lowered === "nan") {
    return null;
  }

  return trimmed;
}

function normalizeDrugName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function main() {
  const csvPath = path.join(process.cwd(), "medicine_data", "Pakistan Medicines Dataset.csv");
  const fileContents = fs.readFileSync(csvPath, "utf8");
  const lines = fileContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    throw new Error("Medicine CSV appears to be empty.");
  }

  const headers = splitCsvLine(lines[0]);
  const medications = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvLine(lines[index]);
    const row = headers.reduce((acc, header, headerIndex) => {
      acc[header] = values[headerIndex] || "";
      return acc;
    }, {});

    const drugName = cleanText(row["Drug Name"]);
    if (!drugName) {
      continue;
    }

    medications.push({
      drugName,
      drugNameNormalized: normalizeDrugName(drugName),
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
      isActive: true,
    });
  }

  await prisma.medicineCatalog.deleteMany({
    where: {
      source: "medicine_data",
    },
  });

  await prisma.medicineCatalog.createMany({
    data: medications,
  });

  console.log(`Seeded ${medications.length} medicine catalog rows.`);
}

main()
  .catch((error) => {
    console.error("Failed to seed medicine catalog:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
