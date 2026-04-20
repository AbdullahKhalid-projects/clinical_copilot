import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";

const DUMMY_PATIENT_PROFILE = {
  dateOfBirth: new Date("1992-08-17"),
  gender: "Female",
  phone: "+1-555-0109",
  address: "742 Wellness Ave, Springfield",
  emergencyContact: "Alex Doe (+1-555-0191)",
  bloodType: "O+",
  height: "168 cm",
  weight: "64 kg",
  allergies: "Penicillin",
  conditions: "Mild asthma",
  aiSummary:
    "Demo patient profile with stable vitals and no urgent concerns.",
};

export async function createUser(data: {
  clerkId: string;
  email: string;
  name: string;
}) {
  try {
    const user = await prisma.user.create({
      data: {
        clerkId: data.clerkId,
        email: data.email,
        name: data.name,
        role: "PATIENT", 
        patientProfile: {
          create: {}, // Create empty profile
        },
      },
    });
    return user;
  } catch (error) {
    console.error("Error creating user:", error);
    throw error; 
  }
}

export async function createPatientUserWithPassword(data: {
  email: string;
  password: string;
  name?: string;
}) {
  const email = data.email.trim().toLowerCase();
  const password = data.password.trim();
  const name = data.name?.trim() || "Demo Patient";

  if (!email) {
    throw new Error("Email is required");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingEmail) {
    throw new Error("A user with this email already exists in the database");
  }

  const clerk = await clerkClient();

  const createdClerkUser = await clerk.users.createUser({
    emailAddress: [email],
    password,
    firstName: name.split(" ")[0] || "Demo",
    lastName: name.split(" ").slice(1).join(" ") || "Patient",
  });

  try {
    const dbUser = await prisma.user.upsert({
      where: { clerkId: createdClerkUser.id },
      update: {
        email,
        name,
        role: "PATIENT",
      },
      create: {
        clerkId: createdClerkUser.id,
        email,
        name,
        role: "PATIENT",
      },
      select: {
        id: true,
        clerkId: true,
        email: true,
        role: true,
      },
    });

    const patientProfile = await prisma.patientProfile.upsert({
      where: { userId: dbUser.id },
      update: {
        ...DUMMY_PATIENT_PROFILE,
      },
      create: {
        userId: dbUser.id,
        ...DUMMY_PATIENT_PROFILE,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    return {
      success: true,
      user: dbUser,
      patientProfile,
    };
  } catch (error) {
    console.error("Error creating patient user with password:", error);
    throw error;
  }
}

export async function updateUser(clerkId: string, data: {
  email?: string;
  name?: string;
}) {
  try {
    const user = await prisma.user.update({
      where: { clerkId },
      data: {
        email: data.email,
        name: data.name,
      },
    });
    return user;
  } catch (error) {
    console.error("Error updating user:", error);
    throw error;
  }
}

export async function deleteUser(clerkId: string) {
  try {
    const user = await prisma.user.delete({
      where: { clerkId },
    });
    return user;
  } catch (error) {
    console.error("Error deleting user:", error);
    throw error;
  }
}
