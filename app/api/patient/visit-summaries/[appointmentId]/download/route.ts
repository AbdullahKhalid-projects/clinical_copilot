import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { extractNoteTextFromSoapNote } from "@/lib/visit-summary";
import { buildVisitSummaryFilename, formatVisitSummaryDateLabel, renderVisitSummaryPdfBuffer } from "@/lib/visit-summary-pdf";
import { renderNoteDocumentPdfBuffer } from "@/lib/note-document-pdf";
import { mapRecordToSoapTemplate } from "@/lib/template-utils";

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
      soapNote: true,
      doctor: {
        select: {
          id: true,
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
      soapNoteUrl: true,
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
  const filename = buildVisitSummaryFilename(patientName, visitDate);

  // 1. Try to fetch from Cloudinary
  if (appointment.soapNoteUrl?.includes("cloudinary.com")) {
    try {
      const cloudinaryRes = await fetch(appointment.soapNoteUrl, { cache: "no-store" });
      if (cloudinaryRes.ok) {
        const fileBuffer = Buffer.from(await cloudinaryRes.arrayBuffer());
        return new NextResponse(fileBuffer as unknown as BodyInit, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `${isViewMode ? "inline" : "attachment"}; filename="${filename}"`,
            "Cache-Control": "private, max-age=0, must-revalidate",
          },
        });
      }
      console.error(`Cloudinary fetch returned ${cloudinaryRes.status}, falling back to generated PDF`);
    } catch (err) {
      console.error("Failed to fetch from Cloudinary, falling back to generated PDF", err);
    }
  }

  // 2. Try to generate template-based PDF from the appointment's stored note data
  let fileBuffer: Buffer | null = null;

  try {
    const soapNote = appointment.soapNote as Record<string, unknown> | null;
    const templateRef = soapNote?.template as { id?: string } | undefined;
    const noteData = soapNote?.noteData as Record<string, unknown> | undefined;
    const noteMetadata = soapNote?.noteMetadata as Record<string, unknown> | undefined;

    if (templateRef?.id && noteData) {
      const db = prisma as any;
      const templateRecord = await db.noteTemplate.findFirst({
        where: {
          id: templateRef.id,
        },
        include: {
          fields: {
            orderBy: { fieldOrder: "asc" },
          },
        },
      });

      if (templateRecord) {
        const template = mapRecordToSoapTemplate(templateRecord);
        const llmObject = { ...noteData, ...noteMetadata };
        fileBuffer = await renderNoteDocumentPdfBuffer(template, llmObject);
      }
    }
  } catch (err) {
    console.error("Failed to generate template-based PDF fallback", err);
  }

  // 3. Fallback to simple text-based PDF
  if (!fileBuffer) {
    fileBuffer = await renderVisitSummaryPdfBuffer({
      patientName,
      doctorName,
      visitDate,
      reason,
      noteText,
    });
  }

  return new NextResponse(fileBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isViewMode ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
