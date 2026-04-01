import { z } from "zod";

import { buildRuntimeSchema } from "./schema";
import {
  defaultNoteNormalizationSettings,
  type FieldFallbackPolicy,
  type SoapTemplate,
  type TemplateBodySchema,
  type TemplateField,
  type TemplateFieldType,
} from "./types";

type PlaceholderMap = Record<string, string>;

export const templatePlaceholderHelp: Array<{ key: string; description: string }> = [
  { key: "{{hospital_logo}}", description: "Hospital logo block (visual element in PDF header)" },
  { key: "{{header_icon}}", description: "Header icon block (visual element in PDF header)" },
  { key: "{{hospital_name}}", description: "Hospital or clinic name" },
  { key: "{{hospital_address_line_1}}", description: "Hospital address line 1" },
  { key: "{{hospital_address_line_2}}", description: "Hospital address line 2" },
  { key: "{{hospital_contact}}", description: "Hospital phone/contact" },
  { key: "{{doctor_name}}", description: "Doctor full name" },
  { key: "{{doctor_credentials}}", description: "Doctor credentials/degrees" },
  { key: "{{doctor_license_no}}", description: "Doctor license number" },
  { key: "{{doctor_signature}}", description: "Doctor signature text" },
];

export function getTemplatePlaceholderMap(template: SoapTemplate): PlaceholderMap {
  const ctx = template.profileContext;

  return {
    hospital_logo: "",
    header_icon: "",
    hospital_name: ctx.hospitalName,
    hospital_address_line_1: ctx.hospitalAddressLine1,
    hospital_address_line_2: ctx.hospitalAddressLine2 || "",
    hospital_contact: ctx.hospitalContact,
    doctor_name: ctx.doctorName,
    doctor_credentials: ctx.doctorCredentials || "",
    doctor_license_no: ctx.doctorLicenseNo || "",
    doctor_signature: ctx.doctorSignature || "",
  };
}

export function resolveTemplateTextPlaceholders(text: string, values: PlaceholderMap): string {
  return text
    .replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, rawKey: string) => {
      const key = rawKey.toLowerCase();
      const resolved = values[key];
      return typeof resolved === "string" ? resolved : "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildBodyFieldInstruction(field: TemplateField): string {
  const requiredText = field.required ? "required" : "optional";
  const hintText = field.hint ? ` Hint: ${field.hint}` : "";
  const guidanceText = field.guidance ? ` Guidance: ${field.guidance}` : "";
  const fallbackText = ` Fallback: ${field.fallbackPolicy ?? "empty"}.`;

  return `- ${field.key} (${field.type}, ${requiredText}): ${field.label}.${hintText}${guidanceText}${fallbackText}`;
}

export function buildLlmInstructionForTemplate(template: SoapTemplate): string {
  const fieldInstructions = template.bodySchema.fields.map(buildBodyFieldInstruction).join("\n");
  const customDirectives = template.promptDirectives?.trim();

  return [
    "You are generating structured clinical note content from a transcript.",
    "Return a strict JSON object with exactly these keys (no extras):",
    fieldInstructions,
    customDirectives ? `Template directives:\n${customDirectives}` : null,
    "Rules:",
    "- Only use information explicitly present in transcript/context.",
    "- Apply field-level fallback policy when evidence is missing.",
    "- Keep wording concise and clinically factual.",
  ]
    .filter(Boolean)
    .join("\n");
}

function defaultValueForType(type: TemplateFieldType): string | number | boolean {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  return "";
}

function fallbackValueForField(field: TemplateField): string | number | boolean {
  const policy: FieldFallbackPolicy = field.fallbackPolicy ?? "empty";
  if (policy === "not_documented" && field.type === "string") {
    return "Not documented";
  }
  return defaultValueForType(field.type);
}

function coerceValueToFieldType(value: unknown, field: TemplateField): unknown {
  if (field.type === "string") {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  if (field.type === "number") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallbackValueForField(field);
  }

  if (field.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return fallbackValueForField(field);
  }

  return value;
}

function normalizeStringValue(value: string, template: SoapTemplate): string {
  const normalization = {
    ...defaultNoteNormalizationSettings,
    ...(template.normalization ?? {}),
  };

  let next = value;

  if (normalization.trimText) {
    next = next.trim();
  }

  if (normalization.collapseWhitespace) {
    next = next.replace(/[ \t]{2,}/g, " ");
  }

  if (normalization.collapseLineBreaks) {
    next = next.replace(/\n{3,}/g, "\n\n");
  }

  if (normalization.normalizeNotDocumented && next.toLowerCase() === "n/a") {
    next = "Not documented";
  }

  return next;
}

export function buildNormalizedLlmPayload(template: SoapTemplate, payload: unknown): Record<string, unknown> {
  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  return template.bodySchema.fields.reduce<Record<string, unknown>>((acc, field) => {
    const incoming = source[field.key];
    const missing = incoming === undefined || incoming === null || incoming === "";
    const policy: FieldFallbackPolicy = field.fallbackPolicy ?? "empty";

    if (missing && !field.required && policy === "omit_if_optional") {
      return acc;
    }

    const baseValue = missing ? fallbackValueForField(field) : coerceValueToFieldType(incoming, field);

    if (field.type === "string") {
      acc[field.key] = normalizeStringValue(String(baseValue ?? ""), template);
    } else {
      acc[field.key] = baseValue;
    }

    return acc;
  }, {});
}

export function validateAndNormalizeLlmPayload(template: SoapTemplate, payload: unknown) {
  const runtimeSchema = buildRuntimeSchema(template.bodySchema);
  const normalizedPayload = buildNormalizedLlmPayload(template, payload);
  return runtimeSchema.safeParse(normalizedPayload);
}

export function coerceDraftToObject(draft: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(draft) };
  } catch {
    return { ok: false, error: "Invalid JSON. Ensure keys and quotes are correctly formatted." };
  }
}

export function buildEmptyBodyOutput(bodySchema: TemplateBodySchema): Record<string, string | number | boolean> {
  return bodySchema.fields.reduce<Record<string, string | number | boolean>>((acc, field) => {
    if (field.type === "number") {
      acc[field.key] = 0;
    } else if (field.type === "boolean") {
      acc[field.key] = false;
    } else {
      acc[field.key] = "";
    }
    return acc;
  }, {});
}

export function renderNotePreviewFromObject(
  template: SoapTemplate,
  llmObject: Record<string, unknown>,
): string {
  const placeholderValues = getTemplatePlaceholderMap(template);

  const resolvedHeader = resolveTemplateTextPlaceholders(template.header, placeholderValues);
  const resolvedFooter = resolveTemplateTextPlaceholders(template.footer, placeholderValues);

  const logoLine = template.profileContext.hospitalLogoUrl?.trim()
    ? `[Hospital Logo: ${template.profileContext.hospitalLogoUrl?.trim()}]`
    : "";

  const body = template.bodySchema.fields
    .map((field) => `${field.label}:\n${String(llmObject[field.key] ?? "")}`)
    .join("\n\n");

  return [logoLine, resolvedHeader, body, resolvedFooter]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildStrictJsonShapeExample(template: SoapTemplate): string {
  const shape = template.bodySchema.fields.reduce<Record<string, string>>((acc, field) => {
    const suffix = field.required ? "required" : "optional";
    acc[field.key] = `${field.type} (${suffix})`;
    return acc;
  }, {});

  return JSON.stringify(shape, null, 2);
}

export function sanitizeForStrictJson(template: SoapTemplate, value: unknown) {
  const runtimeSchema = buildRuntimeSchema(template.bodySchema);
  return runtimeSchema.parse(value);
}

export const llmStrictJsonResponseSchema = z.object({
  data: z.record(z.unknown()),
});
