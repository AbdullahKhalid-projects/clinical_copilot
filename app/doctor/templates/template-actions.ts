"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";

import {
  defaultNoteNormalizationSettings,
  type SoapTemplate,
  type TemplateField,
  type TemplateFieldType,
} from "./types";
import { mapRecordToSoapTemplate } from "@/lib/template-utils";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const db = prisma as any;

function toDbFieldType(type: TemplateFieldType): string {
  if (type === "number") return "NUMBER";
  if (type === "boolean") return "BOOLEAN";
  return "STRING";
}

function toDbFallbackPolicy(policy?: string): string {
  if (policy === "not_documented") return "NOT_DOCUMENTED";
  if (policy === "omit_if_optional") return "OMIT_IF_OPTIONAL";
  return "EMPTY";
}

async function getAuthenticatedDbUser() {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: user.id },
    select: { id: true, role: true },
  });

  if (!dbUser) throw new Error("User not found");
  return dbUser;
}

function buildFieldRows(fields: TemplateField[]) {
  return fields.map((field, index) => ({
    fieldOrder: index,
    key: field.key,
    label: field.label,
    type: toDbFieldType(field.type),
    required: field.required,
    guidance: field.guidance ?? null,
    hint: field.hint ?? null,
    fallbackPolicy: toDbFallbackPolicy(field.fallbackPolicy),
  }));
}

export async function getNoteStudioTemplates(): Promise<
  ActionResult<{ libraryTemplates: SoapTemplate[]; personalTemplates: SoapTemplate[] }>
> {
  try {
    const dbUser = await getAuthenticatedDbUser();

    const [libraryTemplates, personalTemplates] = await Promise.all([
      db.noteTemplate.findMany({
        where: { source: "LIBRARY" },
        include: { fields: { orderBy: { fieldOrder: "asc" } } },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      db.noteTemplate.findMany({
        where: {
          source: "PERSONAL",
          userId: dbUser.id,
        },
        include: { fields: { orderBy: { fieldOrder: "asc" } } },
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    return {
      success: true,
      data: {
        libraryTemplates: libraryTemplates.map(mapRecordToSoapTemplate),
        personalTemplates: personalTemplates.map(mapRecordToSoapTemplate),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load templates";
    return { success: false, error: message };
  }
}

export async function createPersonalNoteTemplate(
  template: SoapTemplate,
): Promise<ActionResult<SoapTemplate>> {
  try {
    const dbUser = await getAuthenticatedDbUser();

    const created = await db.noteTemplate.create({
      data: {
        name: template.name,
        description: template.description,
        promptDirectives: template.promptDirectives ?? null,
        source: "PERSONAL",
        isActive: template.isActive,
        headerFooterStyle: "DEFAULT",
        headerTextAlign:
          template.headerTextAlign === "left"
            ? "LEFT"
            : template.headerTextAlign === "right"
              ? "RIGHT"
              : "CENTER",
        profileContext: template.profileContext,
        header: template.header,
        footer: template.footer,
        normalization: template.normalization ?? defaultNoteNormalizationSettings,
        user: { connect: { id: dbUser.id } },
        fields: {
          createMany: {
            data: buildFieldRows(template.bodySchema.fields),
          },
        },
      },
      include: { fields: { orderBy: { fieldOrder: "asc" } } },
    });

    revalidatePath("/doctor/note-studio");
    return { success: true, data: mapRecordToSoapTemplate(created) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create template";
    return { success: false, error: message };
  }
}

export async function updatePersonalNoteTemplate(
  templateId: string,
  template: SoapTemplate,
): Promise<ActionResult<SoapTemplate>> {
  try {
    const dbUser = await getAuthenticatedDbUser();

    const existing = await db.noteTemplate.findFirst({
      where: {
        id: templateId,
        source: "PERSONAL",
        userId: dbUser.id,
      },
      select: { id: true },
    });

    if (!existing) return { success: false, error: "Template not found" };

    const updated = await prisma.$transaction(async (tx) => {
      const txDb = tx as any;

      await txDb.noteTemplateField.deleteMany({
        where: { templateId: existing.id },
      });

      await txDb.noteTemplate.update({
        where: { id: existing.id },
        data: {
          name: template.name,
          description: template.description,
          promptDirectives: template.promptDirectives ?? null,
          isActive: template.isActive,
          headerFooterStyle: "DEFAULT",
          headerTextAlign:
            template.headerTextAlign === "left"
              ? "LEFT"
              : template.headerTextAlign === "right"
                ? "RIGHT"
                : "CENTER",
          profileContext: template.profileContext,
          header: template.header,
          footer: template.footer,
          normalization: template.normalization ?? defaultNoteNormalizationSettings,
        },
      });

      await txDb.noteTemplateField.createMany({
        data: buildFieldRows(template.bodySchema.fields).map((field) => ({
          ...field,
          templateId: existing.id,
        })),
      });

      return txDb.noteTemplate.findUniqueOrThrow({
        where: { id: existing.id },
        include: { fields: { orderBy: { fieldOrder: "asc" } } },
      });
    });

    revalidatePath("/doctor/note-studio");
    return { success: true, data: mapRecordToSoapTemplate(updated) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update template";
    return { success: false, error: message };
  }
}

export async function deletePersonalNoteTemplate(templateId: string): Promise<ActionResult<null>> {
  try {
    const dbUser = await getAuthenticatedDbUser();

    const existing = await db.noteTemplate.findFirst({
      where: {
        id: templateId,
        source: "PERSONAL",
        userId: dbUser.id,
      },
      select: { id: true },
    });

    if (!existing) return { success: false, error: "Template not found" };

    await db.noteTemplate.delete({ where: { id: existing.id } });
    revalidatePath("/doctor/note-studio");

    return { success: true, data: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete template";
    return { success: false, error: message };
  }
}

export async function cloneLibraryTemplateToPersonal(
  libraryTemplateId: string,
): Promise<ActionResult<SoapTemplate>> {
  try {
    const dbUser = await getAuthenticatedDbUser();

    const libraryTemplate = await db.noteTemplate.findFirst({
      where: {
        id: libraryTemplateId,
        source: "LIBRARY",
      },
      include: { fields: { orderBy: { fieldOrder: "asc" } } },
    });

    if (!libraryTemplate) return { success: false, error: "Library template not found" };

    const cloned = await db.noteTemplate.create({
      data: {
        name: `${libraryTemplate.name} (Copy)`,
        description: `Cloned from library template: ${libraryTemplate.name}`,
        promptDirectives: libraryTemplate.promptDirectives,
        source: "PERSONAL",
        isActive: true,
        headerFooterStyle: libraryTemplate.headerFooterStyle,
        headerTextAlign: libraryTemplate.headerTextAlign,
        profileContext: libraryTemplate.profileContext,
        header: libraryTemplate.header,
        footer: libraryTemplate.footer,
        normalization: libraryTemplate.normalization,
        user: { connect: { id: dbUser.id } },
        fields: {
          createMany: {
            data: (libraryTemplate.fields ?? []).map((field: any) => ({
              fieldOrder: field.fieldOrder,
              key: field.key,
              label: field.label,
              type: field.type,
              required: field.required,
              guidance: field.guidance,
              hint: field.hint,
              fallbackPolicy: field.fallbackPolicy,
            })),
          },
        },
      },
      include: { fields: { orderBy: { fieldOrder: "asc" } } },
    });

    revalidatePath("/doctor/note-studio");
    return { success: true, data: mapRecordToSoapTemplate(cloned) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clone template";
    return { success: false, error: message };
  }
}

export async function setPersonalTemplateActive(
  templateId: string,
  isActive: boolean,
): Promise<ActionResult<null>> {
  try {
    const dbUser = await getAuthenticatedDbUser();

    const existing = await db.noteTemplate.findFirst({
      where: {
        id: templateId,
        source: "PERSONAL",
        userId: dbUser.id,
      },
      select: { id: true },
    });

    if (!existing) return { success: false, error: "Template not found" };

    if (isActive) {
      await prisma.$transaction(async (tx) => {
        const txDb = tx as any;

        await txDb.noteTemplate.updateMany({
          where: {
            source: "PERSONAL",
            userId: dbUser.id,
          },
          data: { isActive: false },
        });

        await txDb.noteTemplate.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      });
    } else {
      await db.noteTemplate.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
    }

    revalidatePath("/doctor/note-studio");
    return { success: true, data: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update active status";
    return { success: false, error: message };
  }
}
