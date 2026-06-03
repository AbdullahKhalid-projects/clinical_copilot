import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { renderTranscriptPdfBuffer, buildTranscriptFilename } from "@/lib/transcript-pdf";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    appointmentId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { appointmentId } = await context.params;
  if (!appointmentId) {
    return NextResponse.json({ error: "Invalid appointment id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "download";
  const isViewMode = mode === "view";

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
      transcript: true,
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
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  const segments = appointment.transcript as Array<{ text?: string; speaker?: string; start?: number; end?: number }> | null;
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return NextResponse.json({ error: "No transcript available for this visit" }, { status: 404 });
  }

  const patientName = appointment.patient?.user?.name?.trim() || dbUser.patientProfile.user?.name?.trim() || "Patient";
  const doctorName = appointment.doctor?.user?.name?.trim()
    ? `Dr. ${appointment.doctor.user.name.trim()}`
    : appointment.doctor?.specialization
      ? `Dr. ${appointment.doctor.specialization}`
      : "Care Team";

  const reason = appointment.reason?.trim() || "Clinical Session";
  const filename = buildTranscriptFilename(patientName, appointment.date);

  const fileBuffer = await renderTranscriptPdfBuffer({
    patientName,
    doctorName,
    date: appointment.date,
    reason,
    segments,
  });

  return new NextResponse(fileBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isViewMode ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
