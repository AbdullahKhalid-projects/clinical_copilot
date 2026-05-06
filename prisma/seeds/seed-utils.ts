import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const normalizedConnectionString = connectionString.includes("sslmode=require")
  ? connectionString.replace("sslmode=require", "sslmode=verify-full")
  : connectionString;

const pool = new Pool({ connectionString: normalizedConnectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function closeSeedConnections() {
  await prisma.$disconnect();
  await pool.end();
}
