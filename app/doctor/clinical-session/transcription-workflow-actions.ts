"use server";

import { Prisma } from "@prisma/client";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

function resolveTranscriptionBackendUrl() {
  const configuredUrl =
    process.env.PYTHON_BACKEND_URL?.trim() || process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL?.trim();

  const baseUrl = configuredUrl && configuredUrl.length > 0 ? configuredUrl : "http://127.0.0.1:8000";
  return baseUrl.replace(/\/+$/, "");
}

function formatTranscriptionError(error: unknown, endpointUrl: string) {
  const fallback = "Failed to transcribe recording";
  if (!(error instanceof Error)) {
    return `${fallback}.`;
  }

  const causeCode = (error as any)?.cause?.code;
  if (causeCode === "ECONNREFUSED" || /fetch failed/i.test(error.message)) {
    return `Could not reach Python backend at ${endpointUrl}. Start the FastAPI service and verify PYTHON_BACKEND_URL.`;
  }

  return error.message || fallback;
}

function isConnectivityError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const causeCode = (error as any)?.cause?.code;
  return causeCode === "ECONNREFUSED" || /fetch failed/i.test(error.message);
}

type PersistTranscriptResult = {
  success: boolean;
  error?: string;
  aiStatus?: string | null;
  transcriptSegments?: number;
};

function normalizeSegments(raw: unknown): Prisma.JsonArray {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized = raw
    .filter((segment) => segment && typeof segment === "object")
    .map((segment: any) => ({
      text: String(segment.text || "").trim(),
      speaker: String(segment.speaker || "Speaker 0"),
      start: typeof segment.start === "number" ? segment.start : 0,
      end: typeof segment.end === "number" ? segment.end : 0,
      role: typeof segment.role === "string" ? segment.role : null,
    }))
    .filter((segment) => segment.text.length > 0);

  return normalized as Prisma.JsonArray;
}

export async function confirmAndSaveAppointmentTranscription(appointmentId: string): Promise<PersistTranscriptResult> {
  const user = await currentUser();
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const doctor = await prisma.doctorProfile.findFirst({
    where: {
      user: {
        clerkId: user.id,
      },
    },
    select: { id: true },
  });

  if (!doctor) {
    return { success: false, error: "Doctor profile not found" };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctorId: doctor.id,
    },
    select: {
      id: true,
      recordingUrl: true,
      aiStatus: true,
    },
  });

  if (!appointment) {
    return { success: false, error: "Appointment not found" };
  }

  if (!appointment.recordingUrl) {
    return { success: false, error: "No recording found for this appointment" };
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      aiStatus: "PROCESSING",
    },
  });

  try {
    const transcriptionBackendUrl = resolveTranscriptionBackendUrl();
    const endpointUrl = `${transcriptionBackendUrl}/api/transcribe-upload`;

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recording_url: appointment.recordingUrl,
        diarize: true,
      }),
      signal: AbortSignal.timeout(120000),
      cache: "no-store",
    });

    if (!response.ok) {
      const rawErrorText = await response.text();
      let errorDetail = rawErrorText;

      try {
        const parsed = JSON.parse(rawErrorText) as { detail?: string };
        if (typeof parsed.detail === "string" && parsed.detail.trim().length > 0) {
          errorDetail = parsed.detail;
        }
      } catch {
        // Keep raw text when response body is not JSON.
      }

      const compactDetail = errorDetail.replace(/\s+/g, " ").trim().slice(0, 300);
      throw new Error(`Transcription service failed (${response.status}): ${compactDetail}`);
    }

    const transcriptionResult = (await response.json()) as {
      text?: string;
      segments?: unknown;
    };

    const normalizedSegments = normalizeSegments(transcriptionResult.segments);

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        transcript: normalizedSegments,
        aiStatus: "COMPLETED",
      },
    });

    revalidatePath(`/doctor/clinical-session/${appointment.id}`);
    revalidatePath("/doctor/dashboard");

    return {
      success: true,
      aiStatus: "COMPLETED",
      transcriptSegments: normalizedSegments.length,
    };
  } catch (error) {
    const transcriptionBackendUrl = resolveTranscriptionBackendUrl();
    const endpointUrl = `${transcriptionBackendUrl}/api/transcribe-upload`;
    const message = formatTranscriptionError(error, endpointUrl);

    if (isConnectivityError(error)) {
      console.warn("confirmAndSaveAppointmentTranscription connectivity issue", {
        endpointUrl,
        message,
      });
    } else {
      console.error("confirmAndSaveAppointmentTranscription failed", error);
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        aiStatus: "FAILED",
      },
    });

    return {
      success: false,
      error: message,
      aiStatus: "FAILED",
    };
  }
}

export async function getAppointmentTranscriptionStatus(appointmentId: string) {
  const user = await currentUser();
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      doctor: {
        is: {
          user: {
            clerkId: user.id,
          },
        },
      },
    },
    select: {
      aiStatus: true,
      transcript: true,
      updatedAt: true,
    },
  });

  if (!appointment) {
    return { success: false, error: "Appointment not found" };
  }

  return {
    success: true,
    aiStatus: appointment.aiStatus,
    hasTranscript: Array.isArray(appointment.transcript) && appointment.transcript.length > 0,
    updatedAt: appointment.updatedAt,
  };
}
