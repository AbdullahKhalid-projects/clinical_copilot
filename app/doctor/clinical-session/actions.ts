"use server";

import { prisma } from "@/lib/prisma";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function isLikelyClerkUserId(value: string | null | undefined): value is string {
  if (!value) return false;
  return value.startsWith("user_");
}

async function getCurrentDoctor() {
  const user = await currentUser();
  if (!user) {
    redirect("/");
  }

  const doctor = await prisma.doctorProfile.findFirst({
    where: {
      user: {
        clerkId: user.id,
      },
    },
  });

  if (!doctor) {
    return null;
  }

  return doctor;
}

export async function getClinicalSessionData(appointmentId: string) {
  const doctor = await getCurrentDoctor();

  if (!doctor) {
    console.log("Doctor profile not found for current user");
    return null;
  }

  console.log("Fetching appointment:", appointmentId);
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
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
  if (isLikelyClerkUserId(appointment?.patient?.user?.clerkId)) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(appointment.patient.user.clerkId);
      patientImageUrl = clerkUser.imageUrl;
    } catch {
      // Ignore stale/invalid Clerk IDs.
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

  const existingAppointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: {
      id: true,
      patientId: true,
    },
  });

  if (!existingAppointment) {
    throw new Error("Appointment not found");
  }

  // Update the appointment
  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      recordingUrl: recordingUrl,
      status: existingAppointment.patientId ? "IN_PROGRESS" : "UNLINKED",
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

export type LinkablePatient = {
  id: string;
  name: string;
  initials: string;
  imageUrl: string | null;
};

export async function getDoctorPatientsForLinking(): Promise<LinkablePatient[]> {
  const doctor = await getCurrentDoctor();
  if (!doctor) return [];

  const clerk = await clerkClient();

  const patients = await prisma.patientProfile.findMany({
    where: {
      appointments: {
        some: {
          doctorId: doctor.id,
        },
      },
    },
    include: {
      user: true,
    },
  });

  const sortedPatients = patients.sort((a, b) => {
    const nameA = a.user.name || "";
    const nameB = b.user.name || "";
    return nameA.localeCompare(nameB);
  });

  return Promise.all(
    sortedPatients.map(async (patient) => {
      let imageUrl: string | null = null;

      if (isLikelyClerkUserId(patient.user.clerkId)) {
        try {
          const clerkUser = await clerk.users.getUser(patient.user.clerkId);
          imageUrl = clerkUser.imageUrl ?? null;
        } catch {
          // Ignore stale/invalid Clerk IDs.
        }
      }

      const name = patient.user.name || "Unknown Patient";

      return {
        id: patient.id,
        name,
        initials: name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase(),
        imageUrl,
      };
    })
  );
}

export async function linkPatientToAppointment(appointmentId: string, patientId: string) {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return { success: false, error: "Doctor profile not found" };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
  });

  if (!appointment) {
    return { success: false, error: "Appointment not found" };
  }

  const patient = await prisma.patientProfile.findUnique({
    where: { id: patientId },
    include: { user: true },
  });

  if (!patient) {
    return { success: false, error: "Patient not found" };
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      patientId,
      status: "IN_PROGRESS",
    },
    include: {
      patient: {
        include: {
          user: true,
        },
      },
    },
  });

  let patientImageUrl = "";
  if (isLikelyClerkUserId(updatedAppointment.patient?.user?.clerkId)) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(updatedAppointment.patient.user.clerkId);
      patientImageUrl = clerkUser.imageUrl;
    } catch {
      // Ignore stale/invalid Clerk IDs.
    }
  }

  revalidatePath(`/doctor/clinical-session/${appointmentId}`);
  revalidatePath("/doctor/clinical-session");
  revalidatePath("/doctor/dashboard");

  return {
    success: true,
    appointment: {
      ...updatedAppointment,
      patientImageUrl,
    },
  };
}

export async function unlinkPatientFromAppointment(appointmentId: string) {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return { success: false, error: "Doctor profile not found" };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
  });

  if (!appointment) {
    return { success: false, error: "Appointment not found" };
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      patientId: null,
      status: "UNLINKED",
    },
    include: {
      patient: {
        include: {
          user: true,
        },
      },
    },
  });

  revalidatePath(`/doctor/clinical-session/${appointmentId}`);
  revalidatePath("/doctor/clinical-session");
  revalidatePath("/doctor/dashboard");

  return {
    success: true,
    appointment: {
      ...updatedAppointment,
      patientImageUrl: "",
    },
  };
}

export async function deleteAppointmentSession(appointmentId: string) {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return { success: false, error: "Doctor profile not found" };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: { id: true },
  });

  if (!appointment) {
    return { success: false, error: "Appointment not found" };
  }

  await prisma.appointment.delete({
    where: { id: appointment.id },
  });

  revalidatePath("/doctor/clinical-session");
  revalidatePath("/doctor/dashboard");
  revalidatePath("/doctor");

  return { success: true };
}
