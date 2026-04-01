"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";

import { NoteStudioHeader } from "./components/note-studio-header";
import { NoteStudioLoadingShell } from "./components/note-studio-loading-shell";
import { TemplateEditorView } from "./components/template-editor-view";
import { TemplateGalleryView } from "./components/template-gallery-view";
import {
  cloneLibraryTemplateToPersonal,
  createPersonalNoteTemplate,
  deletePersonalNoteTemplate,
  getNoteStudioTemplates,
  setPersonalTemplateActive,
  updatePersonalNoteTemplate,
} from "./template-actions";
import { buildEmptyTemplate } from "./mock-data";
import { buildSampleObject } from "./schema";
import type { SoapTemplate } from "./types";

type StudioViewMode = "gallery" | "editor";

type NoteStudioClientProps = {
  initialViewMode?: StudioViewMode;
  initialTemplateId?: string;
};

function getTemplateEditorPath(templateId: string) {
  return `/doctor/note-studio/templates/${templateId}`;
}

export function NoteStudioClient({
  initialViewMode = "gallery",
  initialTemplateId,
}: NoteStudioClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [libraryTemplates, setLibraryTemplates] = React.useState<SoapTemplate[]>([]);
  const [myTemplates, setMyTemplates] = React.useState<SoapTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
  const [selectedTemplateSource, setSelectedTemplateSource] = React.useState<"mine" | "library">("mine");
  const [chosenTemplateId, setChosenTemplateId] = React.useState("");
  const [viewMode, setViewMode] = React.useState<StudioViewMode>(initialViewMode);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const initialRouteAppliedRef = React.useRef(false);
  const selectedTemplateIdRef = React.useRef("");
  const chosenTemplateIdRef = React.useRef("");

  const [llmJsonDraft, setLlmJsonDraft] = React.useState("{}");

  React.useEffect(() => {
    selectedTemplateIdRef.current = selectedTemplateId;
  }, [selectedTemplateId]);

  React.useEffect(() => {
    chosenTemplateIdRef.current = chosenTemplateId;
  }, [chosenTemplateId]);

  const refreshTemplates = React.useCallback(
    async (preferredTemplateId?: string) => {
      const result = await getNoteStudioTemplates();

      if (!result.success) {
        setErrorMessage(result.error);
        setIsLoading(false);
        return;
      }

      const nextLibrary = result.data.libraryTemplates;
      const nextMine = result.data.personalTemplates;
      const allTemplates = [...nextMine, ...nextLibrary];

      setLibraryTemplates(nextLibrary);
      setMyTemplates(nextMine);
      setIsLoading(false);
      setErrorMessage(null);

      const preferred = preferredTemplateId
        ? allTemplates.find((template) => template.id === preferredTemplateId)
        : null;

      const current = allTemplates.find((template) => template.id === selectedTemplateIdRef.current);
      const fallback = nextMine[0] ?? nextLibrary[0] ?? null;
      const nextSelected = preferred ?? current ?? fallback;

      if (nextSelected) {
        setSelectedTemplateId(nextSelected.id);
        setSelectedTemplateSource(nextSelected.source);
      } else {
        setSelectedTemplateId("");
        setSelectedTemplateSource("mine");
      }

      const chosenStillExists = nextMine.some((template) => template.id === chosenTemplateIdRef.current);
      if (chosenStillExists) {
        if (!initialRouteAppliedRef.current && initialTemplateId) {
          const routeTemplate = allTemplates.find((template) => template.id === initialTemplateId);
          if (routeTemplate) {
            setSelectedTemplateId(routeTemplate.id);
            setSelectedTemplateSource(routeTemplate.source);
            setViewMode("editor");
          }
          initialRouteAppliedRef.current = true;
        }
        return;
      }

      setChosenTemplateId(nextMine[0]?.id ?? "");

      if (!initialRouteAppliedRef.current && initialTemplateId) {
        const routeTemplate = allTemplates.find((template) => template.id === initialTemplateId);
        if (routeTemplate) {
          setSelectedTemplateId(routeTemplate.id);
          setSelectedTemplateSource(routeTemplate.source);
          setViewMode("editor");
        }
        initialRouteAppliedRef.current = true;
      }
    },
    [initialTemplateId],
  );

  React.useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);

  React.useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);

  const selectedTemplate = React.useMemo(() => {
    const fromMine = myTemplates.find((item) => item.id === selectedTemplateId);
    if (fromMine) return fromMine;

    return libraryTemplates.find((item) => item.id === selectedTemplateId) ?? null;
  }, [libraryTemplates, myTemplates, selectedTemplateId]);

  React.useEffect(() => {
    if (!selectedTemplate) return;
    setLlmJsonDraft(JSON.stringify(buildSampleObject(selectedTemplate.bodySchema), null, 2));
  }, [selectedTemplate]);

  const setChosenTemplate = React.useCallback(
    async (templateId: string) => {
      const template = myTemplates.find((item) => item.id === templateId);
      if (!template) return;

      const result = await setPersonalTemplateActive(templateId, true);
      if (!result.success) {
        setErrorMessage(result.error);
        return;
      }

      setMyTemplates((prev) =>
        prev.map((item) => ({
          ...item,
          isActive: item.id === templateId,
        })),
      );
      setChosenTemplateId(templateId);
    },
    [myTemplates],
  );

  const openTemplate = React.useCallback((template: SoapTemplate) => {
    router.push(getTemplateEditorPath(template.id));
  }, [router]);

  const createTemplate = React.useCallback(async () => {
    const nextTemplate = buildEmptyTemplate();
    const result = await createPersonalNoteTemplate(nextTemplate);

    if (!result.success) {
      setErrorMessage(result.error);
      return;
    }

    await setChosenTemplate(result.data.id);
    await refreshTemplates(result.data.id);
    router.push(getTemplateEditorPath(result.data.id));
  }, [refreshTemplates, setChosenTemplate]);

  const cloneTemplate = React.useCallback(
    async (template: SoapTemplate) => {
      if (template.source !== "library") return;

      const result = await cloneLibraryTemplateToPersonal(template.id);

      if (!result.success) {
        setErrorMessage(result.error);
        return;
      }

      await setChosenTemplate(result.data.id);
      await refreshTemplates(result.data.id);
      router.push(getTemplateEditorPath(result.data.id));
    },
    [refreshTemplates, router, setChosenTemplate],
  );

  const renameTemplate = React.useCallback(
    async (template: SoapTemplate, nextName: string) => {
      if (template.source !== "mine") return;
      if (!nextName || nextName === template.name) return;

      const result = await updatePersonalNoteTemplate(template.id, {
        ...template,
        name: nextName,
      });

      if (!result.success) {
        setErrorMessage(result.error);
        toast({
          title: "Rename failed",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      setMyTemplates((prev) => prev.map((item) => (item.id === template.id ? result.data : item)));
      if (selectedTemplateId === template.id) {
        setSelectedTemplateId(result.data.id);
        setSelectedTemplateSource("mine");
      }
      setErrorMessage(null);
    },
    [selectedTemplateId, toast],
  );

  const setActiveTemplateFromGallery = React.useCallback(
    async (template: SoapTemplate) => {
      if (template.source !== "mine") return;
      await setChosenTemplate(template.id);
    },
    [setChosenTemplate],
  );

  const deleteTemplate = React.useCallback(
    async (template: SoapTemplate) => {
      if (template.source !== "mine") return;
      if (myTemplates.length <= 1) {
        toast({
          title: "Cannot delete template",
          description: "At least one personal template is required.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Are you sure you want to delete",
        variant: "destructive",
        action: (
          <ToastAction
            altText={`Confirm delete ${template.name}`}
            onClick={() => {
              void (async () => {
                const result = await deletePersonalNoteTemplate(template.id);
                if (!result.success) {
                  setErrorMessage(result.error);
                  toast({
                    title: "Delete failed",
                    description: result.error,
                    variant: "destructive",
                  });
                  return;
                }

                setErrorMessage(null);
                await refreshTemplates();
                if (selectedTemplateId === template.id) {
                  setViewMode("gallery");
                }

                toast({
                  title: "Template deleted",
                  description: `\"${template.name}\" has been removed.`,
                });
              })();
            }}
          >
            Delete
          </ToastAction>
        ),
      });
    },
    [myTemplates.length, refreshTemplates, selectedTemplateId, toast],
  );

  const updateSelectedMineTemplate = React.useCallback(
    (updater: (template: SoapTemplate) => SoapTemplate) => {
      if (selectedTemplateSource !== "mine") return;

      const currentTemplate = myTemplates.find((item) => item.id === selectedTemplateId);
      if (!currentTemplate) return;

      const templateToPersist = updater(currentTemplate);

      setMyTemplates((prev) =>
        prev.map((item) => {
          if (item.id !== selectedTemplateId) return item;
          return templateToPersist;
        }),
      );
    },
    [myTemplates, selectedTemplateId, selectedTemplateSource],
  );

  const saveMineTemplate = React.useCallback(async (template: SoapTemplate) => {
    if (template.source !== "mine") {
      return { success: false, error: "Only personal templates can be saved." };
    }

    const result = await updatePersonalNoteTemplate(template.id, template);
    if (!result.success) {
      setErrorMessage(result.error);
      return { success: false, error: result.error };
    }

    setErrorMessage(null);
    setMyTemplates((prev) => prev.map((item) => (item.id === template.id ? result.data : item)));
    return { success: true };
  }, []);

  if (isLoading) {
    return <NoteStudioLoadingShell />;
  }

  return (
    <div className="h-full flex-1 flex-col space-y-0 md:flex">
      <NoteStudioHeader />

      <div className="space-y-6 px-4 sm:px-5 pt-6 pb-8">
        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {viewMode === "gallery" ? (
          <TemplateGalleryView
            myTemplates={myTemplates}
            libraryTemplates={libraryTemplates}
            chosenTemplateId={chosenTemplateId}
            onCreateTemplate={createTemplate}
            onOpenTemplate={openTemplate}
            onCloneTemplate={cloneTemplate}
            onSetActiveTemplate={setActiveTemplateFromGallery}
            onRenameTemplate={renameTemplate}
            onDeleteTemplate={deleteTemplate}
          />
        ) : !isLoading && selectedTemplate ? (
          <TemplateEditorView
            template={selectedTemplate}
            chosenTemplateId={chosenTemplateId}
            llmJsonDraft={llmJsonDraft}
            onBackToGallery={() => {
              router.push("/doctor/note-studio/gallery");
            }}
            onSetChosenTemplate={setChosenTemplate}
            onCloneTemplate={cloneTemplate}
            onUpdateMineTemplate={updateSelectedMineTemplate}
            onSaveMineTemplate={saveMineTemplate}
            onSetLlmJsonDraft={setLlmJsonDraft}
          />
        ) : null}
      </div>
    </div>
  );
}
