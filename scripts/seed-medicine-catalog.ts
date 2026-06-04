import { prisma } from "@/lib/prisma";
import { loadMedicationCatalogFromCsv } from "@/lib/medicine-catalog";

async function main() {
  const medications = await loadMedicationCatalogFromCsv();
  const db = prisma as any;

  if (!db.medicineCatalog?.createMany) {
    throw new Error("MedicineCatalog delegate is unavailable. Run Prisma generate after applying the schema.");
  }

  await db.medicineCatalog.deleteMany({
    where: {
      source: "medicine_data",
    },
  });

  await db.medicineCatalog.createMany({
    data: medications.map((medication) => ({
      drugName: medication.drugName,
      drugNameNormalized: medication.drugNameNormalized,
      manufacturer: medication.manufacturer,
      strength: medication.strength,
      form: medication.form,
      indication: medication.indication,
      sideEffects: medication.sideEffects,
      availableIn: medication.availableIn,
      ageRestriction: medication.ageRestriction,
      prescriptionRequired: medication.prescriptionRequired,
      price: medication.price,
      imageUrl: medication.imageUrl,
      source: medication.source,
      isActive: true,
    })),
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
  });
