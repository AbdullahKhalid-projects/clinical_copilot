// seed-doctor.ts
import 'dotenv/config'
import { prisma } from './lib/prisma'
import { Role } from '@prisma/client'

async function main() {
  const doctorClerkId = "user_38U83AcMjWIFjjwWRpoKWiKDeck"
  const doctorEmail = "qamarraza1223@gmail.com"
  const doctorName = "Qamar Raza"

  // 1. Ensure User exists and is a DOCTOR
  const user = await prisma.user.upsert({
    where: { clerkId: doctorClerkId },
    update: {
      role: Role.DOCTOR,
    },
    create: {
      clerkId: doctorClerkId,
      email: doctorEmail,
      name: doctorName,
      role: Role.DOCTOR,
    }
  })

  console.log("Doctor User ensured:", user.id)

  // 2. Upsert Doctor Profile
  const doctorProfile = await prisma.doctorProfile.upsert({
    where: { userId: user.id },
    update: {
      specialization: "General Practice",
      // Add other fields if schema allows, currently schema only has specialization
    },
    create: {
      userId: user.id,
      specialization: "General Practice",
    }
  })

  console.log("Doctor Profile ensured:", doctorProfile.id)

  // 3. Ensure a few patients exist to have appointments with
  const patientData = [
    { name: "John Doe", email: "john@example.com", clerkId: "patient_john_123" },
    { name: "Jane Smith", email: "jane@example.com", clerkId: "patient_jane_123" }
  ]

  const patientProfiles = []

  for (const p of patientData) {
    const pUser = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        clerkId: p.clerkId,
        email: p.email,
        name: p.name,
        role: Role.PATIENT
      }
    })

    const pProfile = await prisma.patientProfile.upsert({
      where: { userId: pUser.id },
      update: {},
      create: {
        userId: pUser.id,
        dateOfBirth: new Date("1990-01-01"),
        gender: "Other"
      }
    })
    patientProfiles.push(pProfile)
  }

  // 4. Create Appointments for Today
  // Clear existing appointments for this doctor today to avoid duplicates
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  await prisma.appointment.deleteMany({
    where: {
      doctorId: doctorProfile.id,
      date: {
        gte: todayStart,
        lte: todayEnd
      }
    }
  })

  // Create new ones
  const appointmentsToCreate = [
    {
      date: new Date(new Date().setHours(9, 0, 0, 0)), // 9:00 AM Today
      reason: "Annual Checkup",
      status: "PENDING",
      patientId: patientProfiles[0].id
    },
    {
      date: new Date(new Date().setHours(10, 30, 0, 0)), // 10:30 AM Today
      reason: "Headache consultation",
      status: "PENDING",
      patientId: patientProfiles[1].id
    },
     {
      date: new Date(new Date().setHours(14, 0, 0, 0)), // 2:00 PM Today
      reason: "Follow up",
      status: "COMPLETED",
      patientId: patientProfiles[0].id
    }
  ]

  for (const appt of appointmentsToCreate) {
    await prisma.appointment.create({
      data: {
        date: appt.date,
        reason: appt.reason,
        status: appt.status,
        doctorId: doctorProfile.id,
        patientId: appt.patientId
      }
    })
  }

  console.log("Seeding completed successfully.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
