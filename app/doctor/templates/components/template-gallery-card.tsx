import { ArrowUpRight, Copy, Layers, Pencil, Trash2 } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { getTemplatePlaceholderMap, resolveTemplateTextPlaceholders } from "../template-engine";
import type { SoapTemplate } from "../types";

type TemplateGalleryCardProps = {
  template: SoapTemplate;
  chosenTemplateId: string;
  onOpen: (template: SoapTemplate) => void;
  onClone: (template: SoapTemplate) => void;
  onSetActive?: (template: SoapTemplate) => void;
  onRename?: (template: SoapTemplate, nextName: string) => Promise<void> | void;
  onDelete?: (template: SoapTemplate) => void;
};

export function TemplateGalleryCard({
  template,
  chosenTemplateId,
  onOpen,
  onClone,
  onSetActive,
  onRename,
  onDelete,
}: TemplateGalleryCardProps) {
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [draftName, setDraftName] = React.useState(template.name);

  React.useEffect(() => {
    setDraftName(template.name);
    setIsEditingName(false);
  }, [template.id, template.name]);

  const placeholderValues = getTemplatePlaceholderMap(template);
  const resolvedHeader = resolveTemplateTextPlaceholders(template.header, placeholderValues);

  const headerPreview = resolvedHeader.split("\n").filter(Boolean).slice(0, 2);
  const fieldPreview = template.bodySchema.fields.slice(0, 3);
  const extraFields = Math.max(template.bodySchema.fields.length - fieldPreview.length, 0);

  const commitRename = React.useCallback(async () => {
    if (template.source !== "mine") {
      setIsEditingName(false);
      return;
    }

    const nextName = draftName.trim();
    if (!nextName || nextName === template.name) {
      setDraftName(template.name);
      setIsEditingName(false);
      return;
    }

    await onRename?.(template, nextName);
    setIsEditingName(false);
  }, [draftName, onRename, template]);

  const handleOpen = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, input, textarea, select, a, [data-no-open='true']")) {
        return;
      }
      onOpen(template);
    },
    [onOpen, template],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpen(event);
        }
      }}
      className="group h-full flex flex-col rounded-2xl border-2 border-zinc-300/90 bg-white p-4 text-left shadow-sm transition duration-250 transform-gpu hover:-translate-y-0.5 hover:scale-[1.008] hover:border-zinc-500/70 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-zinc-500">{template.source === "mine" ? "Your Template" : "Library Template"}</p>
        {template.source === "mine" && template.isActive ? (
          <Badge className="bg-lime-300 text-black hover:bg-lime-300 border-0 shadow-none px-2.5 py-1 text-xs font-semibold">
            Active
          </Badge>
        ) : null}
      </div>
      {template.source === "mine" ? (
        <div
          className="mt-1.5"
          data-no-open="true"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onFocus={() => setIsEditingName(true)}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onBlur={() => {
              void commitRename();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                void commitRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDraftName(template.name);
                setIsEditingName(false);
              }
            }}
            className={`w-full bg-transparent text-[1.6rem] leading-none font-semibold text-zinc-900 tracking-tight text-[clamp(1.2rem,1.6vw,1.7rem)] focus:outline-none ${
              isEditingName ? "rounded-sm ring-2 ring-zinc-300 px-1 py-0.5 -mx-1" : ""
            }`}
            aria-label="Template name"
          />
        </div>
      ) : (
        <h3 className="mt-1.5 text-[1.6rem] leading-none font-semibold text-zinc-900 tracking-tight text-[clamp(1.2rem,1.6vw,1.7rem)]">
          {template.name}
        </h3>
      )}

      <p className="mt-2.5 line-clamp-2 text-xs text-zinc-600">{template.description}</p>

      <div
        className="relative mt-3.5 overflow-hidden rounded-xl border-2 border-zinc-500/55 p-2.5 shadow-inner bg-zinc-50"
      >
        <div className="mx-auto max-w-[250px] rounded-lg border border-zinc-300 bg-white/95 px-2.5 py-2 shadow-sm">
          <div className="mb-2 border-b border-zinc-300/80 pb-1.5">
            <p className="text-center text-[10px] font-extrabold uppercase tracking-[0.14em] text-zinc-800">Note Preview</p>
          </div>

          <div className="mt-2 rounded-md border border-zinc-300 bg-zinc-100 p-1.5">
            <p className="text-center text-[9px] font-semibold uppercase tracking-wide text-zinc-700">Header</p>
            <div className="mt-1 space-y-0.5">
              {headerPreview.length > 0 ? (
                headerPreview.map((line, index) => (
                  <p
                    key={`${template.id}-header-${index}`}
                    className="truncate text-center text-[10px] text-zinc-700"
                  >
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-center text-[10px] text-zinc-600">Header details...</p>
              )}
            </div>
          </div>

          <div className="mt-2 rounded-md border border-slate-300 bg-slate-100 p-1.5">
            <p className="text-center text-[9px] font-semibold uppercase tracking-wide text-slate-700">Sections</p>
            <div className="mt-1.5 space-y-1">
              {fieldPreview.map((field) => (
                <div
                  key={`${template.id}-field-${field.key}`}
                  className="h-5 rounded border border-slate-300 bg-white px-2"
                >
                  <span className="block truncate text-center text-[10px] leading-5 text-slate-700">
                    {field.label}
                  </span>
                </div>
              ))}
              {extraFields > 0 && (
                <p className="text-center text-[9px] text-slate-600">+{extraFields} more sections</p>
              )}
            </div>
          </div>

          <div className="mt-2 rounded-md border border-stone-300 bg-stone-100 p-1.5">
            <p className="text-center text-[9px] font-semibold uppercase tracking-wide text-stone-700">Footer</p>
            <p className="mt-1 truncate text-center text-[10px] text-stone-700">Signature and date</p>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-3 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="gap-1 border-zinc-400/80 text-zinc-600 bg-zinc-100">
              <Layers className="h-3 w-3" />
              {template.bodySchema.fields.length} fields
            </Badge>
            {template.source === "mine" && !template.isActive && chosenTemplateId === template.id && (
              <Badge variant="outline">Selected</Badge>
            )}
          </div>

          {template.source === "library" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={(event) => {
                event.stopPropagation();
                onClone(template);
              }}
            >
              <Copy className="mr-1 h-3 w-3" /> Clone
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              {!template.isActive ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-zinc-700 hover:text-zinc-900"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSetActive?.(template);
                  }}
                >
                  Set Active
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-600 hover:text-zinc-900"
                data-no-open="true"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsEditingName(true);
                }}
                aria-label="Rename template"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-600 hover:text-red-600"
                data-no-open="true"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete?.(template);
                }}
                aria-label="Delete template"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-zinc-700 hover:text-zinc-900"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen(template);
                }}
              >
                Open <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
