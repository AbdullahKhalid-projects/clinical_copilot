require("dotenv/config");
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

async function main() {
  const count = await prisma.medicineCatalog.count();
  console.log(`medicineCatalogCount=${count}`);
}

main()
  .catch((error) => {
    console.error("Failed to check medicine catalog count:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
