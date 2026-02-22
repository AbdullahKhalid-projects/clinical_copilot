"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock,
  FlaskConical,
  Info,
  Mic,
  Pause,
  Pill,
  Play,
  Square,
  FileText,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  patients,
  aiAlerts,
  drugInteractions,
  patientAllergies,
  patientTimeline,
  type Patient,
} from "@/lib/mockData";
import { Suspense } from "react";

function ClinicalSessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdFromUrl = searchParams.get("patientId");

  const [showPatientModal, setShowPatientModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);

  useEffect(() => {
    if (patientIdFromUrl) {
      const patient = patients.find((p) => p.id === patientIdFromUrl);
      if (patient) {
        setSelectedPatient(patient);
        setSessionStarted(true);
      }
    } else {
      setShowPatientModal(true);
    }
  }, [patientIdFromUrl]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  const formatTime = useCallback((totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowPatientModal(false);
    setSessionStarted(true);
  };

  const handleStartRecording = () => {
    setIsRecording(true);
    setIsPaused(false);
  };

  const handlePauseRecording = () => {
    setIsPaused(!isPaused);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
  };

  const handleFinalize = () => {
    alert("Session finalized and signed! Redirecting to dashboard...");
    router.push("/doctor/dashboard");
  };

  // Audio visualizer bars (simulated)
  const audioBars = Array.from({ length: 30 }, () =>
    Math.random() * 100
  );

  if (!sessionStarted && !showPatientModal) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Play className="w-12 h-12 mx-auto text-primary mb-4" />
            <h2 className="text-xl font-semibold mb-2">Start Clinical Session</h2>
            <p className="text-muted-foreground mb-6">
              Select a patient to begin the clinical session
            </p>
            <Button onClick={() => setShowPatientModal(true)}>
              Select Patient
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10 -mx-6 -mt-6 mb-6">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {selectedPatient && (
                <>
                  <Avatar className="h-10 w-10 border">
                    <AvatarImage src={selectedPatient.imageUrl} alt={selectedPatient.name} />
                    <AvatarFallback>{selectedPatient.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                        {selectedPatient.name}
                      </h1>
                      <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">Patient</Badge>
                    </div>
                    <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                      Clinical Session
                    </span>
                  </div>
                </>
              )}
            </div>
            <Button
              onClick={handleFinalize}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90"
            >
              <Check className="w-4 h-4" />
              Finalize and Sign
            </Button>
          </div>
        </div>
      </header>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
        {/* Column 1 - Recorder */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mic className="w-5 h-5 text-primary" />
              Recording
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Timer */}
            <div className="text-center">
              <p className="text-5xl font-mono font-bold text-primary">
                {formatTime(seconds)}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {isRecording
                  ? isPaused
                    ? "Recording paused"
                    : "Recording in progress"
                  : "Ready to record"}
              </p>
            </div>

            {/* Audio Visualizer */}
            <div className="h-16 flex items-center justify-center gap-0.5 bg-muted rounded-lg p-4">
              {audioBars.map((height, index) => (
                <div
                  key={index}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isRecording && !isPaused
                      ? "bg-primary"
                      : "bg-muted-foreground/30"
                  }`}
                  style={{
                    height: isRecording && !isPaused
                      ? `${Math.max(20, height * 0.6)}%`
                      : "20%",
                  }}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3">
              {!isRecording ? (
                <Button
                  onClick={handleStartRecording}
                  className="flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Record
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handlePauseRecording}
                    className="flex items-center gap-2 bg-transparent"
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-4 h-4" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4" />
                        Pause
                      </>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleStopRecording}
                    className="flex items-center gap-2"
                  >
                    <Square className="w-4 h-4" />
                    Finish
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Column 2 - Live Insights */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Info className="w-5 h-5 text-primary" />
              Live Clinical Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* AI Alerts */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                AI Alerts
              </div>
              <div className="space-y-2">
                {aiAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg text-sm ${
                      alert.type === "warning"
                        ? "bg-warning/10 text-warning-foreground border border-warning/20"
                        : alert.type === "danger"
                        ? "bg-destructive/10 text-destructive border border-destructive/20"
                        : "bg-primary/10 text-primary border border-primary/20"
                    }`}
                  >
                    {alert.message}
                  </div>
                ))}
              </div>
            </div>

            {/* Drug Interactions */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <Pill className="w-4 h-4 text-primary" />
                Drug Interactions
              </div>
              <div className="space-y-2">
                {drugInteractions.map((interaction) => (
                  <div
                    key={interaction.id}
                    className="p-3 rounded-lg bg-warning/10 border border-warning/20"
                  >
                    <p className="text-sm font-medium text-warning">
                      {interaction.severity} Interaction
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {interaction.drugs}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Allergies */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                Allergies
              </div>
              <div className="flex flex-wrap gap-2">
                {patientAllergies.map((allergy, index) => (
                  <Badge
                    key={index}
                    variant="destructive"
                    className="text-xs"
                  >
                    {allergy}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Column 3 - Patient Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-5 h-5 text-primary" />
              Patient Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {patientTimeline.map((event, index) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        event.type === "lab"
                          ? "bg-primary/10"
                          : event.type === "medication"
                          ? "bg-success/10"
                          : "bg-muted"
                      }`}
                    >
                      {event.type === "lab" && (
                        <FlaskConical className="w-4 h-4 text-primary" />
                      )}
                      {event.type === "medication" && (
                        <Pill className="w-4 h-4 text-success" />
                      )}
                      {event.type === "visit" && (
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      )}
                      {event.type === "imaging" && (
                        <FlaskConical className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    {index < patientTimeline.length - 1 && (
                      <div className="w-px h-full bg-border flex-1 mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-foreground text-sm">
                        {event.title}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {event.date}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {event.subtitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Patient Selection Modal */}
      <Dialog open={showPatientModal} onOpenChange={setShowPatientModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4 max-h-80 overflow-y-auto">
            {patients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => handleSelectPatient(patient)}
                className="w-full p-3 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-3 text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium">
                  {patient.initials}
                </div>
                <div>
                  <p className="font-medium text-foreground">{patient.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Age: {patient.age} | {patient.conditions.join(", ") || "No conditions"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ClinicalSessionPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]">Loading...</div>}>
      <ClinicalSessionContent />
    </Suspense>
  );
}
