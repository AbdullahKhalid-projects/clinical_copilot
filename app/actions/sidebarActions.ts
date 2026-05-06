'use server'

import { prisma } from "@/lib/prisma"
import { currentUser, clerkClient } from "@clerk/nextjs/server"
import { format } from "date-fns"

function isLikelyClerkUserId(value: string | null | undefined): value is string {
  if (!value) return false
  return value.startsWith("user_")
}

export type SidebarAppointment = {
  id: string
  title: string      // Reason
  patientName: string
  patientImageUrl: string | null
  time: string
  date: string       // Used for grouping headers
  initials: string
  status: string
  fullDate: Date     // For sorting
}

export async function getSidebarAppointments() {
  const user = await currentUser()
  if (!user) return { upcoming: [], past: [] }

  const clerk = await clerkClient()

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    include: { doctorProfile: true }
  })

  // If not a doctor, return empty
  if (!dbUser?.doctorProfile) return { upcoming: [], past: [] }

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId: dbUser.doctorProfile.id,
      // Optional: Filter out cancelled?
      status: { not: "CANCELLED" }
    },
    include: {
      patient: {
        include: { user: true }
      }
    },
    orderBy: {
      date: 'desc' // Default soft sort, we will split manually
    },
    take: 20
  })

  const now = new Date()

  const uniquePatientClerkIds = Array.from(
    new Set(
      appointments
        .map((apt) => apt.patient?.user?.clerkId)
        .filter((id): id is string => Boolean(id))
    )
  )

  const patientImageMap = new Map<string, string>()

  await Promise.all(
    uniquePatientClerkIds.map(async (clerkId) => {
      if (!isLikelyClerkUserId(clerkId)) {
        return
      }

      try {
        const clerkUser = await clerk.users.getUser(clerkId)
        if (clerkUser.imageUrl) {
          patientImageMap.set(clerkId, clerkUser.imageUrl)
        }
      } catch {
        // Ignore invalid/stale IDs to avoid noisy server logs.
      }
    })
  )

  // Transform to view model
  const viewModels: SidebarAppointment[] = appointments.map(apt => {
    const pName = apt.patient?.user?.name || "Unlinked Patient"
    const initials = (pName || "?").split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    const patientClerkId = apt.patient?.user?.clerkId
    
    return {
      id: apt.id,
      title: apt.reason || "General Consultation",
      patientName: pName,
      patientImageUrl: patientClerkId ? (patientImageMap.get(patientClerkId) ?? null) : null,
      time: format(apt.date, "h:mm a"), // e.g. 2:30 PM
      date: format(apt.date, "dd/MM/yyyy"), // e.g. 14/02/2026 used for grouping headers
      initials,
      status: apt.status,
      fullDate: apt.date
    }
  })

  // Split into Upcoming and Past
  const upcoming = viewModels.filter(a => a.fullDate >= now).sort((a,b) => a.fullDate.getTime() - b.fullDate.getTime()) // Ascending for upcoming
  const past = viewModels.filter(a => a.fullDate < now).sort((a,b) => b.fullDate.getTime() - a.fullDate.getTime())    // Descending for past

  return { upcoming, past }
}
