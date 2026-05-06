import { z } from "zod";

import type { TemplateBodySchema, TemplateField } from "./types";

export const fieldSchema = z.object({
  key: z
    .string()
    .min(2, "Key must be at least 2 characters")
    .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case keys (e.g. chief_complaint)"),
  label: z.string().min(2, "Label is required"),
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean(),
  guidance: z.string().optional(),
  hint: z.string().optional(),
  fallbackPolicy: z.enum(["empty", "not_documented", "omit_if_optional"]).optional(),
});

export const bodySchemaEditorSchema = z
  .object({
    title: z.string().min(2, "Section title is required"),
    fields: z.array(fieldSchema).min(1, "Add at least one body field"),
  })
  .superRefine((value, ctx) => {
    const unique = new Set<string>();

    value.fields.forEach((field, index) => {
      if (unique.has(field.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Field keys must be unique",
          path: ["fields", index, "key"],
        });
      }
      unique.add(field.key);
    });
  });

export function buildRuntimeSchema(bodySchema: TemplateBodySchema) {
  const shape: Record<string, z.ZodTypeAny> = {};

  bodySchema.fields.forEach((field) => {
    let validator: z.ZodTypeAny = z.string();

    if (field.type === "number") validator = z.number();
    if (field.type === "boolean") validator = z.boolean();

    shape[field.key] = field.required ? validator : validator.optional();
  });

  return z.object(shape).strict();
}

export function getSampleValue(field: TemplateField): string | number | boolean {
  if (field.type === "number") return 7;
  if (field.type === "boolean") return true;
  return `${field.label} generated from transcription context.`;
}

export function buildSampleObject(bodySchema: TemplateBodySchema): Record<string, string | number | boolean> {
  return bodySchema.fields.reduce<Record<string, string | number | boolean>>((acc, field) => {
    acc[field.key] = getSampleValue(field);
    return acc;
  }, {});
}
