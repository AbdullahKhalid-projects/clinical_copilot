"use client";

import * as React from "react";
import { PDFViewer } from "@react-pdf/renderer";

import { NoteDocument } from "@/lib/note-document-pdf";
import type { SoapTemplate } from "../types";

type PdfNotePreviewProps = {
  template: SoapTemplate;
  llmObject: Record<string, unknown>;
};

export function PdfNotePreview({ template, llmObject }: PdfNotePreviewProps) {
  return (
    <div className="h-[82vh] w-full overflow-hidden rounded-md border bg-white">
      <div className="h-full w-full">
        <PDFViewer width="100%" height="100%" showToolbar>
          <NoteDocument template={template} llmObject={llmObject} />
        </PDFViewer>
      </div>
    </div>
  );
}
