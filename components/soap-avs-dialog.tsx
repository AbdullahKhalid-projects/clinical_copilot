"use client";

import React, { useState, useEffect } from "react";
import { Download, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface SOAPData {
  soap: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  avs: {
    diagnosis?: string;
    instructions?: string;
    medications?: string;
    followup?: string;
    warnings?: string;
  };
}

interface SoapAvsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  isLoading?: boolean;
  onExportPdf?: (sessionId: string) => Promise<void>;
}

export const SoapAvsDialog = React.forwardRef<HTMLDivElement, SoapAvsDialogProps>(
  ({ open, onOpenChange, sessionId, isLoading = false, onExportPdf }, ref) => {
    const [soapData, setSoapData] = useState<SOAPData | null>(null);
    const [loading, setLoading] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [editedSoap, setEditedSoap] = useState<SOAPData | null>(null);

    useEffect(() => {
      if (open && sessionId && !soapData) {
        fetchSoapData();
      }
    }, [open, sessionId]);

    const fetchSoapData = async () => {
      if (!sessionId) return;

      try {
        setLoading(true);
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const response = await fetch(`${baseUrl}/api/soap/${sessionId}`);
        if (!response.ok) throw new Error("Failed to fetch SOAP data");

        const data: SOAPData = await response.json();
        setSoapData(data);
        setEditedSoap(JSON.parse(JSON.stringify(data))); // Deep copy
      } catch (error) {
        console.error("Error fetching SOAP data:", error);
      } finally {
        setLoading(false);
      }
    };

    const handleExportPdf = async () => {
      if (!sessionId || !onExportPdf) return;

      try {
        setExportingPdf(true);
        await onExportPdf(sessionId);
      } catch (error) {
        console.error("Error exporting PDF:", error);
      } finally {
        setExportingPdf(false);
      }
    };

    const handleFieldChange = (
      section: "soap" | "avs",
      field: string,
      value: string
    ) => {
      setEditedSoap((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          [section]: {
            ...prev[section],
            [field]: value,
          },
        };
      });
    };

    if (!soapData && loading) {
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">
                Generating SOAP/AVS...
              </span>
            </div>
          </DialogContent>
        </Dialog>
      );
    }

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>SOAP Note & After Visit Summary</DialogTitle>
            <DialogDescription>
              Review and edit the generated clinical documentation
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="soap" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="soap">SOAP Note</TabsTrigger>
              <TabsTrigger value="avs">After Visit Summary</TabsTrigger>
            </TabsList>

            <TabsContent value="soap" className="space-y-4">
              <div className="space-y-4">
                {/* Subjective */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Subjective
                  </label>
                  <Textarea
                    value={editedSoap?.soap.subjective || ""}
                    onChange={(e) =>
                      handleFieldChange("soap", "subjective", e.target.value)
                    }
                    placeholder="Patient's chief complaint and history..."
                    className="min-h-[120px]"
                  />
                </div>

                {/* Objective */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Objective
                  </label>
                  <Textarea
                    value={editedSoap?.soap.objective || ""}
                    onChange={(e) =>
                      handleFieldChange("soap", "objective", e.target.value)
                    }
                    placeholder="Physical examination, vitals, lab results..."
                    className="min-h-[120px]"
                  />
                </div>

                {/* Assessment */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Assessment
                  </label>
                  <Textarea
                    value={editedSoap?.soap.assessment || ""}
                    onChange={(e) =>
                      handleFieldChange("soap", "assessment", e.target.value)
                    }
                    placeholder="Clinical impressions and diagnoses..."
                    className="min-h-[120px]"
                  />
                </div>

                {/* Plan */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Plan
                  </label>
                  <Textarea
                    value={editedSoap?.soap.plan || ""}
                    onChange={(e) =>
                      handleFieldChange("soap", "plan", e.target.value)
                    }
                    placeholder="Treatment plan and follow-up..."
                    className="min-h-[120px]"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="avs" className="space-y-4">
              <div className="space-y-4">
                {/* Diagnosis */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Diagnosis
                  </label>
                  <Textarea
                    value={editedSoap?.avs.diagnosis || ""}
                    onChange={(e) =>
                      handleFieldChange("avs", "diagnosis", e.target.value)
                    }
                    placeholder="Primary and secondary diagnoses..."
                    className="min-h-[100px]"
                  />
                </div>

                {/* Instructions */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Instructions
                  </label>
                  <Textarea
                    value={editedSoap?.avs.instructions || ""}
                    onChange={(e) =>
                      handleFieldChange("avs", "instructions", e.target.value)
                    }
                    placeholder="Patient instructions and care guidelines..."
                    className="min-h-[100px]"
                  />
                </div>

                {/* Medications */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Medications
                  </label>
                  <Textarea
                    value={editedSoap?.avs.medications || ""}
                    onChange={(e) =>
                      handleFieldChange("avs", "medications", e.target.value)
                    }
                    placeholder="Prescribed medications..."
                    className="min-h-[100px]"
                  />
                </div>

                {/* Follow-Up */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Follow-Up
                  </label>
                  <Textarea
                    value={editedSoap?.avs.followup || ""}
                    onChange={(e) =>
                      handleFieldChange("avs", "followup", e.target.value)
                    }
                    placeholder="Follow-up appointments and schedule..."
                    className="min-h-[100px]"
                  />
                </div>

                {/* Warnings */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    Warnings & Precautions
                  </label>
                  <Textarea
                    value={editedSoap?.avs.warnings || ""}
                    onChange={(e) =>
                      handleFieldChange("avs", "warnings", e.target.value)
                    }
                    placeholder="Important warnings and precautions..."
                    className="min-h-[100px]"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={handleExportPdf}
              disabled={exportingPdf || !sessionId}
              className="flex items-center gap-2"
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
);

SoapAvsDialog.displayName = "SoapAvsDialog";
