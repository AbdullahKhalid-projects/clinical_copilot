import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import type { PromptPanelProps } from "./types";

export function PromptPanel({
  template,
  canEdit,
  llmInstructionPreview,
  strictJsonShapePreview,
  applyTemplateTypingUpdate,
}: PromptPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Prompt Controls</CardTitle>
        <CardDescription>
          Add template-specific directives and review the final generated prompt.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Extra Prompt Directives</label>
          <Textarea
            className="min-h-[120px]"
            value={template.promptDirectives ?? ""}
            disabled={!canEdit}
            placeholder="Example: Keep plan in bullet points. Use medication names exactly as spoken."
            onChange={(event) =>
              applyTemplateTypingUpdate("prompt:directives", (prev) => ({
                ...prev,
                promptDirectives: event.target.value,
              }))
            }
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Generated Prompt</label>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/10 p-3 font-mono text-[12px] leading-6 text-zinc-800">
            {llmInstructionPreview}
          </pre>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Strict JSON Shape</label>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/10 p-3 font-mono text-[12px] leading-6 text-zinc-800">
            {strictJsonShapePreview}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
