import { getNotesAndReminders } from "@/app/actions/fetchers";
import { NotesClient } from "@/components/notes-client";

export default async function NotesPage() {
  const { notes, reminders } = await getNotesAndReminders();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">My Notes</h1>
      <NotesClient initialNotes={notes} initialReminders={reminders} />
    </div>
  );
}
