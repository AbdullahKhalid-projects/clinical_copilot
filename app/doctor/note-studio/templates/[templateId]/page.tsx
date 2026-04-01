import { NoteStudioClient } from "../../../templates/note-studio-client";

type DoctorNoteStudioTemplatePageProps = {
  params: Promise<{ templateId: string }>;
};

export default async function DoctorNoteStudioTemplatePage({ params }: DoctorNoteStudioTemplatePageProps) {
  const { templateId } = await params;

  return <NoteStudioClient initialViewMode="editor" initialTemplateId={templateId} />;
}
