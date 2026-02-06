import { prisma } from "@/lib/prisma";

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
