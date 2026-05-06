"use client";

import { Calendar, Clock, Download, Eye, MessageSquare, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { transcripts } from "@/lib/mockData";

export default function TranscriptsPage() {
  const handleView = (id: string) => {
    alert(`Viewing transcript: ${id}`);
  };

  const handleDownload = (id: string) => {
    alert(`Downloading transcript: ${id}`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Past Session Transcripts</h1>

      <div className="space-y-4">
        {transcripts.map((transcript) => (
          <Card key={transcript.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-foreground">{transcript.title}</h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {transcript.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {transcript.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {transcript.doctorName}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleView(transcript.id)}
                    className="flex items-center gap-1"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(transcript.id)}
                    className="flex items-center gap-1"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {transcripts.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No transcripts yet
            </h3>
            <p className="text-muted-foreground">
              Your session transcripts will appear here after your clinical sessions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
