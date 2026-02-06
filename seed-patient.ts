// seed-patient.ts
import 'dotenv/config'
import { prisma } from './lib/prisma'

async function main() {
  const patientClerkId = "user_394c9L7j1tEcc3ywdG1DzBAlK4N" // The patient ID we saw earlier

  // 1. Find the user
  const user = await prisma.user.findUnique({
    where: { clerkId: patientClerkId }
  })

  if (!user) {
    console.error("User not found! Please sign up via the app first.")
    return
  }

  // 2. Upsert Patient Profile
  const profile = await prisma.patientProfile.upsert({
    where: { userId: user.id },
    update: {
      dateOfBirth: new Date("1985-05-15"),
      gender: "Male",
      height: "180 cm",
      weight: "75 kg",
      bloodType: "O+",
      allergies: "Penicillin, Peanuts",
      conditions: "Hypertension, Seasonal Allergies",
      aiSummary: "Patient shows stable vitals. Blood pressure has improved over the last 3 months. Adherence to medication is high. Recommended to continue current exercise regime."
    },
    create: {
      userId: user.id,
      dateOfBirth: new Date("1985-05-15"),
      gender: "Male",
      height: "180 cm",
      weight: "75 kg",
      bloodType: "O+",
      allergies: "Penicillin, Peanuts",
      conditions: "Hypertension, Seasonal Allergies",
      aiSummary: "Patient shows stable vitals. Blood pressure has improved over the last 3 months. Adherence to medication is high. Recommended to continue current exercise regime."
    }
  })

  console.log("Updated Profile:", profile.id)

  // 3. Add Medications (Prescriptions)
  // Clear existing first to avoid duplicates for this seed run
  await prisma.prescription.deleteMany({ where: { patientId: profile.id } })

  await prisma.prescription.createMany({
    data: [
      {
        name: "Lisinopril",
        dosage: "10mg",
        frequency: "Once daily",
        startDate: new Date("2026-01-01"),
        status: "ACTIVE",
        patientId: profile.id
      },
      {
        name: "Atorvastatin",
        dosage: "20mg",
        frequency: "Once daily at night",
        startDate: new Date("2026-01-01"),
        status: "ACTIVE",
        patientId: profile.id
      }
    ]
  })
  console.log("Added Medications")

  // 4. Add Health Metrics
  await prisma.healthMetric.deleteMany({ where: { patientId: profile.id } })
  
  await prisma.healthMetric.createMany({
    data: [
      { type: "blood_pressure", value: "120/80", unit: "mmHg", trend: "down", status: "Normal", patientId: profile.id },
      { type: "heart_rate", value: "72", unit: "bpm", trend: "stable", status: "Normal", patientId: profile.id },
      { type: "weight", value: "75", unit: "kg", trend: "stable", status: "Normal", patientId: profile.id }
    ]
  })
  console.log("Added Health Metrics")
  
  // 5. Add an Appointment
  // Find a doctor to link if possible, else leave unconnected for now (optional relation)
  const doctorUser = await prisma.user.findFirst({ where: { role: 'DOCTOR' } })
  let doctorProfileId = null
  
  if (doctorUser) {
    const docProfile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUser.id }})
    if (docProfile) doctorProfileId = docProfile.id
  }

  // If no doctor profile exists, create one strictly for the seed (optional)
  // For now, let's just creating the appointment without doctor if relation allows
  // My schema says: `doctorId String?`, `doctor DoctorProfile?` -> So it is optional.
  
  // Actually, let's create a dummy doctor profile if needed to make it look real
  // But wait, doctorId is Optional in schema? 
  // `doctorId String?` Yes.

  await prisma.appointment.deleteMany({ where: { patientId: profile.id } })
  
  await prisma.appointment.create({
    data: {
      date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days from now
      status: "PENDING",
      reason: "Regular Follow-up",
      notes: "Please bring blood pressure logs.",
      patientId: profile.id,
      doctorId: doctorProfileId || undefined // Relation needs ID if present
      // If doctorProfileId is null, we can't set it. undefined avoids passing the key?
      // Actually prisma create: if doctorId is undefined, it's fine.
    }
  })
  console.log("Added Appointment")

}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

