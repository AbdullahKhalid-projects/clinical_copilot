'use server'

import { prisma } from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const appointmentSchema = z.object({
  doctorId: z.string().min(1, "Doctor is required"),
  date: z.string().refine((date) => new Date(date) > new Date(), {
    message: "Appointment date must be in the future",
  }),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

export async function getDoctors() {
  try {
    const doctors = await prisma.doctorProfile.findMany({
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });
    return { success: true, data: doctors };
  } catch (error) {
    console.error("Error fetching doctors:", error);
    return { success: false, error: "Failed to fetch doctors" };
  }
}

export async function bookAppointment(formData: FormData) {
  const user = await currentUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Find the user in our database using clerkId
    const dbUser = await prisma.user.findUnique({
        where: { clerkId: user.id },
        include: { patientProfile: true }
    });

    if (!dbUser || !dbUser.patientProfile) {
        return { success: false, error: "Patient profile not found. Please complete your profile." };
    }

    const rawData = {
      doctorId: formData.get("doctorId") as string,
      date: formData.get("date") as string,
      reason: formData.get("reason") as string,
    };

    const validation = appointmentSchema.safeParse(rawData);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const errorMessage = Object.values(errors).flat().join(", ");
      return { success: false, error: errorMessage };
    }

    const { doctorId, date, reason } = validation.data;

    await prisma.appointment.create({
      data: {
        patientId: dbUser.patientProfile.id,
        doctorId: doctorId,
        date: new Date(date),
        reason: reason,
        status: "PENDING",
      },
    });

    revalidatePath("/patient");
    revalidatePath("/doctor");
    return { success: true };
  } catch (error) {
    console.error("Error booking appointment:", error);
    return { success: false, error: "Failed to book appointment" };
  }
}

// Notes Actions
const noteSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  category: z.string().optional(),
});

export async function createNote(formData: FormData) {
  const user = await currentUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { clerkId: user.id },
      include: { patientProfile: true },
    });

    if (!dbUser || !dbUser.patientProfile) {
      return { success: false, error: "Patient profile not found" };
    }

    const rawData = {
      title: formData.get("title") as string,
      content: formData.get("content") as string,
      category: (formData.get("category") as string) || "General",
    };

    const validation = noteSchema.safeParse(rawData);

    if (!validation.success) {
      return { success: false, error: "Invalid input" };
    }

    await prisma.patientNote.create({
      data: {
        patientId: dbUser.patientProfile.id,
        title: validation.data.title,
        content: validation.data.content,
        tags: validation.data.category, // Storing category in tags field for now
        date: new Date(),
      },
    });

    revalidatePath("/patient/notes");
    return { success: true };
  } catch (error) {
    console.error("Error creating note:", error);
    return { success: false, error: "Failed to create note" };
  }
}

export async function deleteNote(id: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    await prisma.patientNote.delete({
      where: { id },
    });
    revalidatePath("/patient/notes");
    return { success: true };
  } catch (error) {
    console.error("Error deleting note:", error);
    return { success: false, error: "Failed to delete note" };
  }
}

// Reminder Actions
const reminderSchema = z.object({
  title: z.string().min(1, "Title is required"),
  date: z.string().min(1, "Date is required"),
  isRecurring: z.string().optional(), // Checkbox sends "on" or null
});

export async function createReminder(formData: FormData) {
  const user = await currentUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { clerkId: user.id },
      include: { patientProfile: true },
    });

    if (!dbUser || !dbUser.patientProfile) {
      return { success: false, error: "Patient profile not found" };
    }

    const rawData = {
      title: formData.get("title") as string,
      date: formData.get("date") as string,
      isRecurring: formData.get("isRecurring") as string,
    };

    const validation = reminderSchema.safeParse(rawData);

    if (!validation.success) {
      return { success: false, error: "Invalid input" };
    }

    await prisma.patientReminder.create({
      data: {
        patientId: dbUser.patientProfile.id,
        text: validation.data.title, // Mapping title to text
        date: new Date(validation.data.date),
        isCompleted: false,
      },
    });

    revalidatePath("/patient/notes");
    return { success: true };
  } catch (error) {
    console.error("Error creating reminder:", error);
    return { success: false, error: "Failed to create reminder" };
  }
}

export async function toggleReminder(id: string, currentIsCompleted: boolean) {
  const user = await currentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    await prisma.patientReminder.update({
      where: { id },
      data: { isCompleted: !currentIsCompleted },
    });
    revalidatePath("/patient/notes");
    return { success: true };
  } catch (error) {
    console.error("Error toggling reminder:", error);
    return { success: false, error: "Failed to toggle reminder" };
  }
}

export async function deleteReminder(id: string) {
  const user = await currentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    await prisma.patientReminder.delete({
      where: { id },
    });
    revalidatePath("/patient/notes");
    return { success: true };
  } catch (error) {
    console.error("Error deleting reminder:", error);
    return { success: false, error: "Failed to delete reminder" };
  }
}
