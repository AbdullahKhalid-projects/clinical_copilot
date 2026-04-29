import { CheckCircle2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import type { TemplateFieldType } from "../../types";
import type { SchemaPanelProps } from "./types";

export function SchemaPanel({
  template,
  canEdit,
  schemaValidation,
  applyTemplateUpdate,
  applyTemplateTypingUpdate,
  getSoapFieldDefaults,
}: SchemaPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Main Body Schema (Zod Contract)</CardTitle>
        <CardDescription>
          Define the exact shape your LLM must return. Key = JSON field name, Label = section title in note,
          Type = value data type.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">Main Body Title</label>
            <Input
              value={template.bodySchema.title}
              disabled={!canEdit}
              onChange={(event) =>
                applyTemplateTypingUpdate("schema:title", (prev) => ({
                  ...prev,
                  bodySchema: {
                    ...prev.bodySchema,
                    title: event.target.value,
                  },
                }))
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit}
              onClick={() =>
                applyTemplateUpdate((prev) => ({
                  ...prev,
                  bodySchema: {
                    ...prev.bodySchema,
                    fields: prev.bodySchema.fields.map((field) => {
                      const defaults = getSoapFieldDefaults(field);
                      return {
                        ...field,
                        guidance: defaults.guidance,
                        fallbackPolicy: defaults.fallbackPolicy,
                      };
                    }),
                  },
                }))
              }
            >
              Apply SOAP Defaults
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={!canEdit}
              onClick={() =>
                applyTemplateUpdate((prev) => {
                  const nextIndex = prev.bodySchema.fields.length + 1;
                  return {
                    ...prev,
                    bodySchema: {
                      ...prev.bodySchema,
                      fields: [
                        ...prev.bodySchema.fields,
                        {
                          key: `new_field_${nextIndex}`,
                          label: `New Field ${nextIndex}`,
                          type: "string",
                          required: false,
                          guidance: "Only include when explicitly supported by transcript evidence.",
                          fallbackPolicy: "empty",
                        },
                      ],
                    },
                  };
                })
              }
            >
              <Plus className="mr-1 h-3 w-3" /> Add Field
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {template.bodySchema.fields.map((field, index) => (
            <div key={`field-row-${index}`} className="rounded-lg border p-3">
              <div className="grid gap-3 md:grid-cols-12">
                <div className="space-y-1 md:col-span-3">
                  <label className="text-xs text-muted-foreground">Key</label>
                  <Input
                    value={field.key}
                    disabled={!canEdit}
                    onChange={(event) =>
                      applyTemplateTypingUpdate(`schema:key:${index}`, (prev) => ({
                        ...prev,
                        bodySchema: {
                          ...prev.bodySchema,
                          fields: prev.bodySchema.fields.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, key: event.target.value } : item,
                          ),
                        },
                      }))
                    }
                  />
                </div>

                <div className="space-y-1 md:col-span-4">
                  <label className="text-xs text-muted-foreground">Label</label>
                  <Input
                    value={field.label}
                    disabled={!canEdit}
                    onChange={(event) =>
                      applyTemplateTypingUpdate(`schema:label:${index}`, (prev) => ({
                        ...prev,
                        bodySchema: {
                          ...prev.bodySchema,
                          fields: prev.bodySchema.fields.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, label: event.target.value } : item,
                          ),
                        },
                      }))
                    }
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs text-muted-foreground">Type</label>
                  <select
                    value={field.type}
                    disabled={!canEdit}
                    onChange={(event) =>
                      applyTemplateUpdate((prev) => ({
                        ...prev,
                        bodySchema: {
                          ...prev.bodySchema,
                          fields: prev.bodySchema.fields.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, type: event.target.value as TemplateFieldType }
                              : item,
                          ),
                        },
                      }))
                    }
                    className="border-input bg-background w-full rounded-md border px-2 py-2 text-sm"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                </div>

                <div className="flex items-end gap-2 md:col-span-3 md:justify-end">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Required</span>
                    <Switch
                      checked={field.required}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        applyTemplateUpdate((prev) => ({
                          ...prev,
                          bodySchema: {
                            ...prev.bodySchema,
                            fields: prev.bodySchema.fields.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, required: checked } : item,
                            ),
                          },
                        }))
                      }
                    />
                  </div>

                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={!canEdit}
                    onClick={() =>
                      applyTemplateUpdate((prev) => ({
                        ...prev,
                        bodySchema: {
                          ...prev.bodySchema,
                          fields: prev.bodySchema.fields.filter((_, itemIndex) => itemIndex !== index),
                        },
                      }))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-8">
                <div className="space-y-1 md:col-span-5">
                  <label className="text-xs text-muted-foreground">Field Guidance</label>
                  <Input
                    value={field.guidance ?? ""}
                    disabled={!canEdit}
                    placeholder="How should this section be written from transcript evidence?"
                    onChange={(event) =>
                      applyTemplateTypingUpdate(`schema:guidance:${index}`, (prev) => ({
                        ...prev,
                        bodySchema: {
                          ...prev.bodySchema,
                          fields: prev.bodySchema.fields.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, guidance: event.target.value } : item,
                          ),
                        },
                      }))
                    }
                  />
                </div>

                <div className="space-y-1 md:col-span-3">
                  <label className="text-xs text-muted-foreground">Fallback Policy</label>
                  <select
                    value={field.fallbackPolicy ?? "empty"}
                    disabled={!canEdit}
                    onChange={(event) =>
                      applyTemplateUpdate((prev) => ({
                        ...prev,
                        bodySchema: {
                          ...prev.bodySchema,
                          fields: prev.bodySchema.fields.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  fallbackPolicy: event.target.value as
                                    | "empty"
                                    | "not_documented"
                                    | "omit_if_optional",
                                }
                              : item,
                          ),
                        },
                      }))
                    }
                    className="border-input bg-background w-full rounded-md border px-2 py-2 text-sm"
                  >
                    <option value="empty">Empty/default</option>
                    <option value="not_documented">Not documented</option>
                    <option value="omit_if_optional">Omit if optional</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Empty/default = type default, Not documented = explicit missing marker, Omit if optional =
                    remove field when no evidence.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          {schemaValidation.success ? (
            <p className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Body schema is valid and ready for strict object parsing.
            </p>
          ) : (
            <div className="space-y-1 text-red-600">
              <p className="font-medium">Schema has validation issues:</p>
              {schemaValidation.error.issues.map((issue, index) => (
                <p key={`${issue.path.join("-")}-${index}`} className="text-xs">
                  • {issue.path.join(".") || "schema"}: {issue.message}
                </p>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
