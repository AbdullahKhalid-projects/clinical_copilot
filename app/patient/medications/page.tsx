"use client";

import { useState } from "react";
import { AlertCircle, Calendar, Check, Pill, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { medications as initialMedications } from "@/lib/mockData";

export default function MedicationsPage() {
  const [medications, setMedications] = useState(initialMedications);

  const newMedications = medications.filter((med) => med.isNew);
  const currentMedications = medications.filter((med) => !med.isNew);

  const handleAcknowledge = (id: string) => {
    setMedications(
      medications.map((med) =>
        med.id === id ? { ...med, isNew: false } : med
      )
    );
    alert("Medication acknowledged successfully!");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Medication History</h1>

      {/* New Medications Section */}
      {newMedications.length > 0 && (
        <Card className="border-l-4 border-l-warning bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg text-warning-foreground">
              <AlertCircle className="w-5 h-5 text-warning" />
              New Medications Assigned
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {newMedications.map((med) => (
              <div
                key={med.id}
                className="p-4 bg-card rounded-lg border border-border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Pill className="w-5 h-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{med.name}</h3>
                        <Badge className="bg-primary text-primary-foreground text-xs">
                          New
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {med.dosage} · {med.frequency}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Started {med.startDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {med.prescribedBy}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAcknowledge(med.id)}
                    className="flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" />
                    Acknowledge
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Current Medications Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Pill className="w-5 h-5 text-primary" />
            Current Medications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentMedications.map((med) => (
            <div
              key={med.id}
              className="p-4 border border-border rounded-lg"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Pill className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-foreground">{med.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {med.dosage} · {med.frequency}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Started {med.startDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {med.prescribedBy}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {currentMedications.length === 0 && (
            <div className="text-center py-8">
              <Pill className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No current medications</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
