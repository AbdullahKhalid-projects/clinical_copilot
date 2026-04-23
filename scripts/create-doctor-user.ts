import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { clerkClient } from '@clerk/nextjs/server'

const connectionString = process.env.DATABASE_URL!
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

function deriveNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] || 'Doctor'
  return localPart
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function main() {
  const email = (process.env.NEW_DOCTOR_EMAIL ?? '').trim().toLowerCase()
  const password = (process.env.NEW_DOCTOR_PASSWORD ?? '').trim()
  const name = (process.env.NEW_DOCTOR_NAME ?? '').trim() || deriveNameFromEmail(email)
  const specialization = (process.env.NEW_DOCTOR_SPECIALIZATION ?? 'General Practice').trim()

  if (!email) {
    throw new Error('NEW_DOCTOR_EMAIL is required')
  }

  if (password.length < 8) {
    throw new Error('NEW_DOCTOR_PASSWORD must be at least 8 characters')
  }

  const clerk = await clerkClient()

  const listResult = await (clerk.users as any).getUserList({
    emailAddress: [email],
    limit: 1,
  })

  const existingClerkUser = Array.isArray(listResult)
    ? listResult[0]
    : Array.isArray(listResult?.data)
      ? listResult.data[0]
      : undefined

  let clerkUserId: string

  if (existingClerkUser?.id) {
    clerkUserId = existingClerkUser.id
    console.log('CLERK_USER_ALREADY_EXISTS', clerkUserId)
  } else {
    const createdClerkUser = await clerk.users.createUser({
      emailAddress: [email],
      password,
      firstName: name.split(' ')[0] || 'Doctor',
      lastName: name.split(' ').slice(1).join(' ') || 'User',
    })
    clerkUserId = createdClerkUser.id
    console.log('CLERK_USER_CREATED', clerkUserId)
  }

  let dbUser = await prisma.user.findUnique({ where: { clerkId: clerkUserId } })

  if (!dbUser) {
    const existingByEmail = await prisma.user.findUnique({ where: { email } })
    if (existingByEmail) {
      dbUser = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          clerkId: clerkUserId,
          email,
          name,
          role: 'DOCTOR',
        },
      })
      console.log('DB_USER_UPDATED_FROM_EMAIL_MATCH', dbUser.id)
    } else {
      dbUser = await prisma.user.create({
        data: {
          clerkId: clerkUserId,
          email,
          name,
          role: 'DOCTOR',
        },
      })
      console.log('DB_USER_CREATED', dbUser.id)
    }
  } else {
    dbUser = await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        email,
        name,
        role: 'DOCTOR',
      },
    })
    console.log('DB_USER_UPDATED', dbUser.id)
  }

  const doctorProfile = await prisma.doctorProfile.upsert({
    where: { userId: dbUser.id },
    update: { specialization },
    create: {
      userId: dbUser.id,
      specialization,
    },
  })

  console.log('DOCTOR_PROFILE_READY', doctorProfile.id, specialization)
  console.log('DONE', email)
}

main()
  .catch((error) => {
    console.error('CREATE_DOCTOR_USER_FAILED', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
