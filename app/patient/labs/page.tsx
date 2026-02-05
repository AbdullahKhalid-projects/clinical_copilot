"use client";

import { Calendar, Download, Eye, FlaskConical, Stethoscope, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { labResults } from "@/lib/mockData";

export default function LabsPage() {
  const handleView = (id: string) => {
    alert(`Viewing lab result: ${id}`);
  };

  const handleDownload = (id: string) => {
    alert(`Downloading lab result: ${id}`);
  };

  const handleUpload = () => {
    alert("Upload Report feature coming soon!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Labs & Imaging</h1>
        <Button onClick={handleUpload} className="flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload Report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {labResults.map((result) => (
          <Card key={result.id}>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  {result.type === "imaging" ? (
                    <Stethoscope className="w-6 h-6 text-primary" />
                  ) : (
                    <FlaskConical className="w-6 h-6 text-primary" />
                  )}
                </div>
                <Badge
                  variant={result.status === "Normal" ? "default" : "destructive"}
                  className={
                    result.status === "Normal"
                      ? "bg-success text-success-foreground"
                      : ""
                  }
                >
                  {result.status}
                </Badge>
              </div>

              <div>
                <h3 className="font-semibold text-foreground">{result.name}</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <Calendar className="w-4 h-4" />
                  {result.date}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleView(result.id)}
                  className="flex items-center gap-1"
                >
                  <Eye className="w-4 h-4" />
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(result.id)}
                  className="flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {labResults.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <FlaskConical className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No lab results yet
            </h3>
            <p className="text-muted-foreground">
              Your lab and imaging results will appear here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
