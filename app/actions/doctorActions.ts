'use server'

import { prisma } from "@/lib/prisma";
import { currentUser, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

// Helper to ensure user is authenticated. 
// In a real app, you'd also check if the user is a DOCTOR and owns this appointment.
async function checkAuth() {
  const user = await currentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function createNewAppointmentSession() {
  try {
    const clerkUser = await checkAuth();

    const dbUser = await prisma.user.findUnique({
      where: { clerkId: clerkUser.id },
      include: { doctorProfile: true },
    });

    if (!dbUser?.doctorProfile) {
      return { success: false, error: "Doctor profile not found" };
    }

    let appointmentId: string;

    try {
      const appointment = await prisma.appointment.create({
        data: {
          doctorId: dbUser.doctorProfile.id,
          patientId: null,
          date: new Date(),
          status: "UNLINKED",
        },
        select: { id: true },
      });

      appointmentId = appointment.id;
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "";

      if (!message.includes("Argument `patient` is missing")) {
        throw createError;
      }

      const fallbackId = randomUUID();
      const now = new Date();

      await prisma.$executeRaw`
        INSERT INTO "Appointment" ("id", "date", "status", "doctorId", "patientId", "createdAt", "updatedAt")
        VALUES (${fallbackId}, ${now}, CAST(${"UNLINKED"} AS "AppointmentStatus"), ${dbUser.doctorProfile.id}, ${null}, ${now}, ${now})
      `;

      appointmentId = fallbackId;
    }

    revalidatePath("/doctor");
    revalidatePath("/doctor/clinical-session");

    return { success: true, appointmentId };
  } catch (error) {
    console.error("Error creating new appointment session:", error);
    const message = error instanceof Error ? error.message : "Failed to create appointment";
    return { success: false, error: message };
  }
}

export async function startAppointment(appointmentId: string) {
  try {
    await checkAuth();

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "IN_PROGRESS" },
    });

    revalidatePath("/doctor");
    revalidatePath("/patient");
    return { success: true };
  } catch (error) {
    console.error("Error starting appointment:", error);
    return { success: false, error: "Failed to start appointment" };
  }
}

export async function completeAppointment(appointmentId: string, notes: string) {
  try {
    await checkAuth();

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { 
        status: "COMPLETED"
      },
    });

    revalidatePath("/doctor");
    revalidatePath("/patient");
    return { success: true };
  } catch (error) {
    console.error("Error completing appointment:", error);
    return { success: false, error: "Failed to complete appointment" };
  }
}

export async function cancelAppointment(appointmentId: string) {
  try {
    await checkAuth();

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELLED" },
    });

    revalidatePath("/doctor");
    revalidatePath("/patient");
    return { success: true };
  } catch (error) {
    console.error("Error cancelling appointment:", error);
    return { success: false, error: "Failed to cancel appointment" };
  }
}

export async function getDoctorDashboardData() {
  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("Unauthorized");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
    include: { doctorProfile: true }
  });

  if (!dbUser || !dbUser.doctorProfile) {
    return null;
  }

  const doctorProfile = dbUser.doctorProfile;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Parallel queries for dashboard data
  const [
    todayAppointments,
    weekAppointments,
    distinctPatientsResult,
    newPatientsThisWeek,
    inProgressSessions,
    unlinkedSessions,
    completedWithoutSoap,
    recentAppointments,
  ] = await Promise.all([
    // 1. Today's appointments with patient info
    prisma.appointment.findMany({
      where: {
        doctorId: doctorProfile.id,
        patientId: { not: null },
        date: { gte: todayStart, lte: todayEnd },
      },
      include: {
        patient: { include: { user: true } },
      },
      orderBy: { date: 'asc' },
    }),

    // 2. This week's appointments count
    prisma.appointment.count({
      where: {
        doctorId: doctorProfile.id,
        patientId: { not: null },
        date: { gte: weekStart },
      },
    }),

    // 3. Total unique patients ever
    prisma.appointment.findMany({
      where: {
        doctorId: doctorProfile.id,
        patientId: { not: null },
      },
      distinct: ['patientId'],
      select: { patientId: true },
    }),

    // 4. New patients this week (first appointment in last 7 days)
    prisma.appointment.groupBy({
      by: ['patientId'],
      where: {
        doctorId: doctorProfile.id,
        patientId: { not: null },
        date: { gte: weekStart },
      },
      _min: { date: true },
    }).then(groups =>
      groups.filter(g => g._min.date && g._min.date >= weekStart).length
    ),

    // 5. In-progress sessions (need attention)
    prisma.appointment.findMany({
      where: {
        doctorId: doctorProfile.id,
        status: 'IN_PROGRESS',
      },
      include: {
        patient: { include: { user: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),

    // 6. Unlinked sessions (no patient assigned)
    prisma.appointment.findMany({
      where: {
        doctorId: doctorProfile.id,
        status: 'UNLINKED',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),

    // 7. Completed appointments without SOAP notes (filter soapNote in JS to avoid Prisma Json null type issues)
    prisma.appointment.findMany({
      where: {
        doctorId: doctorProfile.id,
        status: 'COMPLETED',
        patientId: { not: null },
      },
      include: {
        patient: { include: { user: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }).then(appts => appts.filter(appt => appt.soapNote === null).slice(0, 5)),

    // 8. Recent appointments for "Recent Patients" section (last 10)
    prisma.appointment.findMany({
      where: {
        doctorId: doctorProfile.id,
        patientId: { not: null },
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
      },
      include: {
        patient: { include: { user: true } },
      },
      orderBy: { date: 'desc' },
      take: 10,
    }),
  ]);

  // Deduplicate recent patients by patientId, keep most recent
  const seenPatientIds = new Set<string>();
  const recentPatients = recentAppointments
    .filter(appt => {
      if (!appt.patientId || seenPatientIds.has(appt.patientId)) return false;
      seenPatientIds.add(appt.patientId);
      return true;
    })
    .slice(0, 5)
    .map(appt => {
      const patientName = appt.patient?.user.name || "Unknown Patient";
      return {
        id: appt.patientId!,
        name: patientName,
        initials: patientName.split(" ").map(n => n[0]).join("").substring(0, 2),
        lastVisit: appt.date.toLocaleDateString(),
        condition: appt.reason || "General Consultation",
      };
    });

  const totalAppointmentsToday = todayAppointments.length;
  const distinctPatients = distinctPatientsResult.length;

  // Action items
  const actionItems = [
    ...inProgressSessions.map(appt => {
      const patientName = appt.patient?.user.name || "Unknown Patient";
      return {
        id: appt.id,
        type: 'IN_PROGRESS' as const,
        title: `Session in progress with ${patientName}`,
        subtitle: `Started ${appt.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        patientId: appt.patientId ?? undefined,
        appointmentId: appt.id,
      };
    }),
    ...unlinkedSessions.map(appt => ({
      id: appt.id,
      type: 'UNLINKED' as const,
      title: 'Unlinked session needs patient',
      subtitle: `Created ${appt.createdAt.toLocaleDateString()}`,
      appointmentId: appt.id,
    })),
    ...completedWithoutSoap.map(appt => {
      const patientName = appt.patient?.user.name || "Unknown Patient";
      return {
        id: appt.id,
        type: 'MISSING_NOTES' as const,
        title: `SOAP notes missing for ${patientName}`,
        subtitle: `Completed ${appt.date.toLocaleDateString()}`,
        patientId: appt.patientId ?? undefined,
        appointmentId: appt.id,
      };
    }),
  ].slice(0, 6);

  const pendingNotesCount = inProgressSessions.length + completedWithoutSoap.length;

  // Fetch all patients from the database (not just this doctor's)
  const allPatientsRaw = await prisma.patientProfile.findMany({
    where: {
      user: {
        role: "PATIENT",
      },
    },
    include: {
      user: {
        select: {
          name: true,
          clerkId: true,
          email: true,
        },
      },
      appointments: {
        orderBy: { date: "desc" },
        take: 1,
      },
    },
    orderBy: {
      user: {
        name: "asc",
      },
    },
    take: 10,
  });

  // Fetch Clerk images for all patients in parallel
  const clerk = await clerkClient();
  const clerkUsers = await Promise.all(
    allPatientsRaw.map(async (p) => {
      try {
        const user = await clerk.users.getUser(p.user.clerkId);
        return { clerkId: p.user.clerkId, imageUrl: user.imageUrl };
      } catch {
        return { clerkId: p.user.clerkId, imageUrl: null };
      }
    })
  );
  const imageUrlMap = new Map(clerkUsers.map((u) => [u.clerkId, u.imageUrl]));

  const allPatients = allPatientsRaw.map((patient) => {
    const name = patient.user.name || "Unknown";
    const lastAppt = patient.appointments[0];
    return {
      id: patient.id,
      name,
      imageUrl: imageUrlMap.get(patient.user.clerkId) || null,
      initials: name.split(" ").map((n: string) => n[0]).join("").substring(0, 2),
      lastVisit: lastAppt?.date.toLocaleDateString() || "Never",
      condition: patient.conditions ? patient.conditions.split(",")[0] : "General",
    };
  });

  return {
    doctor: {
      name: dbUser.name || "Dr. Unknown",
      specialty: doctorProfile.specialization,
      title: "MD",
      initials: (dbUser.name || "D").split(' ').map((n) => n[0]).join('').substring(0, 2),
      licenseNumber: "LIC-123456"
    },
    stats: {
      todayAppointments: totalAppointmentsToday,
      totalPatients: distinctPatients,
      weeklySessions: weekAppointments,
      newPatientsThisWeek: newPatientsThisWeek,
      pendingNotes: pendingNotesCount,
    },
    appointments: todayAppointments
      .filter((appt) => appt.patientId && appt.patient)
      .map((appt) => {
        const patientName = appt.patient?.user.name || "Unknown Patient";
        return {
          id: appt.id,
          patientId: appt.patientId ?? "",
          patientName,
          patientInitials: patientName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2),
          date: appt.date.toLocaleDateString(),
          time: appt.date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          type: appt.reason || "General Consultation",
          status: String(appt.status),
        };
      }),
    recentPatients,
    allPatients,
    actionItems,
  };
}

export async function getDoctorPatients() {
  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("Unauthorized");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
    include: { doctorProfile: true }
  });

  if (!dbUser || !dbUser.doctorProfile) {
    return []; 
  }

  const doctorProfile = dbUser.doctorProfile;

  // Include all patient profiles so newly ingested patients can be linked,
  // even before they have prior appointments with this doctor.
  const patients = await prisma.patientProfile.findMany({
    where: {
      user: {
        role: "PATIENT",
      },
    },
    include: {
      user: true,
      appointments: {
        where: { doctorId: doctorProfile.id },
        orderBy: { date: "desc" },
      },
    },
  });

  const now = new Date();

  const mappedPatients = patients.map((patient) => {
    const doctorAppointments = patient.appointments;
    const lastVisit = doctorAppointments[0]?.date || null;

    const nextAppointment = [...doctorAppointments]
      .filter((appointment) => appointment.date > now && appointment.status !== "CANCELLED")
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0];

    const name = patient.user.name || "Unknown";

    return {
      id: patient.id,
      name,
      email: patient.user.email,
      initials: name.split(" ").map((n: string) => n[0]).join("").substring(0, 2),
      phone: patient.phone,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      lastVisit,
      nextAppointment: nextAppointment ? nextAppointment.date : null,
      status: nextAppointment ? "Upcoming" : "Past",
      condition: patient.conditions ? patient.conditions.split(",")[0] : null,
    };
  });

  return mappedPatients.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPatientProfile(patientProfileId: string) {
  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("Unauthorized");

  const patientProfile = await prisma.patientProfile.findUnique({
    where: { id: patientProfileId },
    include: {
        user: true,
        appointments: {
            orderBy: { date: 'desc' },
            take: 5
        },
        prescriptions: {
            where: { status: 'ACTIVE' }
        },
        healthMetrics: {
            orderBy: { date: 'desc' },
            take: 5
        },
        notes: {
            orderBy: { date: 'desc' },
            take: 5
        }
    }
  });

  if (!patientProfile) return null;

  return {
    id: patientProfile.id,
    name: patientProfile.user.name || "Unknown",
    email: patientProfile.user.email,
    phone: patientProfile.phone || "N/A",
    dob: patientProfile.dateOfBirth ? patientProfile.dateOfBirth.toLocaleDateString() : "N/A",
    gender: patientProfile.gender || "N/A",
    height: patientProfile.height || "N/A",
    weight: patientProfile.weight || "N/A",
    bloodType: patientProfile.bloodType || "N/A",
    
    // Medical Info
    allergies: patientProfile.allergies ? patientProfile.allergies.split(',') : [],
    conditions: patientProfile.conditions ? patientProfile.conditions.split(',') : [],
    
    // AI Summary
    aiSummary: patientProfile.aiSummary,

    // Upcoming Appointment (if any)
    nextAppointment: patientProfile.appointments.find(a => new Date(a.date) > new Date() && a.status !== 'CANCELLED') 
        ? {
            date: patientProfile.appointments.find(a => new Date(a.date) > new Date() && a.status !== 'CANCELLED')!.date.toLocaleDateString(),
            time: patientProfile.appointments.find(a => new Date(a.date) > new Date() && a.status !== 'CANCELLED')!.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            reason: patientProfile.appointments.find(a => new Date(a.date) > new Date() && a.status !== 'CANCELLED')!.reason
          } 
        : null,

    recentAppointments: patientProfile.appointments.map(a => ({
        id: a.id,
        date: a.date.toLocaleDateString(),
        status: a.status,
        reason: a.reason || "Checkup"
    })),
    
    activeMedications: patientProfile.prescriptions.map(p => ({
        id: p.id,
        name: p.name,
        dosage: p.dosage,
        frequency: p.frequency
    })),

    metrics: patientProfile.healthMetrics.map(m => ({
        id: m.id,
        type: m.type,
        value: m.value,
        unit: m.unit,
        trend: m.trend,
        date: m.date.toLocaleDateString()
    })),
    
    notes: patientProfile.notes.map(n => ({
        id: n.id,
        title: n.title,
        date: n.date.toLocaleDateString(),
        content: n.content
    }))
  };
}

export async function getAllPatients() {
  try {
    const clerkUser = await currentUser();
    if (!clerkUser) throw new Error("Unauthorized");

    const patients = await prisma.patientProfile.findMany({
      where: {
        user: {
          role: "PATIENT",
        },
      },
      include: {
        user: true,
        appointments: {
          orderBy: { date: "desc" },
          take: 1,
        },
      },
      orderBy: {
        user: {
          name: "asc",
        },
      },
      take: 10,
    });

    return patients.map((patient) => {
      const name = patient.user.name || "Unknown";
      const lastAppt = patient.appointments[0];
      return {
        id: patient.id,
        name,
        initials: name.split(" ").map((n: string) => n[0]).join("").substring(0, 2),
        lastVisit: lastAppt?.date.toLocaleDateString() || "Never",
        condition: patient.conditions ? patient.conditions.split(",")[0] : "General",
      };
    });
  } catch (error) {
    console.error("Error fetching all patients:", error);
    return [];
  }
}

export async function getDoctorSchedule(dateStr?: string) {

  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("Unauthorized");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
    include: { doctorProfile: true }
  });

  if (!dbUser || !dbUser.doctorProfile) return [];

  const targetDate = dateStr ? new Date(dateStr) : new Date();
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const appointments = await prisma.appointment.findMany({
    where: {
        doctorId: dbUser.doctorProfile.id,
        patientId: { not: null },
        date: {
            gte: startOfDay,
            lte: endOfDay
        }
    },
    include: {
        patient: {
            include: { user: true }
        }
    },
    orderBy: {
        date: 'asc'
    }
  });

  return appointments.map(appt => ({
    id: appt.id,
    patientName: appt.patient?.user.name || "Unknown",
    patientId: appt.patientId ?? "",
    startTime: appt.date,
    durationMins: 30, // Defaulting to 30 mins as schema doesn't have duration. Could infer or add to schema later.
    status: appt.status,
    reason: appt.reason || "General Visit"
  }));
}