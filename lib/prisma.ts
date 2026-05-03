import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dns from 'dns'

const connectionString = process.env.DATABASE_URL!

// Neon (and some other cloud Postgres providers) return AAAA (IPv6) records that
// can be unreachable from certain networks. Node.js v22 defaults to trying IPv6
// first, causing pg driver to hit ETIMEDOUT. Force IPv4 for .neon.tech hosts.
const originalLookup = dns.lookup
dns.lookup = function (
  hostname: string,
  options: any,
  callback?: any,
) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  if (typeof hostname === 'string' && hostname.includes('.neon.tech')) {
    options = { ...options, family: 4 }
  }
  return originalLookup(hostname, options, callback)
}

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
