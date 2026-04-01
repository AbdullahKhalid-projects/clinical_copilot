import type { ReactNode } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { SoapTemplate } from "../types";
import { TemplateGalleryCard } from "./template-gallery-card";

type TemplateGalleryViewProps = {
  myTemplates: SoapTemplate[];
  libraryTemplates: SoapTemplate[];
  chosenTemplateId: string;
  onCreateTemplate: () => void;
  onOpenTemplate: (template: SoapTemplate) => void;
  onCloneTemplate: (template: SoapTemplate) => void;
  onSetActiveTemplate: (template: SoapTemplate) => void;
  onRenameTemplate: (template: SoapTemplate, nextName: string) => Promise<void> | void;
  onDeleteTemplate: (template: SoapTemplate) => void;
};

function GallerySection({
  title,
  description,
  templates,
  chosenTemplateId,
  onOpenTemplate,
  onCloneTemplate,
  onSetActiveTemplate,
  onRenameTemplate,
  onDeleteTemplate,
  action,
}: {
  title: string;
  description: string;
  templates: SoapTemplate[];
  chosenTemplateId: string;
  onOpenTemplate: (template: SoapTemplate) => void;
  onCloneTemplate: (template: SoapTemplate) => void;
  onSetActiveTemplate: (template: SoapTemplate) => void;
  onRenameTemplate: (template: SoapTemplate, nextName: string) => Promise<void> | void;
  onDeleteTemplate: (template: SoapTemplate) => void;
  action?: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <TemplateGalleryCard
            key={template.id}
            template={template}
            chosenTemplateId={chosenTemplateId}
            onOpen={onOpenTemplate}
            onClone={onCloneTemplate}
            onSetActive={onSetActiveTemplate}
            onRename={onRenameTemplate}
            onDelete={onDeleteTemplate}
          />
        ))}
      </div>
    </section>
  );
}

export function TemplateGalleryView({
  myTemplates,
  libraryTemplates,
  chosenTemplateId,
  onCreateTemplate,
  onOpenTemplate,
  onCloneTemplate,
  onSetActiveTemplate,
  onRenameTemplate,
  onDeleteTemplate,
}: TemplateGalleryViewProps) {
  return (
    <div className="space-y-8">
      <GallerySection
        title="Your templates"
        description="Your default and custom templates. Click any card to open the editor."
        templates={myTemplates}
        chosenTemplateId={chosenTemplateId}
        onOpenTemplate={onOpenTemplate}
        onCloneTemplate={onCloneTemplate}
        onSetActiveTemplate={onSetActiveTemplate}
        onRenameTemplate={onRenameTemplate}
        onDeleteTemplate={onDeleteTemplate}
        action={
          <Button
            type="button"
            onClick={onCreateTemplate}
            className="bg-black text-white border-2 border-white hover:bg-zinc-900"
          >
            <Plus className="mr-1 h-4 w-4" /> New Template
          </Button>
        }
      />

      <GallerySection
        title="Template library"
        description="Provided templates you can clone and customize in your own workspace."
        templates={libraryTemplates}
        chosenTemplateId={chosenTemplateId}
        onOpenTemplate={onOpenTemplate}
        onCloneTemplate={onCloneTemplate}
        onSetActiveTemplate={onSetActiveTemplate}
        onRenameTemplate={onRenameTemplate}
        onDeleteTemplate={onDeleteTemplate}
      />
    </div>
  );
}
