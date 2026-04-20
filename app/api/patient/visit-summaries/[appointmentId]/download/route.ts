import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { extractNoteTextFromSoapNote } from "@/lib/visit-summary";
import { buildVisitSummaryFilename, formatVisitSummaryDateLabel, renderVisitSummaryPdfBuffer } from "@/lib/visit-summary-pdf";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    appointmentId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { appointmentId } = await context.params;
  if (!appointmentId) {
    return NextResponse.json({ error: "Invalid appointment id" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    include: {
      patientProfile: {
        select: {
          id: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!dbUser?.patientProfile?.id) {
    return NextResponse.json({ error: "Patient profile not found" }, { status: 404 });
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      patientId: dbUser.patientProfile.id,
      status: "COMPLETED",
    },
    select: {
      id: true,
      date: true,
      reason: true,
      soapNote: true,
      doctor: {
        select: {
          specialization: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      },
      patient: {
        select: {
          user: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Visit summary not found" }, { status: 404 });
  }

  const noteText = extractNoteTextFromSoapNote(appointment.soapNote);
  if (!noteText) {
    return NextResponse.json({ error: "No finalized note found for this visit" }, { status: 404 });
  }

  const patientName = appointment.patient?.user?.name?.trim() || dbUser.patientProfile.user?.name?.trim() || "Patient";
  const doctorName = appointment.doctor?.user?.name?.trim()
    ? `Dr. ${appointment.doctor.user.name.trim()}`
    : appointment.doctor?.specialization
      ? `Dr. ${appointment.doctor.specialization}`
      : "Care Team";

  const visitDate = formatVisitSummaryDateLabel(appointment.date);
  const reason = appointment.reason?.trim() || "Clinical follow-up";

  const fileBuffer = await renderVisitSummaryPdfBuffer({
    patientName,
    doctorName,
    visitDate,
    reason,
    noteText,
  });
  const filename = buildVisitSummaryFilename(patientName, visitDate);

  return new NextResponse(fileBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
