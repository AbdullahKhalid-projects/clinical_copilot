"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Activity,
  Zap,
  Volume2,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  patients,
  aiAlerts,
  drugInteractions,
  patientAllergies,
  patientTimeline,
  medications,
  type Patient,
} from "@/lib/mockData";
import { Suspense } from "react";
import { useClinicalWebSocket } from "@/hooks/use-clinical-websocket";
import { SoapAvsDialog } from "@/components/soap-avs-dialog";

function ClinicalSessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdFromUrl = searchParams.get("patientId");

  // UI State
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [diarizationActive, setDiarizationActive] = useState(false);
  const [activeTab, setActiveTab] = useState("facts");
  
  const diarizationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket & Backend State
  const {
    connect,
    disconnect,
    connected,
    sessionId,
    transcript,
    draftTranscript,
    facts,
    speakerRoles,
    sendAudioChunk,
    stopSession,
  } = useClinicalWebSocket("http://localhost:8000");

  // Audio Recording State
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const factsEndRef = useRef<HTMLDivElement>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);

  // Dialog State
  const [showSoapDialog, setShowSoapDialog] = useState(false);
  const [isGeneratingSoap, setIsGeneratingSoap] = useState(false);

  // Diarization effect - show every 30 seconds
  useEffect(() => {
    if (isRecording && !isPaused) {
      diarizationTimerRef.current = setInterval(() => {
        setDiarizationActive(true);
        setTimeout(() => setDiarizationActive(false), 3000);
      }, 30000);
    }
    return () => {
      if (diarizationTimerRef.current) clearInterval(diarizationTimerRef.current);
    };
  }, [isRecording, isPaused]);

  // Update recording state refs for audio processor
  useEffect(() => {
    isRecordingRef.current = isRecording;
    isPausedRef.current = isPaused;
  }, [isRecording, isPaused]);

  // Initialize patient from URL
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

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Auto-scroll to latest transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, draftTranscript]);

  // Auto-scroll to latest facts
  useEffect(() => {
    if (factsEndRef.current) {
      factsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [facts]);

  // Initialize audio recording
  const initializeAudio = useCallback(async () => {
    try {
      console.log("🎤 Getting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true } });
      streamRef.current = stream;
      console.log("✅ Microphone access granted");
      console.log("📊 Stream active tracks:", stream.getAudioTracks().length);

      console.log("🔊 Creating audio context and processor...");
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      console.log("🎵 Audio Context State:", audioContext.state);
      console.log("🎵 Sample Rate:", audioContext.sampleRate);
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      let audioChunkCount = 0;
      let totalBytesSent = 0;

      processor.onaudioprocess = (event) => {
        // Only send audio if actually recording and not paused
        if (!isRecordingRef.current || isPausedRef.current) {
          return;
        }

        const inputData = event.inputBuffer.getChannelData(0);
        
        // Calculate RMS to detect if audio is actually coming in
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        audioChunkCount++;
        totalBytesSent += pcmData.byteLength;

        // Log every 50 chunks (about every 1-2 seconds)
        if (audioChunkCount % 50 === 0) {
          console.log(
            `🔊 Audio Chunk #${audioChunkCount} | RMS: ${rms.toFixed(4)} | Bytes: ${pcmData.byteLength} | Total: ${(totalBytesSent / 1024).toFixed(1)}KB`
          );
        }

        console.log(
          `📤 Sending chunk #${audioChunkCount}: ${pcmData.byteLength} bytes (RMS: ${rms.toFixed(4)})`
        );
        sendAudioChunk(pcmData.buffer as any);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      processorRef.current = processor;
      console.log("✅ Audio processor ready - listening for audio input");
      
      // Log stream info
      stream.getAudioTracks().forEach((track) => {
        console.log("🎤 Audio Track:", {
          kind: track.kind,
          enabled: track.enabled,
          state: track.readyState,
          settings: track.getSettings ? track.getSettings() : "N/A"
        });
      });
    } catch (error) {
      console.error("❌ Error initializing audio:", error);
      alert("Microphone access denied or not available");
      throw error;
    }
  }, [sendAudioChunk]);

  // Start recording
  const handleStartRecording = useCallback(async () => {
    try {
      // Step 1: Ensure WebSocket is connected
      if (!connected) {
        console.log("🔗 Connecting to backend...");
        await connect(); // This now properly waits for connection
        console.log("✅ Backend connected");
      }

      // Step 2: Initialize audio capture
      console.log("🎤 Initializing audio...");
      await initializeAudio();
      console.log("✅ Audio initialized");

      // Step 3: Start recording and begin sending audio
      console.log("🔴 Starting recording and sending audio...");
      setIsRecording(true);
      setIsPaused(false);
      setSeconds(0);
    } catch (error) {
      console.error("❌ Error starting recording:", error);
      alert(`Failed to start recording: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [connected, connect, initializeAudio]);

  // Pause/Resume recording
  const handlePauseRecording = useCallback(() => {
    setIsPaused(!isPaused);
    if (audioContextRef.current) {
      if (isPaused) {
        audioContextRef.current.resume();
      } else {
        audioContextRef.current.suspend();
      }
    }
  }, [isPaused]);

  // Stop recording
  const handleStopRecording = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);

    if (diarizationTimerRef.current) {
      clearInterval(diarizationTimerRef.current);
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.error("Error closing audio context:", e);
      }
      audioContextRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    stopSession();
  }, [stopSession]);

  // Handle patient selection
  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowPatientModal(false);
    setSessionStarted(true);
  };

  // Generate SOAP/AVS
  const handleGenerateSoap = useCallback(async () => {
    setIsGeneratingSoap(true);
    setShowSoapDialog(true);
  }, []);

  // Export PDF
  const handleExportPdf = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/pdf/${sessionId}`);
      if (!response.ok) throw new Error("Failed to generate PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clinical_note_${sessionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error exporting PDF:", error);
      alert("Failed to export PDF");
    }
  }, []);

  // Finalize and end session
  const handleFinalizeSession = useCallback(() => {
    if (isRecording) {
      handleStopRecording();
    }
    disconnect();
    alert("Session finalized and signed! Redirecting to dashboard...");
    router.push("/doctor/dashboard");
  }, [isRecording, handleStopRecording, disconnect, router]);

  // Connect on mount
  useEffect(() => {
    if (sessionStarted && !connected && !isRecording) {
      connect();
    }

    return () => {
      if (isRecording) {
        handleStopRecording();
      }
    };
  }, [sessionStarted, connected, isRecording, connect, handleStopRecording]);

  const formatTime = useCallback((totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // Audio visualizer bars
  const audioBars = Array.from({ length: 30 }, () => Math.random() * 100);

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
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-4 sm:px-5 py-3 border-b border-border bg-background/95 backdrop-blur flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {selectedPatient && (
              <>
                <Avatar className="h-10 w-10 border flex-shrink-0">
                  <AvatarFallback>{selectedPatient.initials}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                      {selectedPatient.name}
                    </h1>
                    <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">
                      Patient
                    </Badge>
                  </div>
                  <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                    {connected ? (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Connected | Session: {sessionId?.slice(-8)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        Connecting...
                      </span>
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end flex-shrink-0">
            {diarizationActive && (
              <Badge className="bg-amber-500 text-white animate-pulse">
                <Zap className="w-3 h-3 mr-1" />
                Diarizing (30s)
              </Badge>
            )}
            <Button
              onClick={handleGenerateSoap}
              disabled={!sessionId || transcript.length === 0}
              className="flex items-center gap-2 text-xs sm:text-sm"
              variant="outline"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Generate SOAP/AVS</span>
              <span className="sm:hidden">SOAP</span>
            </Button>
            <Button
              onClick={handleFinalizeSession}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-xs sm:text-sm"
            >
              <Check className="w-4 h-4" />
              <span className="hidden sm:inline">Finalize</span>
              <span className="sm:hidden">Done</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content - 3 Columns */}
      <div className="flex-1 overflow-hidden">
        <div className="grid grid-cols-12 gap-0 h-full">
          {/* Left Column - Recording Controls (2/12) */}
          <div className="col-span-2 border-r border-border overflow-hidden flex flex-col bg-muted/20">
            <div className="flex-1 overflow-y-auto p-3">
              {/* Timer */}
              <div className="text-center mb-4">
                <p className="text-3xl sm:text-4xl font-mono font-bold text-primary">
                  {formatTime(seconds)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isRecording
                    ? isPaused
                      ? "🔴 Paused"
                      : "🟢 Recording"
                    : "⚪ Ready"}
                </p>
              </div>

              {/* Audio Visualizer */}
              <div className="h-20 flex flex-col items-center justify-center gap-1 bg-background rounded-lg p-2 mb-4">
                <div className="flex items-end justify-center gap-0.5 h-full">
                  {audioBars.slice(0, 15).map((height, index) => (
                    <div
                      key={index}
                      className={`w-0.5 rounded-full transition-all duration-150 ${
                        isRecording && !isPaused
                          ? "bg-primary"
                          : "bg-muted-foreground/30"
                      }`}
                      style={{
                        height: isRecording && !isPaused
                          ? `${Math.max(15, height * 0.6)}%`
                          : "15%",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-col gap-2 mb-4">
                {!isRecording ? (
                  <Button
                    onClick={handleStartRecording}
                    disabled={!connected}
                    className="w-full text-xs sm:text-sm"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Start
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={handlePauseRecording}
                      className="w-full text-xs sm:text-sm"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-3 h-3 mr-1" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="w-3 h-3 mr-1" />
                          Pause
                        </>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleStopRecording}
                      className="w-full text-xs sm:text-sm"
                    >
                      <Square className="w-3 h-3 mr-1" />
                      Stop
                    </Button>
                  </>
                )}
              </div>

              {/* Connection Status */}
              <div className={`flex items-center gap-2 p-2 rounded text-xs border ${
                connected
                  ? 'bg-green-500/10 border-green-500/20 text-green-700'
                  : 'bg-red-500/10 border-red-500/20 text-red-700'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="truncate">
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          {/* Middle Column - Transcription (5/12) */}
          <div className="col-span-5 border-r border-border overflow-hidden flex flex-col">
            <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-muted/50">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Live Transcription
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {transcript.length === 0 && !draftTranscript && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <p>Start recording to see transcription...</p>
                </div>
              )}

              {/* Finalized segments */}
              {transcript.map((segment, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-card p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-xs font-semibold"
                    >
                      {segment.role || segment.speaker}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">
                      {segment.start?.toFixed(1)}s - {segment.end?.toFixed(1)}s
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    {segment.text}
                  </p>
                </div>
              ))}

              {/* Draft segment (processing) */}
              {draftTranscript && (
                <div className="rounded-lg border-2 border-dashed border-amber-500 bg-amber-500/10 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-xs font-semibold bg-amber-600 text-white"
                    >
                      Processing...
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground italic">
                    {draftTranscript}
                  </p>
                </div>
              )}

              <div ref={transcriptEndRef} />
            </div>
          </div>

          {/* Right Column - Sidebar with Tabs (5/12) */}
          <div className="col-span-5 overflow-hidden flex flex-col">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="h-full flex flex-col"
            >
              <TabsList className="w-full justify-start rounded-none border-b border-border bg-muted/50 p-0">
                <TabsTrigger
                  value="facts"
                  className="rounded-none text-xs sm:text-sm"
                >
                  <FileText className="w-3 h-3 mr-2" />
                  <span className="hidden sm:inline">Facts</span>
                </TabsTrigger>
                <TabsTrigger
                  value="timeline"
                  className="rounded-none text-xs sm:text-sm"
                >
                  <Clock className="w-3 h-3 mr-2" />
                  <span className="hidden sm:inline">Timeline</span>
                </TabsTrigger>
                <TabsTrigger
                  value="alerts"
                  className="rounded-none text-xs sm:text-sm"
                >
                  <AlertTriangle className="w-3 h-3 mr-2" />
                  <span className="hidden sm:inline">Alerts</span>
                  <Badge className="ml-1 bg-red-500 text-xs">{aiAlerts.length}</Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="medications"
                  className="rounded-none text-xs sm:text-sm"
                >
                  <Pill className="w-3 h-3 mr-2" />
                  <span className="hidden sm:inline">Meds</span>
                </TabsTrigger>
              </TabsList>

              {/* Facts Tab */}
              <TabsContent
                value="facts"
                className="flex-1 overflow-y-auto p-4 space-y-3 mt-0"
              >
                {Object.entries(facts).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <p>Clinical facts will appear here...</p>
                  </div>
                ) : (
                  Object.entries(facts).map(([key, value]) => {
                    if (!value || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && Object.keys(value).length === 0)) {
                      return null;
                    }
                    return (
                      <div key={key} className="bg-card rounded-lg border border-border p-3 space-y-2">
                        <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                          {key.replace(/_/g, " ")}
                        </p>
                        {Array.isArray(value) ? (
                          <ul className="text-sm space-y-1 ml-2 text-foreground">
                            {value.map((item: any, idx: number) => (
                              <li key={idx} className="list-disc">
                                {typeof item === "string" ? item : JSON.stringify(item)}
                              </li>
                            ))}
                          </ul>
                        ) : typeof value === 'object' ? (
                          <ul className="text-sm space-y-1 ml-2 text-foreground">
                            {Object.entries(value as Record<string, any>).map(([k, v]) => (
                              <li key={k} className="list-disc">
                                <strong>{k}:</strong> {String(v)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-foreground">{String(value)}</p>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={factsEndRef} />
              </TabsContent>

              {/* Timeline Tab */}
              <TabsContent
                value="timeline"
                className="flex-1 overflow-y-auto p-4 space-y-2 mt-0"
              >
                {patientTimeline.map((event, idx) => (
                  <div key={idx} className="bg-card rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{event.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{event.date}</p>
                        {event.subtitle && (
                          <p className="text-xs text-foreground mt-1">{event.subtitle}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* Alerts Tab */}
              <TabsContent
                value="alerts"
                className="flex-1 overflow-y-auto p-4 space-y-2 mt-0"
              >
                {aiAlerts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <p>No alerts</p>
                  </div>
                ) : (
                  aiAlerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg border p-3 text-sm ${
                        alert.type === "danger"
                          ? "bg-red-500/10 border-red-500/30"
                          : alert.type === "warning"
                          ? "bg-amber-500/10 border-amber-500/30"
                          : "bg-blue-500/10 border-blue-500/30"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {alert.type === "danger" ? (
                          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        ) : alert.type === "warning" ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{alert.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {alert.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* Medications Tab */}
              <TabsContent
                value="medications"
                className="flex-1 overflow-y-auto p-4 space-y-2 mt-0"
              >
                {medications && medications.length > 0 ? (
                  medications.map((med: any, idx: number) => (
                    <div key={idx} className="bg-card rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <Pill className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{med.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {med.dosage} • {med.frequency}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Since: {med.startDate}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <p>No medications</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
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

      {/* SOAP/AVS Dialog */}
      <SoapAvsDialog
        open={showSoapDialog}
        onOpenChange={setShowSoapDialog}
        sessionId={sessionId}
        isLoading={isGeneratingSoap}
        onExportPdf={handleExportPdf}
      />
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
