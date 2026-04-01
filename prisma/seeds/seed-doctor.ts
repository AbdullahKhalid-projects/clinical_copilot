/* eslint-disable no-console */
import { AppointmentStatus, Role } from "@prisma/client";

import { closeSeedConnections, prisma } from "./seed-utils";

const DOCTOR = {
  clerkId: "user_38U83AcMjWIFjjwWRpoKWiKDeck",
  email: "qamarraza1223@gmail.com",
  name: "Qamar Raza",
  specialization: "General Practice",
};

const PATIENTS = [
  { name: "John Doe", email: "john@example.com", clerkId: "patient_john_123" },
  { name: "Jane Smith", email: "jane@example.com", clerkId: "patient_jane_123" },
];

function todayAt(hours: number, minutes = 0) {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

async function main() {
  const doctorUser = await prisma.user.upsert({
    where: { clerkId: DOCTOR.clerkId },
    update: {
      email: DOCTOR.email,
      name: DOCTOR.name,
      role: Role.DOCTOR,
    },
    create: {
      clerkId: DOCTOR.clerkId,
      email: DOCTOR.email,
      name: DOCTOR.name,
      role: Role.DOCTOR,
    },
  });

  const doctorProfile = await prisma.doctorProfile.upsert({
    where: { userId: doctorUser.id },
    update: {
      specialization: DOCTOR.specialization,
    },
    create: {
      userId: doctorUser.id,
      specialization: DOCTOR.specialization,
    },
  });

  const patientProfiles = [];

  for (const patient of PATIENTS) {
    const patientUser = await prisma.user.upsert({
      where: { email: patient.email },
      update: {
        name: patient.name,
        role: Role.PATIENT,
      },
      create: {
        clerkId: patient.clerkId,
        email: patient.email,
        name: patient.name,
        role: Role.PATIENT,
      },
    });

    const patientProfile = await prisma.patientProfile.upsert({
      where: { userId: patientUser.id },
      update: {
        dateOfBirth: new Date("1990-01-01"),
        gender: "Other",
      },
      create: {
        userId: patientUser.id,
        dateOfBirth: new Date("1990-01-01"),
        gender: "Other",
      },
    });

    patientProfiles.push(patientProfile);
  }

  if (patientProfiles.length < 2) {
    throw new Error("Expected at least two patient profiles to seed doctor appointments.");
  }

  const todayStart = todayAt(0, 0);
  const todayEnd = todayAt(23, 59);

  await prisma.appointment.deleteMany({
    where: {
      doctorId: doctorProfile.id,
      date: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

  await prisma.appointment.createMany({
    data: [
      {
        date: todayAt(9, 0),
        reason: "Annual Checkup",
        status: AppointmentStatus.PENDING,
        doctorId: doctorProfile.id,
        patientId: patientProfiles[0].id,
      },
      {
        date: todayAt(10, 30),
        reason: "Headache consultation",
        status: AppointmentStatus.PENDING,
        doctorId: doctorProfile.id,
        patientId: patientProfiles[1].id,
      },
      {
        date: todayAt(14, 0),
        reason: "Follow up",
        status: AppointmentStatus.COMPLETED,
        doctorId: doctorProfile.id,
        patientId: patientProfiles[0].id,
      },
    ],
  });

  console.log(`Doctor seed complete. DoctorProfile: ${doctorProfile.id}`);
}

main()
  .catch((error) => {
    console.error("Doctor seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await closeSeedConnections();
  });
