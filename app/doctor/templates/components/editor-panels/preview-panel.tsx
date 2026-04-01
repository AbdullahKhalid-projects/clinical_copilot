import { PdfNotePreview } from "../pdf-note-preview";

import type { SoapTemplate } from "../../types";

type PreviewPanelProps = {
  template: SoapTemplate;
  llmObject: Record<string, unknown>;
};

export function PreviewPanel({ template, llmObject }: PreviewPanelProps) {
  return <PdfNotePreview template={template} llmObject={llmObject} />;
}
