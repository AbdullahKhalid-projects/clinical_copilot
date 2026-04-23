"use client";

import * as React from "react";
import {
  ArrowLeft,
  Copy,
  Download,
  FileCode2,
  FileText,
  LayoutTemplate,
  Plus,
  Redo2,
  Save,
  Settings2,
  Undo2,
} from "lucide-react";
import { PDFDownloadLink } from "@react-pdf/renderer";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { bodySchemaEditorSchema, buildRuntimeSchema, buildSampleObject } from "../schema";
import {
  buildLlmInstructionForTemplate,
  buildStrictJsonShapeExample,
  coerceDraftToObject,
  validateAndNormalizeLlmPayload,
} from "../template-engine";
import { HEADER_FOOTER_STYLES } from "../header-footer-styles";
import { NoteDocument } from "@/lib/note-document-pdf";
import { ConfigPanel } from "./editor-panels/config-panel";
import { PreviewPanel } from "./editor-panels/preview-panel";
import { PromptPanel } from "./editor-panels/prompt-panel";
import { SchemaPanel } from "./editor-panels/schema-panel";
import { StructurePanel } from "./editor-panels/structure-panel";
import {
  defaultNoteNormalizationSettings,
  type FieldFallbackPolicy,
  type SoapTemplate,
  type TemplateField,
  type TemplateFieldType,
} from "../types";

type TemplateEditorViewProps = {
  template: SoapTemplate;
  chosenTemplateId: string;
  llmJsonDraft: string;
  onBackToGallery: () => void;
  onSetChosenTemplate: (templateId: string) => void;
  onCloneTemplate: (template: SoapTemplate) => void;
  onUpdateMineTemplate: (updater: (template: SoapTemplate) => SoapTemplate) => void;
  onSaveMineTemplate: (template: SoapTemplate) => Promise<{ success: boolean; error?: string }>;
  onSetLlmJsonDraft: (value: string) => void;
};

type EditorPanel = "structure" | "prompt" | "schema" | "config" | "preview";

function getSoapFieldDefaults(field: TemplateField): {
  guidance: string;
  fallbackPolicy: FieldFallbackPolicy;
} {
  const descriptor = `${field.key} ${field.label}`.toLowerCase();
  const requiredFallback: FieldFallbackPolicy = field.required ? "not_documented" : "omit_if_optional";

  if (
    /subjective|chief|complaint|hpi|history|symptom|ros|review_of_systems/.test(descriptor)
  ) {
    return {
      guidance:
        "Capture patient-reported symptoms and history only when clearly present in transcript evidence.",
      fallbackPolicy: requiredFallback,
    };
  }

  if (/objective|exam|physical|vital|lab|imaging|investigation/.test(descriptor)) {
    return {
      guidance:
        "Include objective findings from exam, vitals, labs, or imaging exactly as supported by transcript/context.",
      fallbackPolicy: requiredFallback,
    };
  }

  if (/assessment|diagnosis|impression|problem/.test(descriptor)) {
    return {
      guidance:
        "Summarize clinician assessment and likely diagnosis only when justified by documented findings.",
      fallbackPolicy: requiredFallback,
    };
  }

  if (/plan|treatment|recommend|follow|medication|rx|next_step/.test(descriptor)) {
    return {
      guidance:
        "Document treatment plan, orders, and follow-up actions that are explicitly stated by the clinician.",
      fallbackPolicy: requiredFallback,
    };
  }

  return {
    guidance: "Only include this section when explicitly supported by transcript evidence.",
    fallbackPolicy: requiredFallback,
  };
}

function cloneTemplateState(template: SoapTemplate): SoapTemplate {
  return JSON.parse(JSON.stringify(template)) as SoapTemplate;
}

export function TemplateEditorView({
  template,
  chosenTemplateId: _chosenTemplateId,
  llmJsonDraft,
  onBackToGallery,
  onSetChosenTemplate,
  onCloneTemplate,
  onUpdateMineTemplate,
  onSaveMineTemplate,
  onSetLlmJsonDraft,
}: TemplateEditorViewProps) {
  const { toast } = useToast();
  const [activePanel, setActivePanel] = React.useState<EditorPanel>("structure");
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveFeedback, setSaveFeedback] = React.useState<string | null>(null);
  const undoStackRef = React.useRef<SoapTemplate[]>([]);
  const redoStackRef = React.useRef<SoapTemplate[]>([]);
  const pendingHistoryKeyRef = React.useRef<string | null>(null);
  const pendingHistoryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = React.useRef<string>("");
  const [, setHistoryTick] = React.useState(0);

  const canEdit = template.source === "mine";

  const clearPendingCoalescedHistory = React.useCallback(() => {
    pendingHistoryKeyRef.current = null;
    if (pendingHistoryTimerRef.current) {
      clearTimeout(pendingHistoryTimerRef.current);
      pendingHistoryTimerRef.current = null;
    }
  }, []);

  const scheduleCoalescedHistoryWindow = React.useCallback((coalesceKey: string) => {
    pendingHistoryKeyRef.current = coalesceKey;
    if (pendingHistoryTimerRef.current) {
      clearTimeout(pendingHistoryTimerRef.current);
    }
    pendingHistoryTimerRef.current = setTimeout(() => {
      pendingHistoryKeyRef.current = null;
      pendingHistoryTimerRef.current = null;
    }, 800);
  }, []);

  React.useEffect(() => {
    return () => clearPendingCoalescedHistory();
  }, [clearPendingCoalescedHistory]);

  React.useEffect(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    clearPendingCoalescedHistory();
    lastSavedSnapshotRef.current = JSON.stringify(template);
    setSaveFeedback(null);
    setIsSaving(false);
    setHistoryTick((value) => value + 1);
  }, [clearPendingCoalescedHistory, template.id]);

  const isDirty = canEdit && JSON.stringify(template) !== lastSavedSnapshotRef.current;

  const applyTemplateUpdate = React.useCallback(
    (
      updater: (template: SoapTemplate) => SoapTemplate,
      options?: { coalesceKey?: string },
    ) => {
      if (!canEdit) return;

      const current = cloneTemplateState(template);
      const next = updater(current);

      if (JSON.stringify(current) === JSON.stringify(next)) return;

      const coalesceKey = options?.coalesceKey;
      const isCoalescedContinuation =
        Boolean(coalesceKey) &&
        pendingHistoryKeyRef.current === coalesceKey &&
        undoStackRef.current.length > 0;

      if (!isCoalescedContinuation) {
        undoStackRef.current.push(current);
      }

      if (coalesceKey) {
        scheduleCoalescedHistoryWindow(coalesceKey);
      } else {
        clearPendingCoalescedHistory();
      }

      redoStackRef.current = [];
      setSaveFeedback(null);
      onUpdateMineTemplate(() => next);
      setHistoryTick((value) => value + 1);
    },
    [
      canEdit,
      clearPendingCoalescedHistory,
      onUpdateMineTemplate,
      scheduleCoalescedHistoryWindow,
      template,
    ],
  );

  const applyTemplateTypingUpdate = React.useCallback(
    (coalesceKey: string, updater: (template: SoapTemplate) => SoapTemplate) => {
      applyTemplateUpdate(updater, { coalesceKey });
    },
    [applyTemplateUpdate],
  );

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  const frameActionButtonClass =
    "h-8 w-8 rounded-sm p-0 text-zinc-700 hover:bg-transparent hover:text-zinc-900 disabled:text-zinc-400 disabled:opacity-100";

  const handleUndo = React.useCallback(() => {
    if (!canEdit || undoStackRef.current.length === 0) return;
    clearPendingCoalescedHistory();

    const previous = undoStackRef.current.pop();
    if (!previous) return;

    redoStackRef.current.push(cloneTemplateState(template));
    onUpdateMineTemplate(() => previous);
    setHistoryTick((value) => value + 1);
  }, [canEdit, clearPendingCoalescedHistory, onUpdateMineTemplate, template]);

  const handleRedo = React.useCallback(() => {
    if (!canEdit || redoStackRef.current.length === 0) return;
    clearPendingCoalescedHistory();

    const next = redoStackRef.current.pop();
    if (!next) return;

    undoStackRef.current.push(cloneTemplateState(template));
    onUpdateMineTemplate(() => next);
    setHistoryTick((value) => value + 1);
  }, [canEdit, clearPendingCoalescedHistory, onUpdateMineTemplate, template]);

  const handleSave = React.useCallback(async () => {
    if (!canEdit || !isDirty || isSaving) return;

    setIsSaving(true);
    setSaveFeedback(null);

    const result = await onSaveMineTemplate(template);
    if (!result.success) {
      setSaveFeedback(result.error ?? "Failed to save template.");
      toast({
        title: "Save failed",
        description: result.error ?? "Failed to save template.",
        variant: "destructive",
      });
      setIsSaving(false);
      return;
    }

    lastSavedSnapshotRef.current = JSON.stringify(template);
    setSaveFeedback("Saved.");
    toast({
      title: "Changes saved",
      description: "Template changes were saved successfully.",
    });
    setIsSaving(false);
  }, [canEdit, isDirty, isSaving, onSaveMineTemplate, template, toast]);

  const schemaValidation = bodySchemaEditorSchema.safeParse(template.bodySchema);
  const runtimeSchema = schemaValidation.success ? buildRuntimeSchema(schemaValidation.data) : null;

  const parsedLlmObject = coerceDraftToObject(llmJsonDraft);

  const objectValidation = runtimeSchema && parsedLlmObject.ok
    ? validateAndNormalizeLlmPayload(template, parsedLlmObject.value)
    : null;

  const exampleOutput = (objectValidation?.success
    ? objectValidation.data
    : buildSampleObject(template.bodySchema)) as Record<string, unknown>;

  const llmInstructionPreview = buildLlmInstructionForTemplate(template);
  const strictJsonShapePreview = buildStrictJsonShapeExample(template);
  const selectedHeaderFooterStyle = HEADER_FOOTER_STYLES[template.headerFooterStyle];
  const normalization = {
    ...defaultNoteNormalizationSettings,
    ...(template.normalization ?? {}),
  };
  const headerFieldKeys = new Set([
    "hospitalName",
    "hospitalAddressLine1",
    "hospitalAddressLine2",
    "hospitalContact",
    "hospitalLogoUrl",
    "headerIconUrl",
  ]);
  const footerFieldKeys = new Set(["doctorSignature", "doctorSignatureImageUrl"]);
  const metadataFieldKeys = new Set(["doctorName", "doctorCredentials", "doctorLicenseNo"]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {template.source === "mine" && !template.isActive && (
            <Button type="button" variant="outline" onClick={() => onSetChosenTemplate(template.id)}>
              Set as Active Template
            </Button>
          )}

          {template.source === "library" && (
            <Button type="button" onClick={() => onCloneTemplate(template)}>
              <Copy className="mr-1 h-4 w-4" /> Clone to edit
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">About this template</h2>
          <Button type="button" variant="ghost" onClick={onBackToGallery} className="shrink-0">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          This template defines how your clinical note is structured, including the header and footer,
          the body sections, and how transcript information is shaped into the final note output.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-1.5 bg-transparent">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setActivePanel("structure")}
            className={`group rounded-lg px-3 h-9 border transition-colors ${
              activePanel === "structure"
                ? "bg-muted text-foreground border-transparent"
                : "text-foreground border-transparent hover:bg-muted"
            }`}
          >
            <LayoutTemplate
              className={
                activePanel === "structure"
                  ? "h-4 w-4 text-emerald-600"
                  : "h-4 w-4 text-muted-foreground group-hover:text-emerald-500"
              }
            />
            Structure
          </Button>

          <div className="h-6 w-px bg-border/70" />

          <Button
            type="button"
            variant="ghost"
            onClick={() => setActivePanel("prompt")}
            className={`group rounded-lg px-3 h-9 border transition-colors ${
              activePanel === "prompt"
                ? "bg-muted text-foreground border-transparent"
                : "text-foreground border-transparent hover:bg-muted"
            }`}
          >
            <FileCode2
              className={
                activePanel === "prompt"
                  ? "h-4 w-4 text-violet-600"
                  : "h-4 w-4 text-muted-foreground group-hover:text-violet-500"
              }
            />
            Prompt
          </Button>

          <div className="h-6 w-px bg-border/70" />

          <Button
            type="button"
            variant="ghost"
            onClick={() => setActivePanel("schema")}
            className={`group rounded-lg px-3 h-9 border transition-colors ${
              activePanel === "schema"
                ? "bg-muted text-foreground border-transparent"
                : "text-foreground border-transparent hover:bg-muted"
            }`}
          >
            <Plus
              className={
                activePanel === "schema"
                  ? "h-4 w-4 text-amber-600"
                  : "h-4 w-4 text-muted-foreground group-hover:text-amber-500"
              }
            />
            Body Schema
          </Button>

          <div className="h-6 w-px bg-border/70" />

          <Button
            type="button"
            variant="ghost"
            onClick={() => setActivePanel("config")}
            className={`group rounded-lg px-3 h-9 border transition-colors ${
              activePanel === "config"
                ? "bg-muted text-foreground border-transparent"
                : "text-foreground border-transparent hover:bg-muted"
            }`}
          >
            <Settings2
              className={
                activePanel === "config"
                  ? "h-4 w-4 text-teal-600"
                  : "h-4 w-4 text-muted-foreground group-hover:text-teal-500"
              }
            />
            Config
          </Button>

          <div className="h-6 w-px bg-border/70" />

          <Button
            type="button"
            variant="ghost"
            onClick={() => setActivePanel("preview")}
            className={`group rounded-lg px-3 h-9 border transition-colors ${
              activePanel === "preview"
                ? "bg-muted text-foreground border-transparent"
                : "text-foreground border-transparent hover:bg-muted"
            }`}
          >
            <FileText
              className={
                activePanel === "preview"
                  ? "h-4 w-4 text-blue-600"
                  : "h-4 w-4 text-muted-foreground group-hover:text-blue-500"
              }
            />
            Preview
          </Button>
        </div>

        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span>
                {activePanel === "structure" && "Edit header/footer/meta fields"}
                {activePanel === "prompt" && "Set prompt directives and inspect instruction output"}
                {activePanel === "schema" && "Define the main body schema and field policies"}
                {activePanel === "config" && "Post-generation normalization and payload validation"}
                {activePanel === "preview" && "Rendered example note preview"}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={frameActionButtonClass}
                  title={isSaving ? "Saving..." : "Save changes"}
                  disabled={!canEdit || !isDirty || isSaving}
                  onClick={() => {
                    void handleSave();
                  }}
                >
                  <Save className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={frameActionButtonClass}
                  title="Undo"
                  disabled={!canEdit || !canUndo}
                  onClick={handleUndo}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={frameActionButtonClass}
                  title="Redo"
                  disabled={!canEdit || !canRedo}
                  onClick={handleRedo}
                >
                  <Redo2 className="h-4 w-4" />
                </Button>

                {activePanel === "preview" ? (
                  <PDFDownloadLink
                    document={<NoteDocument template={template} llmObject={exampleOutput} />}
                    fileName={`${template.name.toLowerCase().replace(/\s+/g, "-")}.pdf`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-sm p-0 text-zinc-700 hover:bg-transparent hover:text-zinc-900"
                    title="Download PDF"
                  >
                    {({ loading }) =>
                      loading ? (
                        <span className="text-[10px] text-muted-foreground">...</span>
                      ) : (
                        <Download className="h-4 w-4" />
                      )
                    }
                  </PDFDownloadLink>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={frameActionButtonClass}
                    title="Download"
                    disabled
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div
            className={
              activePanel === "preview"
                ? "p-3 md:p-4 min-h-[84vh] max-h-[90vh] overflow-y-auto"
                : "p-4 md:p-5 min-h-[76vh] max-h-[82vh] overflow-y-auto"
            }
          >
            {activePanel !== "preview" && (
              <div className="space-y-6">
                {activePanel === "structure" && (
                  <StructurePanel
                    template={template}
                    canEdit={canEdit}
                    selectedHeaderFooterStyle={selectedHeaderFooterStyle}
                    headerFieldKeys={headerFieldKeys}
                    footerFieldKeys={footerFieldKeys}
                    metadataFieldKeys={metadataFieldKeys}
                    applyTemplateUpdate={applyTemplateUpdate}
                    applyTemplateTypingUpdate={applyTemplateTypingUpdate}
                  />
                )}

                {activePanel === "prompt" && (
                  <PromptPanel
                    template={template}
                    canEdit={canEdit}
                    llmInstructionPreview={llmInstructionPreview}
                    strictJsonShapePreview={strictJsonShapePreview}
                    applyTemplateTypingUpdate={applyTemplateTypingUpdate}
                  />
                )}

                {activePanel === "schema" && (
                  <SchemaPanel
                    template={template}
                    canEdit={canEdit}
                    schemaValidation={schemaValidation}
                    applyTemplateUpdate={applyTemplateUpdate}
                    applyTemplateTypingUpdate={applyTemplateTypingUpdate}
                    getSoapFieldDefaults={getSoapFieldDefaults}
                  />
                )}

                {activePanel === "config" && (
                  <ConfigPanel
                    template={template}
                    canEdit={canEdit}
                    normalization={normalization}
                    llmJsonDraft={llmJsonDraft}
                    onSetLlmJsonDraft={onSetLlmJsonDraft}
                    parsedLlmObject={parsedLlmObject}
                    objectValidation={objectValidation}
                    applyTemplateUpdate={applyTemplateUpdate}
                  />
                )}
              </div>
            )}

            {activePanel === "preview" && (
              <PreviewPanel template={template} llmObject={exampleOutput} />
            )}
          </div>

          <div className="border-t bg-muted/20 px-4 py-2 text-center text-sm text-muted-foreground">
            {saveFeedback ?? "Note will be generated based on the patient doctor conversation transcript."}
          </div>
        </div>
      </div>
    </div>
  );
}
