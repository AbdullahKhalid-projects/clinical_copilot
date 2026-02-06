"use server"

import { currentUser } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"

export async function getPatientDashboardData() {
  const user = await currentUser()
  
  if (!user) {
    redirect("/")
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    include: {
      patientProfile: {
        include: {
          appointments: {
            orderBy: { date: 'asc' },
            where: {
              date: {
                gte: new Date()
              }
            },
            take: 3,
            include: { doctor: true }
          },
          prescriptions: {
            where: { status: 'ACTIVE' }
          },
          healthMetrics: {
            orderBy: { date: 'desc' },
            take: 3 
          }
        }
      }
    }
  })

  if (!dbUser || !dbUser.patientProfile) {
    return null
  }

  const profile = dbUser.patientProfile

  const age = profile.dateOfBirth 
      ? new Date().getFullYear() - profile.dateOfBirth.getFullYear() 
      : 'N/A';

  return {
    ...profile,
    name: dbUser.name ?? "Unknown",
    email: dbUser.email,
    initials: dbUser.name 
      ? dbUser.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2)
      : 'U',
    age: age
  }
}

export async function getPatientMedications() {
  const user = await currentUser()
  
  if (!user) {
    redirect("/")
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    include: {
      patientProfile: {
        include: {
          prescriptions: {
            orderBy: { startDate: 'desc' },
            include: {
              doctor: {
                include: {
                  user: true 
                }
              }
            }
          }
        }
      }
    }
  })

  if (!dbUser || !dbUser.patientProfile) {
    return []
  }

  return dbUser.patientProfile.prescriptions.map(p => ({
    ...p,
    doctorName: p.doctor?.user.name ? `Dr. ${p.doctor.user.name}` : p.prescribedBy || "Unknown Doctor"
  }))
}

export async function getNotesAndReminders() {
  const user = await currentUser()
  
  if (!user) {
    redirect("/")
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    include: {
      patientProfile: {
        include: {
          notes: {
            orderBy: { date: 'desc' },
          },
          reminders: {
            orderBy: { date: 'asc' },
          }
        }
      }
    }
  })

  if (!dbUser || !dbUser.patientProfile) {
    return {
      notes: [],
      reminders: []
    }
  }

  return {
    notes: dbUser.patientProfile.notes,
    reminders: dbUser.patientProfile.reminders
  }
}
