import {
  defaultNoteNormalizationSettings,
  type NoteNormalizationSettings,
  type SoapTemplate,
  type TemplateField,
  type TemplateFieldType,
  type TemplateProfileContext,
} from "@/app/doctor/templates/types";

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

export function mapRecordToSoapTemplate(record: any): SoapTemplate {
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
