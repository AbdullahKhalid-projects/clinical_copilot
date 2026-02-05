"use client";

import { Calendar, Download, Eye, FileText, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { visitSummaries } from "@/lib/mockData";

export default function VisitSummariesPage() {
  const handleView = (id: string) => {
    alert(`Viewing visit summary: ${id}`);
  };

  const handleDownload = (id: string) => {
    alert(`Downloading visit summary: ${id}`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">After Visit Summaries</h1>

      <div className="space-y-4">
        {visitSummaries.map((visit) => (
          <Card key={visit.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-foreground">{visit.title}</h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {visit.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {visit.doctorName}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{visit.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleView(visit.id)}
                    className="flex items-center gap-1"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(visit.id)}
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

      {visitSummaries.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No visit summaries yet
            </h3>
            <p className="text-muted-foreground">
              Your visit summaries will appear here after your appointments.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
