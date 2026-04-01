/* eslint-disable no-console */
import { AppointmentStatus, Role } from "@prisma/client";

import { closeSeedConnections, prisma } from "./seed-utils";

const PATIENT = {
  clerkId: "user_394c9L7j1tEcc3ywdG1DzBAlK4N",
  email: "seed.patient@example.com",
  name: "Seed Patient",
};

async function main() {
  const patientUser = await prisma.user.upsert({
    where: { clerkId: PATIENT.clerkId },
    update: {
      email: PATIENT.email,
      name: PATIENT.name,
      role: Role.PATIENT,
    },
    create: {
      clerkId: PATIENT.clerkId,
      email: PATIENT.email,
      name: PATIENT.name,
      role: Role.PATIENT,
    },
  });

  const patientProfile = await prisma.patientProfile.upsert({
    where: { userId: patientUser.id },
    update: {
      dateOfBirth: new Date("1985-05-15"),
      gender: "Male",
      height: "180 cm",
      weight: "75 kg",
      bloodType: "O+",
      allergies: "Penicillin, Peanuts",
      conditions: "Hypertension, Seasonal Allergies",
      aiSummary:
        "Patient shows stable vitals. Blood pressure improved over the last 3 months. Adherence to medication is high.",
    },
    create: {
      userId: patientUser.id,
      dateOfBirth: new Date("1985-05-15"),
      gender: "Male",
      height: "180 cm",
      weight: "75 kg",
      bloodType: "O+",
      allergies: "Penicillin, Peanuts",
      conditions: "Hypertension, Seasonal Allergies",
      aiSummary:
        "Patient shows stable vitals. Blood pressure improved over the last 3 months. Adherence to medication is high.",
    },
  });

  await prisma.prescription.deleteMany({ where: { patientId: patientProfile.id } });
  await prisma.prescription.createMany({
    data: [
      {
        name: "Lisinopril",
        dosage: "10mg",
        frequency: "Once daily",
        startDate: new Date("2026-01-01"),
        status: "ACTIVE",
        patientId: patientProfile.id,
      },
      {
        name: "Atorvastatin",
        dosage: "20mg",
        frequency: "Once daily at night",
        startDate: new Date("2026-01-01"),
        status: "ACTIVE",
        patientId: patientProfile.id,
      },
    ],
  });

  await prisma.healthMetric.deleteMany({ where: { patientId: patientProfile.id } });
  await prisma.healthMetric.createMany({
    data: [
      {
        type: "blood_pressure",
        value: "120/80",
        unit: "mmHg",
        trend: "down",
        status: "Normal",
        patientId: patientProfile.id,
      },
      {
        type: "heart_rate",
        value: "72",
        unit: "bpm",
        trend: "stable",
        status: "Normal",
        patientId: patientProfile.id,
      },
      {
        type: "weight",
        value: "75",
        unit: "kg",
        trend: "stable",
        status: "Normal",
        patientId: patientProfile.id,
      },
    ],
  });

  const doctorProfile = await prisma.doctorProfile.findFirst({
    orderBy: { id: "asc" },
  });

  await prisma.appointment.deleteMany({ where: { patientId: patientProfile.id } });
  await prisma.appointment.create({
    data: {
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: AppointmentStatus.PENDING,
      reason: "Regular Follow-up",
      notes: "Please bring blood pressure logs.",
      patientId: patientProfile.id,
      doctorId: doctorProfile?.id ?? null,
    },
  });

  console.log(`Patient seed complete. PatientProfile: ${patientProfile.id}`);
}

main()
  .catch((error) => {
    console.error("Patient seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await closeSeedConnections();
  });
