import { format } from "date-fns";
import { AlertCircle, Calendar, Download, FileText, ShieldCheck, User } from "lucide-react";

import { getPatientVisitSummaries } from "@/app/actions/fetchers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function VisitSummariesPage() {
  const summaries = await getPatientVisitSummaries();

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
                    Finalized Notes
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                  Download notes finalized by your care team after each completed visit.
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <FileText className="h-3.5 w-3.5" />
              <span>{summaries.length} Summaries</span>
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
              <Download className="h-3.5 w-3.5" />
              <span>Secure PDF Download</span>
            </Badge>
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 sm:px-5 pt-6 pb-8">
        {summaries.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <h2 className="text-lg font-semibold text-foreground">No finalized visit summaries yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Visit summaries will appear here after a completed appointment with a finalized note.
              </p>
            </CardContent>
          </Card>
        ) : (
          summaries.map((summary) => (
            <Card key={summary.id} className="gap-0">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-semibold">
                      Visit Summary - {format(new Date(summary.appointmentDate), "MMMM d, yyyy")}
                    </CardTitle>
                    <CardDescription>{summary.reason}</CardDescription>
                  </div>

                  <Button asChild size="sm" className="w-full sm:w-auto">
                    <a
                      href={summary.downloadUrl}
                      target={summary.downloadUrl.startsWith("http") ? "_blank" : undefined}
                      rel={summary.downloadUrl.startsWith("http") ? "noreferrer" : undefined}
                    >
                      <Download className="h-4 w-4" />
                      Download Note
                    </a>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="gap-1.5 bg-muted/60 border-border">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(summary.appointmentDate), "MMM d, yyyy")}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 bg-muted/60 border-border">
                    <User className="h-3.5 w-3.5" />
                    {summary.doctorName}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 bg-muted/60 border-border">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Finalized {format(new Date(summary.finalizedAt ?? summary.appointmentDate), "MMM d, yyyy")}
                  </Badge>
                </div>

                <Separator />

                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm leading-6 text-muted-foreground">{summary.noteExcerpt}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Download Access</AlertTitle>
          <AlertDescription>
            Only notes linked to your account can be downloaded from this page.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
