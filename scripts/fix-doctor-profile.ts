
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL!

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Checking for Doctor users without profiles...")


 // add the email of the user you want to fix here (or a unique part of it for a contains search) 
  const emailPattern = "khalidabdullah651@gmail.com" 
  
  const user = await prisma.user.findFirst({
    where: {
      email: {
        contains: emailPattern
      }
    },
    include: {
      doctorProfile: true
    }
  })

  if (!user) {
    console.error(`User matching "${emailPattern}" not found.`)
    return
  }

  console.log(`Found user: ${user.name} (${user.email})`)
  console.log(`Current Role: ${user.role}`)
  console.log(`Has Doctor Profile: ${user.doctorProfile ? "YES" : "NO"}`)

  // 1. Update Role if needed
  if (user.role !== 'DOCTOR') {
    console.log(`Updating role to DOCTOR...`)
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'DOCTOR' }
    })
    console.log("  -> Role updated.")
  }

  // 2. Create Profile if missing
  // this just sets basic doctor variables
  if (!user.doctorProfile) {
    console.log(`Creating DoctorProfile...`)
    
    await prisma.doctorProfile.create({
      data: {
        userId: user.id,
        specialization: "General Practice",
      }
    })
    console.log("  -> DoctorProfile created.")
  } else {
    console.log("DoctorProfile already exists. No action needed.")
  }

  console.log("All checks passed. User should now have access.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
