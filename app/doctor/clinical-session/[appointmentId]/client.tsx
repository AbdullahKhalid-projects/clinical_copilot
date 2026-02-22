"use client";

import * as React from "react";
import { format } from "date-fns";
import { 
  ChevronDown, 
  Mic, 
  MoreHorizontal, 
  PenLine, 
  Undo, 
  Redo, 
  Trash2, 
  History,
  Mic2,
  Calendar,
  Pause,
  StopCircle,
  Play,
  FileText,
  Stethoscope,
  MessageSquare,
    Loader2,
    Clock3,
    CheckCircle2,
    Link2,
    Upload,
    AudioLines,
    SlidersHorizontal,
    Info
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUploadThing } from "@/lib/uploadthing";
import { useToast } from "@/hooks/use-toast";
import { AudioRecorderWithVisualizer } from "@/components/audio-recorder-visualizer";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

// Simple Canvas Visualizer Component
// (Removed as we are using the one in AudioRecorderWithVisualizer component)

interface ClinicalSessionClientProps {
  appointment: any; // We'll type this properly later or infer from usage
}

export function ClinicalSessionClient({ appointment }: ClinicalSessionClientProps) {
  // Mock data for UI placeholders
  const patientName = appointment.patient?.user?.name || "Unknown Patient";
  const appointmentDate = new Date(appointment.date);
  const patientInitials = patientName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
  const patientImage = appointment.patientImageUrl;
  const reason = appointment.reason || "General Consultation";

  // State for recording and devices
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [isProcessing, setIsProcessing] = React.useState(false);
    const [recordingUrl, setRecordingUrl] = React.useState<string | null>(appointment.recordingUrl ?? null);
    const [isRecordingInfoOpen, setIsRecordingInfoOpen] = React.useState(false);
    const [activeMainTab, setActiveMainTab] = React.useState<"context" | "transcript" | "note">("context");
    const uploadInputRef = React.useRef<HTMLInputElement | null>(null);

  const { toast } = useToast();
  const { startUpload } = useUploadThing("audioUploader");

    const uploadAudioFile = async (audioFile: File) => {
        setIsProcessing(true);
        setIsUploading(true);
        setUploadProgress(0);

        await new Promise(resolve => setTimeout(resolve, 400));

        try {
            console.log("Starting upload with file:", audioFile.name, audioFile.type, audioFile.size);
            const res = await startUpload([audioFile], {
                appointmentId: appointment.id,
            });
            console.log("Upload result:", res);

            if (res && res[0]) {
                const uploadedFile = res[0] as {
                    ufsUrl?: string;
                    appUrl?: string;
                    url?: string;
                    serverData?: {
                        recordingUrl?: string;
                    };
                };
                const uploadedRecordingUrl = uploadedFile.serverData?.recordingUrl || uploadedFile.ufsUrl || uploadedFile.appUrl || uploadedFile.url;

                if (!uploadedRecordingUrl) {
                    throw new Error("Upload succeeded but no file URL was returned by UploadThing");
                }

                console.log("Uploaded URL:", uploadedRecordingUrl);
                setRecordingUrl(uploadedRecordingUrl);
                setUploadProgress(100);
                await new Promise(resolve => setTimeout(resolve, 500));

                toast({
                    title: "Session Finalized",
                    description: "Audio recording has been securely stored.",
                });
            }
        } catch (error) {
            console.error("Upload failed", error);
            toast({
                title: "Upload Failed",
                description: "Could not save the recording. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsUploading(false);
            setIsProcessing(false);
        }
    };

  const handleRecordingStop = async (audioBlob: Blob) => {
    // Construct file for upload
    const audioFile = new File([audioBlob], `session-${appointment.id}-${Date.now()}.webm`, { type: audioBlob.type });
             
        await uploadAudioFile(audioFile);
  };

    const handleManualUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("audio/")) {
            toast({
                title: "Invalid File",
                description: "Please select a valid audio file.",
                variant: "destructive",
            });
            event.target.value = "";
            return;
        }

        await uploadAudioFile(file);
        event.target.value = "";
    };
    return (
        <div className="flex flex-col h-[calc(100svh-3rem)] overflow-hidden bg-background space-y-0">
      {/* Header Section */}
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-10 w-10 border">
                <AvatarImage src={patientImage} alt={patientName} />
                <AvatarFallback>{patientInitials}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                    {patientName}
                  </h1>
                  <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">Patient</Badge>
                </div>
                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                  Reason: {reason}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
                         <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-md border border-border bg-muted/40 text-foreground hover:bg-muted"
                          onClick={() => uploadInputRef.current?.click()}
                          disabled={isUploading}
                          title="Upload Recording"
                          aria-label="Upload Recording"
                         >
                          <Upload className="h-4 w-4" />
                         </Button>
                         <input
                          ref={uploadInputRef}
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={handleManualUpload}
                         />
                         <AudioRecorderWithVisualizer 
                             onStop={handleRecordingStop}
                             isUploading={isUploading}
                         />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(appointmentDate, "MMMM dd, yyyy")}
                        </Badge>
                        <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
                            <Clock3 className="h-3.5 w-3.5" />
                            {format(appointmentDate, "hh:mm a")}
                        </Badge>
                        {recordingUrl && (
                            <Badge className="gap-1.5 py-1 pr-1.5 bg-[#CCFF0B] text-black border-2 border-[#B8E609] hover:bg-[#B8E609]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Recording Attached
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 p-0 rounded-full text-black/75 hover:text-black hover:bg-transparent"
                                    onClick={() => setIsRecordingInfoOpen(true)}
                                    aria-label="Recording info"
                                    title="Recording info"
                                >
                                    <Info className="h-3.5 w-3.5" />
                                </Button>
                            </Badge>
                        )}
                    </div>
                </div>

  </header>

      {/* Main Content */}
            <main className="flex-1 overflow-hidden p-4 pt-6">
                <div className="max-w-5xl mx-auto flex flex-col h-full gap-2.5 min-h-0">
            {/* Toolbar */}
                        <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 bg-transparent">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setActiveMainTab("context")}
                                        className={`group rounded-lg px-3 h-9 border transition-colors ${activeMainTab === "context" ? "bg-muted text-foreground border-transparent" : "text-foreground border-transparent hover:bg-muted"}`}
                                    >
                                        <SlidersHorizontal className={activeMainTab === "context" ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-muted-foreground group-hover:text-emerald-500"} />
                                        Context
                                    </Button>
                                    <div className="h-6 w-px bg-border/70" />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setActiveMainTab("transcript")}
                                        className={`group rounded-lg px-3 h-9 border transition-colors ${activeMainTab === "transcript" ? "bg-muted text-foreground border-transparent" : "text-foreground border-transparent hover:bg-muted"}`}
                                    >
                                        <AudioLines className={activeMainTab === "transcript" ? "h-4 w-4 text-violet-600" : "h-4 w-4 text-muted-foreground group-hover:text-violet-500"} />
                                        Transcript
                                    </Button>
                                    <div className="h-6 w-px bg-border/70" />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setActiveMainTab("note")}
                                        className={`group rounded-lg px-3 h-9 border transition-colors ${activeMainTab === "note" ? "bg-muted text-foreground border-transparent" : "text-foreground border-transparent hover:bg-muted"}`}
                                    >
                                        <PenLine className={activeMainTab === "note" ? "h-4 w-4 text-blue-600" : "h-4 w-4 text-muted-foreground group-hover:text-blue-500"} />
                                        Note
                                    </Button>
                                </div>
            </div>

            <div className="flex flex-col flex-1 min-h-0 bg-card rounded-xl border shadow-sm overflow-hidden">
                
                {/* Editor Toolbar */}
                <div className="flex items-center justify-between p-2 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                            <span className="i-grid" /> Select a template
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="flex items-center gap-1">
                         <div className="flex items-center border rounded-md bg-background">
                             <Button variant="ghost" size="icon" className="h-8 w-8 border-r rounded-none">
                                 <Mic className="w-4 h-4" />
                             </Button>
                             <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none px-1">
                                 <ChevronDown className="w-3 h-3" />
                             </Button>
                         </div>
                         <div className="flex items-center gap-1 ml-2">
                             <Button variant="ghost" size="icon" className="h-8 w-8">
                                 <Undo className="w-4 h-4" />
                             </Button>
                             <Button variant="ghost" size="icon" className="h-8 w-8">
                                 <Redo className="w-4 h-4" />
                             </Button>
                             <Button variant="ghost" size="sm" className="h-8 gap-2 ml-1 text-xs font-medium">
                                 Copy
                                 <ChevronDown className="w-3 h-3" />
                             </Button>
                         </div>
                    </div>
                </div>

                                {/* Main Tab Content Area */}
                                <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-white/50 dark:bg-black/20">
                                        <div className="space-y-2 max-w-md">
                                                <h3 className="text-xl font-medium text-foreground">
                                                        Start this session using the header
                                                </h3>
                                                <p className="text-sm text-muted-foreground">
                                                        {activeMainTab === "context" && "Session context will appear here as you progress through the visit."}
                                                        {activeMainTab === "transcript" && "Live transcript will appear here once recording starts."}
                                                        {activeMainTab === "note" && "Your clinical note will appear here once your session is complete."}
                                                </p>
                                        </div>

                                        <div className="mt-8 p-6 rounded-lg border bg-background/50 backdrop-blur shadow-sm max-w-sm w-full">
                                                {activeMainTab === "context" && (
                                                    <div className="flex flex-col items-center gap-3">
                                                        <Button className="w-full bg-[#CCFF0B] hover:bg-[#B8E609] text-black gap-2" size="lg">
                                                            <Mic className="w-5 h-5" />
                                                            Start transcribing
                                                        </Button>

                                                        <div className="text-left w-full space-y-1 mt-2">
                                                            <div className="flex justify-between text-sm p-2 hover:bg-muted rounded cursor-pointer">
                                                                <span>Transcribing</span>
                                                                <span className="text-green-600">✓</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm p-2 hover:bg-muted rounded cursor-pointer text-muted-foreground">
                                                                <span>Dictating</span>
                                                            </div>
                                                            <div className="flex justify-between text-sm p-2 hover:bg-muted rounded cursor-pointer text-muted-foreground">
                                                                <span>Upload session audio</span>
                                                            </div>
                                                        </div>

                                                        <div className="text-xs text-muted-foreground pt-2 border-t w-full text-center">
                                                            Select your visit mode in the dropdown
                                                        </div>
                                                    </div>
                                                )}

                                                {activeMainTab === "transcript" && (
                                                    <div className="space-y-3 text-left">
                                                        <div className="flex items-center gap-2 text-sm font-medium">
                                                            <AudioLines className="h-4 w-4 text-muted-foreground" />
                                                            Transcript
                                                        </div>
                                                        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                                                            Transcript will populate here after recording starts.
                                                        </div>
                                                    </div>
                                                )}

                                                {activeMainTab === "note" && (
                                                    <div className="space-y-3 text-left">
                                                        <div className="flex items-center gap-2 text-sm font-medium">
                                                            <PenLine className="h-4 w-4 text-muted-foreground" />
                                                            Note
                                                        </div>
                                                        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                                                            Generated note content will appear here once your session is processed.
                                                        </div>
                                                    </div>
                                                )}
                                        </div>
                                </div>

                <div className="p-2 border-t bg-muted/10 text-xs text-muted-foreground text-center">
                    Review your note before use to ensure it accurately represents the visit
                </div>
            </div>
        </div>
      </main>

      {/* Processing Overlay Dialog */}
      <Dialog open={isProcessing} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{ uploadProgress === 100 ? "Session Saved" : "Finalizing Session" }</DialogTitle>
            <DialogDescription>
              { uploadProgress === 100 
                ? "Your recording has been successfully uploaded and linked to the patient record."
                : "Please wait while we upload and secure your clinical recording." 
              }
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
             {uploadProgress === 100 ? (
                 <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center animate-in zoom-in duration-300">
                     <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                     </svg>
                 </div>
             ) : (
                <>
                    <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center relative">
                        <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                    </div>
                    <div className="w-full max-w-[200px] bg-stone-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-blue-500 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] w-full origin-left" />
                    </div>
                    <p className="text-sm text-muted-foreground animate-pulse">Uploading audio data...</p>
                </>
             )}
          </div>
        </DialogContent>
      </Dialog>

            <Dialog open={isRecordingInfoOpen} onOpenChange={setIsRecordingInfoOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Recording saved</DialogTitle>
                        <DialogDescription>
                            Audio is already attached to this appointment.
                        </DialogDescription>
                    </DialogHeader>
                    {recordingUrl && (
                        <Button variant="link" asChild className="px-0 justify-start">
                            <a href={recordingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5">
                                View recording
                                <Link2 className="h-3.5 w-3.5" />
                            </a>
                        </Button>
                    )}
                </DialogContent>
            </Dialog>
    </div>
  );
}
