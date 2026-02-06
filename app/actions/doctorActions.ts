'use server'

import { prisma } from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

// Helper to ensure user is authenticated. 
// In a real app, you'd also check if the user is a DOCTOR and owns this appointment.
async function checkAuth() {
  const user = await currentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
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
    // If working with seed data, might need to be careful if logged in user matches seed
    return null; 
  }

  const doctorProfile = dbUser.doctorProfile;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Get today's appointments
  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId: doctorProfile.id,
      date: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
    include: {
      patient: {
        include: {
            user: true
        }
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  // Get Quick Stats
  // 1. Total appointments today
  const totalAppointmentsToday = appointments.length;

  // 2. Total unique patients for this doctor (ever)
  // Use aggregation or distinct count
  const distinctPatients = await prisma.appointment.findMany({
    where: { doctorId: doctorProfile.id },
    distinct: ['patientId'],
    select: { patientId: true }
  });
  
  return {
    doctor: {
      name: dbUser.name || "Dr. Unknown",
      specialty: doctorProfile.specialization,
      title: "MD", 
      initials: (dbUser.name || "D").split(' ').map((n) => n[0]).join('').substring(0, 2),
      licenseNumber: "LIC-123456" 
    },
    todaysOverview: {
        appointments: totalAppointmentsToday,
        totalPatients: distinctPatients.length,
    },
    appointments: appointments.map(appt => ({
        id: appt.id,
        patientId: appt.patientId, // Need this for navigation
        patientName: appt.patient.user.name || "Unknown Patient",
        // Add initials
        patientInitials: (appt.patient.user.name || "U").split(' ').map(n => n[0]).join('').substring(0, 2),
        date: appt.date.toLocaleDateString(),
        time: appt.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: appt.reason || "General Consultation",
        status: appt.status,
    }))
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

  // Find all appointments for this doctor to get unique patients
  const appointments = await prisma.appointment.findMany({
    where: { doctorId: doctorProfile.id },
    include: {
      patient: {
        include: {
          user: true,
          appointments: {
             where: { doctorId: doctorProfile.id },
             orderBy: { date: 'desc' },
             take: 1 // To get last visit
          }
        }
      }
    },
    orderBy: { date: 'desc' }
  });

  // Unique Patients Map
  const patientMap = new Map();

  for (const appt of appointments) {
    if (!patientMap.has(appt.patientId)) {
        const p = appt.patient;
        const lastVisit = p.appointments[0]?.date || null;
        
        // Check for next appointment (future)
        const nextAppointment = await prisma.appointment.findFirst({
            where: {
                patientId: p.id,
                doctorId: doctorProfile.id,
                date: { gt: new Date() },
                status: { not: "CANCELLED" }
            },
            orderBy: { date: 'asc' }
        });

        patientMap.set(appt.patientId, {
            id: p.id,
            name: p.user.name || "Unknown",
            email: p.user.email,
            initials: (p.user.name || "U").split(' ').map((n: string) => n[0]).join('').substring(0, 2),
            phone: p.phone,
            dateOfBirth: p.dateOfBirth,
            gender: p.gender,
            lastVisit: lastVisit,
            nextAppointment: nextAppointment ? nextAppointment.date : null,
            status: nextAppointment ? "Upcoming" : "Past",
            condition: p.conditions ? p.conditions.split(',')[0] : null 
        });
    }
  }

  return Array.from(patientMap.values());
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
    patientName: appt.patient.user.name || "Unknown",
    patientId: appt.patientId,
    startTime: appt.date,
    durationMins: 30, // Defaulting to 30 mins as schema doesn't have duration. Could infer or add to schema later.
    status: appt.status,
    reason: appt.reason || "General Visit"
  }));
}