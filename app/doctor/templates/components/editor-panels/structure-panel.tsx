import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

import { templatePlaceholderHelp } from "../../template-engine";
import type { SoapTemplate } from "../../types";
import type { StructurePanelProps } from "./types";

function updateProfileContext(
  template: SoapTemplate,
  key: keyof SoapTemplate["profileContext"],
  value: string,
) {
  return {
    ...template,
    profileContext: {
      ...template.profileContext,
      [key]: value,
    },
  };
}

export function StructurePanel({
  template,
  canEdit,
  selectedHeaderFooterStyle,
  headerFieldKeys,
  footerFieldKeys,
  metadataFieldKeys,
  applyTemplateUpdate,
  applyTemplateTypingUpdate,
}: StructurePanelProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Template Structure</CardTitle>
            <CardDescription className="mt-1">Header, footer, and metadata fields.</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{template.source === "mine" ? "Personal" : "Library"}</Badge>
            {template.source === "mine" && template.isActive && (
              <Badge className="bg-emerald-600 text-white">Active</Badge>
            )}
            {template.source === "mine" && !template.isActive && <Badge variant="outline">Inactive</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Template Name</label>
            <Input
              value={template.name}
              disabled={!canEdit}
              onChange={(event) =>
                applyTemplateTypingUpdate("structure:name", (prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={template.description}
              disabled={!canEdit}
              onChange={(event) =>
                applyTemplateTypingUpdate("structure:description", (prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Header/Footer Style</label>
            <select
              value={template.headerFooterStyle}
              disabled={!canEdit}
              onChange={(event) =>
                applyTemplateUpdate((prev) => ({
                  ...prev,
                  headerFooterStyle: event.target.value as SoapTemplate["headerFooterStyle"],
                }))
              }
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="default">Default</option>
            </select>
            <p className="text-xs text-muted-foreground">{selectedHeaderFooterStyle.description}</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-sm font-medium">Header Section</p>
          <p className="text-xs text-muted-foreground">
            Configure the header layout content for the selected style.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {selectedHeaderFooterStyle.metadataFields
              .filter((field) => headerFieldKeys.has(field.key))
              .map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{field.label}</label>
                  <Input
                    value={(template.profileContext[field.key] ?? "") as string}
                    placeholder={field.placeholder}
                    disabled={!canEdit}
                    onChange={(event) =>
                      applyTemplateTypingUpdate(`structure:header:${field.key}`, (prev) =>
                        updateProfileContext(prev, field.key, event.target.value),
                      )
                    }
                  />
                </div>
              ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-sm font-medium">Footer Section</p>
          <p className="text-xs text-muted-foreground">
            Configure footer signature and footer-specific fields.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {selectedHeaderFooterStyle.metadataFields
              .filter((field) => footerFieldKeys.has(field.key))
              .map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{field.label}</label>
                  <Input
                    value={(template.profileContext[field.key] ?? "") as string}
                    placeholder={field.placeholder}
                    disabled={!canEdit}
                    onChange={(event) =>
                      applyTemplateTypingUpdate(`structure:footer:${field.key}`, (prev) =>
                        updateProfileContext(prev, field.key, event.target.value),
                      )
                    }
                  />
                </div>
              ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-sm font-medium">Metadata Section</p>
          <p className="text-xs text-muted-foreground">
            General doctor identity fields used across header and footer style.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {selectedHeaderFooterStyle.metadataFields
              .filter((field) => metadataFieldKeys.has(field.key))
              .map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{field.label}</label>
                  <Input
                    value={(template.profileContext[field.key] ?? "") as string}
                    placeholder={field.placeholder}
                    disabled={!canEdit}
                    onChange={(event) =>
                      applyTemplateTypingUpdate(`structure:metadata:${field.key}`, (prev) =>
                        updateProfileContext(prev, field.key, event.target.value),
                      )
                    }
                  />
                </div>
              ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-sm font-medium">Available Placeholders</p>
          <p className="text-xs text-muted-foreground">
            Use these tokens in header/footer text templates. They are resolved when rendering the final note.
          </p>

          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="grid gap-2 md:grid-cols-2">
              {templatePlaceholderHelp.map((placeholder) => (
                <div key={placeholder.key} className="rounded border bg-background px-2 py-1.5">
                  <p className="font-mono text-xs text-foreground">{placeholder.key}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{placeholder.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
