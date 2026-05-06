import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL!

// Fix for "SSL mode 'require' is treated as 'verify-full'" warning
const pool = new Pool({ 
  connectionString: connectionString.includes("sslmode=require") 
    ? connectionString.replace("sslmode=require", "sslmode=verify-full") 
    : connectionString 
})
const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
