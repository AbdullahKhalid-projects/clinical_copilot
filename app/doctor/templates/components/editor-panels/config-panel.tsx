import { CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { defaultNoteNormalizationSettings } from "../../types";
import type { ConfigPanelProps } from "./types";

export function ConfigPanel({
  template,
  canEdit,
  normalization,
  llmJsonDraft,
  onSetLlmJsonDraft,
  parsedLlmObject,
  objectValidation,
  applyTemplateUpdate,
}: ConfigPanelProps) {
  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Post-Generation Normalization</CardTitle>
          <CardDescription>
            Controls applied after model output and before final validation/rendering.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">Trim text</span>
              <Switch
                checked={normalization.trimText}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  applyTemplateUpdate((prev) => ({
                    ...prev,
                    normalization: {
                      ...defaultNoteNormalizationSettings,
                      ...(prev.normalization ?? {}),
                      trimText: checked,
                    },
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">Collapse extra spaces</span>
              <Switch
                checked={normalization.collapseWhitespace}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  applyTemplateUpdate((prev) => ({
                    ...prev,
                    normalization: {
                      ...defaultNoteNormalizationSettings,
                      ...(prev.normalization ?? {}),
                      collapseWhitespace: checked,
                    },
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">Collapse extra line breaks</span>
              <Switch
                checked={normalization.collapseLineBreaks}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  applyTemplateUpdate((prev) => ({
                    ...prev,
                    normalization: {
                      ...defaultNoteNormalizationSettings,
                      ...(prev.normalization ?? {}),
                      collapseLineBreaks: checked,
                    },
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">Normalize N/A to Not documented</span>
              <Switch
                checked={normalization.normalizeNotDocumented}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  applyTemplateUpdate((prev) => ({
                    ...prev,
                    normalization: {
                      ...defaultNoteNormalizationSettings,
                      ...(prev.normalization ?? {}),
                      normalizeNotDocumented: checked,
                    },
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">LLM Object Playground</CardTitle>
          <CardDescription>
            Simulate structured JSON output and validate against the schema.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Incoming Structured Object JSON</label>
            <Textarea
              className="min-h-[220px] font-mono text-xs"
              value={llmJsonDraft}
              onChange={(event) => onSetLlmJsonDraft(event.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Validation Result</p>

            {!parsedLlmObject.ok ? (
              <p className="text-sm text-red-600">{parsedLlmObject.error}</p>
            ) : objectValidation?.success ? (
              <div className="space-y-2 text-sm text-emerald-700">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Object validated successfully.
                </p>
                <p className="text-xs text-muted-foreground">
                  This payload can be consumed directly for rendering and PDF generation.
                </p>
              </div>
            ) : (
              <div className="space-y-1 text-sm text-red-600">
                <p className="font-medium">Object is not compatible with schema:</p>
                {objectValidation?.success === false &&
                  objectValidation.error.issues.map((issue, index) => (
                    <p key={`${issue.path.join("-")}-${index}`} className="text-xs">
                      • {issue.path.join(".")}: {issue.message}
                    </p>
                  ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
