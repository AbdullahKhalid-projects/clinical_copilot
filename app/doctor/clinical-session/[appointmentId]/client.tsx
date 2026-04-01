"use client";

import * as React from "react";
import { format, isValid } from "date-fns";
import { useRouter } from "next/navigation";
import { 
  ChevronDown, 
  Mic, 
  MoreHorizontal, 
  PenLine, 
  Undo, 
  Redo, 
    Trash, 
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
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    getDoctorPatientsForLinking,
    linkPatientToAppointment,
    deleteAppointmentSession,
    type LinkablePatient,
} from "../actions";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Simple Canvas Visualizer Component
// (Removed as we are using the one in AudioRecorderWithVisualizer component)

interface ClinicalSessionClientProps {
  appointment: any; // We'll type this properly later or infer from usage
}

export function ClinicalSessionClient({ appointment }: ClinicalSessionClientProps) {
    const [currentAppointment, setCurrentAppointment] = React.useState(appointment);
    const router = useRouter();

  // Mock data for UI placeholders
    const patientName = currentAppointment.patient?.user?.name || "Link Patient";
        const parsedAppointmentDate = currentAppointment?.date ? new Date(currentAppointment.date) : null;
        const appointmentDate = parsedAppointmentDate && isValid(parsedAppointmentDate) ? parsedAppointmentDate : null;
  const patientInitials = patientName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
    const patientImage = currentAppointment.patientImageUrl;
    const reason = currentAppointment.reason || "General Consultation";
    const hasLinkedPatient = Boolean(currentAppointment.patient?.id);
    const statusLabelMap: Record<string, string> = {
        UNLINKED: "Unlinked",
        PENDING: "Pending",
        CONFIRMED: "Confirmed",
        IN_PROGRESS: "In Progress",
        COMPLETED: "Completed",
        CANCELLED: "Cancelled",
    };
    const statusLabel = statusLabelMap[currentAppointment.status] || currentAppointment.status || "Unknown";
    const statusBadgeClassMap: Record<string, string> = {
        UNLINKED: "border-amber-300 bg-amber-100/70 text-amber-900",
        PENDING: "border-zinc-300 bg-zinc-100/80 text-zinc-800",
        CONFIRMED: "border-sky-300 bg-sky-100/70 text-sky-900",
        IN_PROGRESS: "border-blue-300 bg-blue-100/70 text-blue-900",
        COMPLETED: "border-emerald-300 bg-emerald-100/70 text-emerald-900",
        CANCELLED: "border-red-300 bg-red-100/70 text-red-900",
    };
    const statusBadgeClass = statusBadgeClassMap[currentAppointment.status] || "border-border bg-muted/70 text-foreground";

  // State for recording and devices
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [isProcessing, setIsProcessing] = React.useState(false);
    const [recordingUrl, setRecordingUrl] = React.useState<string | null>(currentAppointment.recordingUrl ?? null);
    const [isRecordingInfoOpen, setIsRecordingInfoOpen] = React.useState(false);
    const [activeMainTab, setActiveMainTab] = React.useState<"context" | "transcript" | "note">("context");
    const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
    const [isLinkPatientDialogOpen, setIsLinkPatientDialogOpen] = React.useState(false);
    const [isLoadingPatients, setIsLoadingPatients] = React.useState(false);
    const [isLinkingPatient, setIsLinkingPatient] = React.useState(false);
    const [isDeletingAppointment, setIsDeletingAppointment] = React.useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const [linkablePatients, setLinkablePatients] = React.useState<LinkablePatient[]>([]);

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
                appointmentId: currentAppointment.id,
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
        const audioFile = new File([audioBlob], `session-${currentAppointment.id}-${Date.now()}.webm`, { type: audioBlob.type });
             
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

    const openLinkPatientDialog = async () => {
        setIsLinkPatientDialogOpen(true);

        if (linkablePatients.length > 0) {
            return;
        }

        setIsLoadingPatients(true);
        try {
            const patients = await getDoctorPatientsForLinking();
            setLinkablePatients(patients);
        } catch (error) {
            console.error("Failed to load patients for linking", error);
            toast({
                title: "Could not load patients",
                description: "Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoadingPatients(false);
        }
    };

    const handleLinkPatient = async (patientId: string) => {
        setIsLinkingPatient(true);
        try {
            const result = await linkPatientToAppointment(currentAppointment.id, patientId);
            if (!result.success || !result.appointment) {
                toast({
                    title: "Link failed",
                    description: result.error || "Could not link patient to this session.",
                    variant: "destructive",
                });
                return;
            }

            setCurrentAppointment(result.appointment);
            setIsLinkPatientDialogOpen(false);
            toast({
                title: "Patient linked",
                description: "Patient is now attached to this clinical session.",
            });
        } catch (error) {
            console.error("Failed to link patient", error);
            toast({
                title: "Link failed",
                description: "Could not link patient to this session.",
                variant: "destructive",
            });
        } finally {
            setIsLinkingPatient(false);
        }
    };

    const handlePatientPrimaryAction = () => {
        if (hasLinkedPatient && currentAppointment.patient?.id) {
            router.push(`/doctor/patients/${currentAppointment.patient.id}`);
            return;
        }

        openLinkPatientDialog();
    };

    const handleDeleteAppointment = async () => {
        setIsDeletingAppointment(true);
        try {
            const result = await deleteAppointmentSession(currentAppointment.id);
            if (!result.success) {
                toast({
                    title: "Delete failed",
                    description: result.error || "Could not delete this session.",
                    variant: "destructive",
                });
                return;
            }

            setIsDeleteDialogOpen(false);
            toast({
                title: "Session deleted",
                description: "Appointment has been deleted successfully.",
            });
            if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("appointments:refresh"));
            }
            router.replace("/doctor/dashboard");
        } catch (error) {
            console.error("Failed to delete appointment", error);
            toast({
                title: "Delete failed",
                description: "Could not delete this session.",
                variant: "destructive",
            });
        } finally {
            setIsDeletingAppointment(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100svh-3rem)] overflow-hidden bg-background space-y-0">
      {/* Header Section */}
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 text-left">
                            <button
                                type="button"
                                className="rounded-full cursor-pointer"
                                onClick={handlePatientPrimaryAction}
                                aria-label={hasLinkedPatient ? "Open patient profile" : "Link patient"}
                            >
                                <Avatar className="h-10 w-10 border">
                                    <AvatarImage src={patientImage || undefined} alt={patientName} />
                                    <AvatarFallback>{patientInitials}</AvatarFallback>
                                </Avatar>
                            </button>
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                                        {patientName}
                                    </h1>
                                    {hasLinkedPatient && (
                                        <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">
                                            Patient
                                        </Badge>
                                    )}
                                    {!hasLinkedPatient && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="shrink-0"
                                                    onClick={handlePatientPrimaryAction}
                                                    aria-label="Link patient"
                                                >
                                                    <Badge variant="outline" className="border-2 border-border bg-muted text-foreground font-semibold hover:bg-muted/80 cursor-pointer">
                                                        Unlinked
                                                    </Badge>
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">
                                                Link patient
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                className="p-0 m-0 text-red-500 hover:text-red-600 disabled:opacity-50"
                                                onClick={() => setIsDeleteDialogOpen(true)}
                                                disabled={isDeletingAppointment}
                                                title="Delete session"
                                                aria-label="Delete session"
                                            >
                                                <Trash className="h-4 w-4" strokeWidth={2} />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom">
                                            Delete session
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                                    {hasLinkedPatient ? `Reason: ${reason}` : "Click patient icon or Unlinked label to link a patient"}
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
                        <Badge variant="outline" className={`gap-1.5 py-1 border-2 ${statusBadgeClass}`}>
                            {statusLabel}
                        </Badge>
                        <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
                            <Calendar className="h-3.5 w-3.5" />
                            {appointmentDate ? format(appointmentDate, "MMMM dd, yyyy") : "No date"}
                        </Badge>
                        <Badge variant="outline" className="gap-1.5 py-1 border-2 border-border bg-muted/70">
                            <Clock3 className="h-3.5 w-3.5" />
                            {appointmentDate ? format(appointmentDate, "hh:mm a") : "--:--"}
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
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-muted-foreground"
                            onClick={() => router.push("/doctor/note-studio/gallery")}
                        >
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

            <Dialog open={isLinkPatientDialogOpen} onOpenChange={setIsLinkPatientDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Link patient to this session</DialogTitle>
                        <DialogDescription>
                            Choose a patient to attach to this appointment.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="max-h-72 overflow-y-auto space-y-2">
                        {isLoadingPatients ? (
                            <div className="py-8 flex items-center justify-center text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading patients...
                            </div>
                        ) : linkablePatients.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                No patients found for this doctor yet.
                            </div>
                        ) : (
                            linkablePatients.map((patient) => (
                                <button
                                    key={patient.id}
                                    type="button"
                                    className="w-full flex items-center justify-between p-2.5 rounded-lg border hover:bg-muted/40 transition-colors"
                                    onClick={() => handleLinkPatient(patient.id)}
                                    disabled={isLinkingPatient}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <Avatar className="h-8 w-8 border">
                                            <AvatarImage src={patient.imageUrl || undefined} alt={patient.name} />
                                            <AvatarFallback>{patient.initials}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm font-medium truncate">{patient.name}</span>
                                    </div>
                                    <Link2 className="h-4 w-4 text-muted-foreground" />
                                </button>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Are you sure you want to delete this session?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete all transcripts, notes and documents associated with this session.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={handleDeleteAppointment}
                            disabled={isDeletingAppointment}
                        >
                            Delete session
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
    </div>
  );
}
