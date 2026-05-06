import type { z } from "zod";

import type { bodySchemaEditorSchema } from "../../schema";
import type {
  FieldFallbackPolicy,
  NoteNormalizationSettings,
  SoapTemplate,
  TemplateField,
} from "../../types";

export type TemplateUpdate = (updater: (template: SoapTemplate) => SoapTemplate) => void;
export type TemplateTypingUpdate = (
  coalesceKey: string,
  updater: (template: SoapTemplate) => SoapTemplate,
) => void;

export type HeaderFooterStyleView = {
  description: string;
  metadataFields: Array<{
    key: keyof SoapTemplate["profileContext"];
    label: string;
    placeholder?: string;
  }>;
};

export type StructurePanelProps = {
  template: SoapTemplate;
  canEdit: boolean;
  selectedHeaderFooterStyle: HeaderFooterStyleView;
  headerFieldKeys: Set<string>;
  footerFieldKeys: Set<string>;
  metadataFieldKeys: Set<string>;
  applyTemplateUpdate: TemplateUpdate;
  applyTemplateTypingUpdate: TemplateTypingUpdate;
};

export type PromptPanelProps = {
  template: SoapTemplate;
  canEdit: boolean;
  llmInstructionPreview: string;
  strictJsonShapePreview: string;
  applyTemplateTypingUpdate: TemplateTypingUpdate;
};

export type SchemaPanelProps = {
  template: SoapTemplate;
  canEdit: boolean;
  schemaValidation: z.SafeParseReturnType<
    SoapTemplate["bodySchema"],
    z.infer<typeof bodySchemaEditorSchema>
  >;
  applyTemplateUpdate: TemplateUpdate;
  applyTemplateTypingUpdate: TemplateTypingUpdate;
  getSoapFieldDefaults: (field: TemplateField) => {
    guidance: string;
    fallbackPolicy: FieldFallbackPolicy;
  };
};

export type ConfigPanelProps = {
  template: SoapTemplate;
  canEdit: boolean;
  normalization: NoteNormalizationSettings;
  llmJsonDraft: string;
  onSetLlmJsonDraft: (value: string) => void;
  parsedLlmObject: { ok: true; value: unknown } | { ok: false; error: string };
  objectValidation:
    | { success: true; data: Record<string, unknown> }
    | { success: false; error: { issues: Array<{ path: (string | number)[]; message: string }> } }
    | null;
  applyTemplateUpdate: TemplateUpdate;
};
