"use server";

import { currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

import {
  buildLlmInstructionForTemplate,
  buildStrictJsonShapeExample,
} from "../templates/template-engine";
import {
  defaultNoteNormalizationSettings,
  type NoteNormalizationSettings,
  type SoapTemplate,
  type TemplateField,
  type TemplateFieldType,
  type TemplateProfileContext,
} from "../templates/types";

function resolveNoteBridgeBackendUrl() {
  const configuredUrl =
    process.env.PYTHON_BACKEND_URL?.trim() || process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL?.trim();

  const baseUrl = configuredUrl && configuredUrl.length > 0 ? configuredUrl : "http://127.0.0.1:8000";
  return baseUrl.replace(/\/+$/, "");
}

type NoteTemplateBridgeSummary = {
  templateId: string;
  templateName: string;
  fieldCount: number;
  segmentCount: number;
  transcriptCharCount: number;
  receivedAt: number | null;
};

type NoteTemplateBridgeResult = {
  success: boolean;
  error?: string;
  bridgeSummary?: NoteTemplateBridgeSummary;
  pythonResponse?: unknown;
};

type NormalizedTranscriptSegment = {
  text: string;
  speaker: string;
  start: number;
  end: number;
  role?: string;
};

const db = prisma as any;

function defaultProfileContext(): TemplateProfileContext {
  return {
    hospitalName: "",
    hospitalLogoUrl: "",
    headerIconUrl: "",
    hospitalAddressLine1: "",
    hospitalAddressLine2: "",
    hospitalContact: "",
    doctorName: "",
    doctorCredentials: "",
    doctorLicenseNo: "",
    doctorSignature: "",
    doctorSignatureImageUrl: "",
  };
}

function asProfileContext(value: unknown): TemplateProfileContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultProfileContext();
  }

  const record = value as Record<string, unknown>;
  return {
    hospitalName: String(record.hospitalName ?? ""),
    hospitalLogoUrl: String(record.hospitalLogoUrl ?? ""),
    headerIconUrl: String(record.headerIconUrl ?? ""),
    hospitalAddressLine1: String(record.hospitalAddressLine1 ?? ""),
    hospitalAddressLine2: String(record.hospitalAddressLine2 ?? ""),
    hospitalContact: String(record.hospitalContact ?? ""),
    doctorName: String(record.doctorName ?? ""),
    doctorCredentials: String(record.doctorCredentials ?? ""),
    doctorLicenseNo: String(record.doctorLicenseNo ?? ""),
    doctorSignature: String(record.doctorSignature ?? ""),
    doctorSignatureImageUrl: String(record.doctorSignatureImageUrl ?? ""),
  };
}

function asNormalization(value: unknown): NoteNormalizationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultNoteNormalizationSettings;
  }

  const record = value as Record<string, unknown>;
  return {
    trimText:
      typeof record.trimText === "boolean"
        ? record.trimText
        : defaultNoteNormalizationSettings.trimText,
    collapseWhitespace:
      typeof record.collapseWhitespace === "boolean"
        ? record.collapseWhitespace
        : defaultNoteNormalizationSettings.collapseWhitespace,
    collapseLineBreaks:
      typeof record.collapseLineBreaks === "boolean"
        ? record.collapseLineBreaks
        : defaultNoteNormalizationSettings.collapseLineBreaks,
    normalizeNotDocumented:
      typeof record.normalizeNotDocumented === "boolean"
        ? record.normalizeNotDocumented
        : defaultNoteNormalizationSettings.normalizeNotDocumented,
  };
}

function toAppFieldType(type: string): TemplateFieldType {
  if (type === "NUMBER") return "number";
  if (type === "BOOLEAN") return "boolean";
  return "string";
}

function toAppFallbackPolicy(policy: string): "empty" | "not_documented" | "omit_if_optional" {
  if (policy === "NOT_DOCUMENTED") return "not_documented";
  if (policy === "OMIT_IF_OPTIONAL") return "omit_if_optional";
  return "empty";
}

function mapRecordToSoapTemplate(record: any): SoapTemplate {
  const fields: TemplateField[] = (record.fields ?? []).map((field: any) => ({
    key: field.key,
    label: field.label,
    type: toAppFieldType(field.type),
    required: Boolean(field.required),
    guidance: field.guidance ?? undefined,
    hint: field.hint ?? undefined,
    fallbackPolicy: toAppFallbackPolicy(field.fallbackPolicy),
  }));

  return {
    id: record.id,
    name: record.name,
    description: record.description ?? "",
    promptDirectives: record.promptDirectives ?? undefined,
    source: record.source === "LIBRARY" ? "library" : "mine",
    isActive: Boolean(record.isActive),
    headerFooterStyle: "default",
    headerTextAlign:
      record.headerTextAlign === "LEFT"
        ? "left"
        : record.headerTextAlign === "RIGHT"
          ? "right"
          : "center",
    normalization: asNormalization(record.normalization),
    profileContext: asProfileContext(record.profileContext),
    header: record.header ?? "",
    footer: record.footer ?? "",
    bodySchema: {
      title: "SOAP Body",
      fields,
    },
  };
}

function normalizeSegments(raw: unknown): NormalizedTranscriptSegment[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((segment) => segment && typeof segment === "object")
    .map((segment: any) => ({
      text: String(segment.text || "").trim(),
      speaker: String(segment.speaker || "Speaker 0"),
      start: typeof segment.start === "number" ? segment.start : 0,
      end: typeof segment.end === "number" ? segment.end : 0,
      role: typeof segment.role === "string" ? segment.role : undefined,
    }))
    .filter((segment: NormalizedTranscriptSegment) => segment.text.length > 0);
}

function buildTranscriptText(segments: NormalizedTranscriptSegment[]): string {
  return segments
    .map((segment) => {
      const label = segment.role || segment.speaker;
      return `[${label}] ${segment.text}`;
    })
    .join("\n");
}

function parseStrictShapeExample(template: SoapTemplate): Record<string, string> {
  const strictShape = buildStrictJsonShapeExample(template);
  try {
    return JSON.parse(strictShape) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function bridgeActiveTemplateToPython(
  appointmentId: string,
): Promise<NoteTemplateBridgeResult> {
  const user = await currentUser();
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    select: { id: true },
  });

  if (!dbUser) {
    return { success: false, error: "User not found" };
  }

  const doctor = await prisma.doctorProfile.findFirst({
    where: { userId: dbUser.id },
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
      date: true,
      reason: true,
      transcript: true,
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
    return { success: false, error: "Appointment not found" };
  }

  let activeTemplateRecord = await db.noteTemplate.findFirst({
    where: {
      source: "PERSONAL",
      userId: dbUser.id,
      isActive: true,
    },
    include: {
      fields: {
        orderBy: { fieldOrder: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!activeTemplateRecord) {
    activeTemplateRecord = await db.noteTemplate.findFirst({
      where: {
        source: "LIBRARY",
        isActive: true,
      },
      include: {
        fields: {
          orderBy: { fieldOrder: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  if (!activeTemplateRecord) {
    return {
      success: false,
      error: "No active note template found. Activate one in Note Studio first.",
    };
  }

  const activeTemplate = mapRecordToSoapTemplate(activeTemplateRecord);
  const transcriptSegments = normalizeSegments(appointment.transcript);
  const transcriptText = buildTranscriptText(transcriptSegments);

  const bridgePayload = {
    appointment_id: appointment.id,
    doctor_id: doctor.id,
    template: {
      id: activeTemplate.id,
      name: activeTemplate.name,
      description: activeTemplate.description,
      prompt_directives: activeTemplate.promptDirectives ?? "",
      header: activeTemplate.header,
      footer: activeTemplate.footer,
      header_text_align: activeTemplate.headerTextAlign,
      normalization: activeTemplate.normalization ?? defaultNoteNormalizationSettings,
      profile_context: activeTemplate.profileContext,
      fields: activeTemplate.bodySchema.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        guidance: field.guidance ?? null,
        hint: field.hint ?? null,
        fallback_policy: field.fallbackPolicy ?? "empty",
      })),
      llm_instruction: buildLlmInstructionForTemplate(activeTemplate),
      strict_shape_example: parseStrictShapeExample(activeTemplate),
    },
    transcript_segments: transcriptSegments,
    transcript_text: transcriptText,
    metadata: {
      appointment_reason: appointment.reason ?? "",
      appointment_date: appointment.date.toISOString(),
      patient_name: appointment.patient?.user?.name ?? "",
    },
    dry_run: true,
  };

  try {
    const noteBridgeBackendUrl = resolveNoteBridgeBackendUrl();
    const response = await fetch(`${noteBridgeBackendUrl}/api/notes/template-bridge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(bridgePayload),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Template bridge failed (${response.status}): ${errorText}`);
    }

    const pythonResponse = (await response.json()) as Record<string, unknown>;
    const transcriptCharCount = transcriptText.length;

    return {
      success: true,
      bridgeSummary: {
        templateId: activeTemplate.id,
        templateName: activeTemplate.name,
        fieldCount: activeTemplate.bodySchema.fields.length,
        segmentCount: transcriptSegments.length,
        transcriptCharCount,
        receivedAt:
          typeof pythonResponse.received_at === "number"
            ? (pythonResponse.received_at as number)
            : null,
      },
      pythonResponse,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to bridge template to Python";
    console.error("bridgeActiveTemplateToPython failed", error);
    return { success: false, error: message };
  }
}
