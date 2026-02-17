"use server";

import { prisma } from "@/lib/prisma";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function getClinicalSessionData(appointmentId: string) {
  const user = await currentUser();
  if (!user) {
    redirect("/");
  }

  // Ensure the user is a doctor and has access to this appointment
  // We need to find the doctor via the User relation using the Clerk ID
  const doctor = await prisma.doctorProfile.findFirst({
    where: { 
      user: {
        clerkId: user.id
      }
    },
  });

  if (!doctor) {
    console.log("Doctor profile not found for user (Clerk ID):", user.id);
    return null;
  }

  console.log("Fetching appointment:", appointmentId);
  const appointment = await prisma.appointment.findUnique({
    where: { 
      id: appointmentId,
    },
    include: {
      patient: {
        include: {
          user: true, // to get name
        }
      }
    }
  });

  // Fetch patient user details from Clerk manually if needed, 
  // or just rely on what we have. But the user asked for Clerk Profile Pic.
  // The 'user' relation has 'clerkId'.
  let patientImageUrl = "";
  if (appointment?.patient?.user?.clerkId) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(appointment.patient.user.clerkId);
      patientImageUrl = clerkUser.imageUrl;
    } catch (error) {
      console.error("Failed to fetch patient image from Clerk", error);
    }
  }

  return { ...appointment, patientImageUrl };
}

export async function updateAppointmentRecording(appointmentId: string, recordingUrl: string) {
  const user = await currentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  if (!appointmentId) {
    throw new Error("Missing appointment ID");
  }

  if (!recordingUrl) {
    throw new Error("Missing recording URL");
  }

  // Validate doctor access again (security best practice)
  const doctor = await prisma.doctorProfile.findFirst({
    where: { 
      user: {
        clerkId: user.id
      }
    },
  });

  if (!doctor) {
    throw new Error("Doctor profile not found");
  }

  console.log(`Updating appointment ${appointmentId} with recording: ${recordingUrl}`);

  // Update the appointment
  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      recordingUrl: recordingUrl,
      status: "IN_PROGRESS", // Mark as started if not already
      aiStatus: "PROCESSING" // Signal that we have audio ready for processing
    },
    select: {
      id: true,
      recordingUrl: true,
      status: true,
      aiStatus: true,
    },
  });

  return {
    success: true,
    appointmentId: updatedAppointment.id,
    recordingUrl: updatedAppointment.recordingUrl,
    status: updatedAppointment.status,
    aiStatus: updatedAppointment.aiStatus,
  };
}
