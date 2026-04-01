"use client";

import { Calendar, Download, Eye, FileText, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { visitSummaries } from "@/lib/mockData";

export default function VisitSummariesPage() {
  const handleView = (id: string) => {
    alert(`Viewing visit summary: ${id}`);
  };

  const handleDownload = (id: string) => {
    alert(`Downloading visit summary: ${id}`);
  };

  return (
    <div className="h-full flex-1 flex-col space-y-0 md:flex">
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-md border-2 border-black bg-yellow-300 flex items-center justify-center">
                <FileText className="h-5 w-5 text-black stroke-2" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                    After Visit Summaries
                  </h1>
                  <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">
                    After Visit
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                  Review and download summaries from your recent appointments
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <FileText className="h-3.5 w-3.5" />
              <span>{visitSummaries.length} Summaries</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <Eye className="h-3.5 w-3.5" />
              <span>View Details</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <Download className="h-3.5 w-3.5" />
              <span>Download PDF</span>
            </Badge>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 sm:px-5 pt-6 pb-8">
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
    </div>
  );
}
