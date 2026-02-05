"use client";

import { useState } from "react";
import {
  Calendar,
  FileText,
  Mic,
  MicOff,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { patientNotes, reminders as initialReminders } from "@/lib/mockData";

export default function NotesPage() {
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [newReminder, setNewReminder] = useState("");
  const [remindersList, setRemindersList] = useState(initialReminders);
  const [notes, setNotes] = useState(patientNotes);

  const handleSaveNote = () => {
    if (noteTitle.trim() || noteContent.trim()) {
      const newNote = {
        id: `note-${Date.now()}`,
        title: noteTitle || "Untitled Note",
        content: noteContent,
        tags: [],
        date: new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      };
      setNotes([newNote, ...notes]);
      setNoteTitle("");
      setNoteContent("");
      alert("Note saved successfully!");
    }
  };

  const handleDeleteNote = (id: string) => {
    setNotes(notes.filter((note) => note.id !== id));
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      alert("Voice recording started (simulated)");
    } else {
      alert("Voice recording stopped (simulated)");
    }
  };

  const addReminder = () => {
    if (newReminder.trim()) {
      setRemindersList([
        ...remindersList,
        { id: `r-${Date.now()}`, text: newReminder },
      ]);
      setNewReminder("");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">My Notes</h1>

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
              <Input
                placeholder="Note title..."
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
              />
              <Textarea
                placeholder="Write your thoughts, questions for your doctor, or anything you want to remember..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={6}
              />
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
                <Button onClick={handleSaveNote} className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Save Note
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Saved Notes */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Saved Notes</h2>
            {notes.map((note) => (
              <Card key={note.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <h3 className="font-semibold text-foreground">{note.title}</h3>
                      <p className="text-sm text-muted-foreground">{note.content}</p>
                      {note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {note.tags.map((tag, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {note.date}
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
            ))}
          </div>
        </div>

        {/* Right Sidebar - Things to Discuss */}
        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Things to Discuss</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a reminder..."
                  value={newReminder}
                  onChange={(e) => setNewReminder(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addReminder()}
                />
                <Button size="icon" onClick={addReminder}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Add reminders for your next doctor visit
              </p>
              {remindersList.length > 0 && (
                <ul className="space-y-2">
                  {remindersList.map((reminder) => (
                    <li
                      key={reminder.id}
                      className="text-sm text-foreground p-2 bg-muted rounded-md"
                    >
                      {reminder.text}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
