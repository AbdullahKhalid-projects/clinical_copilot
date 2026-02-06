"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Calendar,
  FileText,
  Mic,
  MicOff,
  Plus,
  Save,
  Trash2,
  CheckCircle,
  Circle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { createNote, deleteNote, createReminder, toggleReminder, deleteReminder } from "@/app/actions/patientActions";
import { useRouter } from "next/navigation";
import { PatientNote, PatientReminder } from "@prisma/client";

interface NotesClientProps {
  initialNotes: PatientNote[];
  initialReminders: PatientReminder[];
}

export function NotesClient({ initialNotes, initialReminders }: NotesClientProps) {
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isAddingReminder, setIsAddingReminder] = useState(false);
  
  const { toast } = useToast();
  const router = useRouter();

  const handleSaveNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both a title and content for your note.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingNote(true);
    const formData = new FormData();
    formData.append("title", noteTitle);
    formData.append("content", noteContent);
    formData.append("category", "General"); // Will be saved as tags

    const result = await createNote(formData);
    setIsSavingNote(false);

    if (result.success) {
      setNoteTitle("");
      setNoteContent("");
      toast({
        title: "Note Saved",
        description: "Your note has been saved successfully.",
      });
      router.refresh(); 
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to save note.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteNote = async (id: string) => {
    const result = await deleteNote(id);
    if (result.success) {
      toast({
        title: "Note Deleted",
        description: "Your note has been removed.",
      });
      router.refresh();
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to delete note.",
        variant: "destructive",
      });
    }
  };

  const handleAddReminder = async () => {
    if (!reminderTitle.trim()) return;

    setIsAddingReminder(true);
    const formData = new FormData();
    formData.append("title", reminderTitle);
    formData.append("date", new Date().toISOString()); 
    formData.append("isRecurring", "false");

    const result = await createReminder(formData);
    setIsAddingReminder(false);

    if (result.success) {
      setReminderTitle("");
      toast({
        title: "Reminder Added",
        description: "Added to your list.",
      });
      router.refresh();
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to add reminder.",
        variant: "destructive",
      });
    }
  };

  const handleToggleReminder = async (id: string, isCompleted: boolean) => {
    await toggleReminder(id, isCompleted);
    router.refresh();
  };

  const handleDeleteReminder = async (id: string) => {
    await deleteReminder(id);
    router.refresh();
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      toast({ title: "Started Recording", description: "(Simulation) Recording audio..." });
    } else {
      toast({ title: "Stopped Recording", description: "(Simulation) transcribing..." });
      // Simulate transcription
      setTimeout(() => {
        setNoteContent((prev) => prev + " (Transcribed text would appear here.)");
      }, 500);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Notes Area */}
      <div className="lg:col-span-2 space-y-6">
        {/* New Note Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5 text-primary" />
              New Note
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                    id="title"
                    placeholder="Note title..."
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                    id="content"
                    placeholder="Write your thoughts, questions for your doctor, or anything you want to remember..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    rows={6}
                />
            </div>
            
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={toggleRecording}
                className={`flex items-center gap-2 ${
                  isRecording
                    ? "border-destructive text-destructive"
                    : ""
                }`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    Voice Record
                  </>
                )}
              </Button>
              <Button onClick={handleSaveNote} disabled={isSavingNote} className="flex items-center gap-2">
                <Save className="w-4 h-4" />
                {isSavingNote ? "Saving..." : "Save Note"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Saved Notes */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Saved Notes</h2>
          {initialNotes.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground bg-muted/20 rounded-lg">
                No notes yet. Create one above!
            </div>
          ) : (
            initialNotes.map((note) => (
                <Card key={note.id}>
                <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground">{note.title}</h3>
                            {note.tags && <Badge variant="outline" className="text-xs">{note.tags}</Badge>}
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                         {/* Safe date formatting */}
                         {note.date ? format(new Date(note.date), "MMMM d, yyyy") : "No Date"}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteNote(note.id)}
                        className="text-muted-foreground hover:text-destructive"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                    </div>
                </CardContent>
                </Card>
            ))
          )}
        </div>
      </div>

      {/* Right Sidebar - Reminders */}
      <div>
        <Card className="sticky top-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Things to Discuss</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add a reminder/topic..."
                value={reminderTitle}
                onChange={(e) => setReminderTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddReminder()}
              />
              <Button size="icon" onClick={handleAddReminder} disabled={isAddingReminder}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Add reminders for your next doctor visit
            </p>
            
            <div className="space-y-2">
                {initialReminders.length === 0 && (
                    <p className="text-sm text-center text-muted-foreground py-4">No reminders yet</p>
                )}
                {initialReminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className={`flex items-center justify-between p-2 rounded-md ${
                        reminder.isCompleted ? "bg-muted/50" : "bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0 rounded-full"
                            onClick={() => handleToggleReminder(reminder.id, reminder.isCompleted)}
                        >
                            {reminder.isCompleted ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                                <Circle className="w-4 h-4 text-muted-foreground" />
                            )}
                        </Button>
                        <span className={`text-sm truncate ${reminder.isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {reminder.text}
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteReminder(reminder.id)}
                    >
                        <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
