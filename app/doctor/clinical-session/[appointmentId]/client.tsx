"use client";

import * as React from "react";
import { format, isValid } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { 
    AudioLines,
  ChevronDown, 
    ChevronLeft,
    ChevronRight,
  Mic, 
  PenLine, 
        FileCode2,
        Download,
        Save,
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
    RotateCcw,
    Link2,
    Upload,
    SlidersHorizontal,
    Info
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useUploadThing } from "@/lib/uploadthing";
import { useToast } from "@/hooks/use-toast";
import { useClinicalWebSocket, type TranscriptSegment } from "@/hooks/use-clinical-websocket";
import { SessionTabs, type ClinicalSessionTab } from "./components/session-tabs";
import { LiveTranscriptPanel } from "./components/live-transcript-panel";
import { SessionRecordingActions } from "./components/session-recording-actions";
import { Thread } from "@/components/thread";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { confirmAndSaveAppointmentTranscription } from "../transcription-workflow-actions";
import {
    generateAppointmentNoteFromTemplate,
    getActiveNoteTemplatesForSession,
    saveAppointmentTemplateNoteDraft,
} from "../note-workflow-actions";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { NoteDocument } from "@/app/doctor/templates/components/pdf-note-preview";
import type { SoapTemplate } from "@/app/doctor/templates/types";
import { renderNotePreviewFromObject } from "@/app/doctor/templates/template-engine";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
    DialogFooter,
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
    getClinicalSessionData,
    getAppointmentFinalizeChecklist,
    getDoctorPatientsForLinking,
    finalizeAppointmentSession,
    linkPatientToAppointment,
    deleteAppointmentSession,
    type FinalizeChecklistResult,
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

const CLINICAL_CHAT_PANE_EVENT = "clinical:chat-pane-request";
const CLINICAL_SUB_SIDEBAR_EVENT = "clinical:sub-sidebar-request";
const CHAT_PANEL_TRANSITION_MS = 300;
const CHAT_PANEL_CONTENT_FADE_DELAY_MS = 80;

function extractNoteTextFromPayload(rawSoapNote: any): string {
    if (!rawSoapNote || typeof rawSoapNote !== "object") {
        return "";
    }

    if (typeof rawSoapNote.noteText === "string" && rawSoapNote.noteText.trim()) {
        return rawSoapNote.noteText;
    }

    if (
        typeof rawSoapNote.subjective === "string" ||
        typeof rawSoapNote.objective === "string" ||
        typeof rawSoapNote.assessment === "string" ||
        typeof rawSoapNote.plan === "string"
    ) {
        return [
            `Subjective:\n${String(rawSoapNote.subjective || "")}`,
            `Objective:\n${String(rawSoapNote.objective || "")}`,
            `Assessment:\n${String(rawSoapNote.assessment || "")}`,
            `Plan:\n${String(rawSoapNote.plan || "")}`,
        ].join("\n\n").trim();
    }

    return "";
}

function extractNoteDataFromPayload(rawSoapNote: any): Record<string, unknown> {
    if (!rawSoapNote || typeof rawSoapNote !== "object") {
        return {};
    }

    if (rawSoapNote.noteData && typeof rawSoapNote.noteData === "object" && !Array.isArray(rawSoapNote.noteData)) {
        return rawSoapNote.noteData as Record<string, unknown>;
    }

    return {};
}

function extractNoteMetadataFromPayload(rawSoapNote: any): Record<string, unknown> {
    if (!rawSoapNote || typeof rawSoapNote !== "object") {
        return {};
    }

    if (rawSoapNote.noteMetadata && typeof rawSoapNote.noteMetadata === "object" && !Array.isArray(rawSoapNote.noteMetadata)) {
        return rawSoapNote.noteMetadata as Record<string, unknown>;
    }

    return {};
}

function formatDateForNoteMetadata(value: unknown): string {
    if (!value) {
        return "";
    }

    const parsed = value instanceof Date ? value : new Date(String(value));
    if (!isValid(parsed)) {
        return "";
    }

    return parsed.toISOString().slice(0, 10);
}

function buildAppointmentPatientMetadata(rawAppointment: any): Record<string, unknown> {
    const patientName = String(rawAppointment?.patient?.user?.name || "").trim();
    const patientDateOfBirth = formatDateForNoteMetadata(rawAppointment?.patient?.dateOfBirth);
    const visitDate = formatDateForNoteMetadata(rawAppointment?.date);
    const rawPatientId = String(rawAppointment?.patient?.id || "").trim();
    const shortPatientId = rawPatientId ? rawPatientId.slice(-4) : "";

    return {
        patient_name: patientName,
        patient_date_of_birth: patientDateOfBirth,
        date_of_birth: patientDateOfBirth,
        dob: patientDateOfBirth,
        patient_id: shortPatientId,
        visit_date: visitDate,
    };
}

function mergeMetadataWithLiveAppointment(
    persistedMetadata: Record<string, unknown>,
    liveMetadata: Record<string, unknown>,
): Record<string, unknown> {
    const merged = { ...persistedMetadata };

    Object.entries(liveMetadata).forEach(([key, value]) => {
        if (typeof value === "string" && value.trim().length > 0) {
            merged[key] = value;
            return;
        }

        if (!Object.prototype.hasOwnProperty.call(merged, key)) {
            merged[key] = value;
        }
    });

    return merged;
}

function buildDefaultNoteData(template: SoapTemplate | null): Record<string, unknown> {
    if (!template) {
        return {};
    }

    return template.bodySchema.fields.reduce<Record<string, unknown>>((acc, field) => {
        if (field.type === "number") {
            acc[field.key] = 0;
        } else if (field.type === "boolean") {
            acc[field.key] = false;
        } else {
            acc[field.key] = "";
        }
        return acc;
    }, {});
}

function hasNonEmptyNoteData(noteData: Record<string, unknown>): boolean {
    return Object.values(noteData).some((value) => {
        if (typeof value === "string") {
            return value.trim().length > 0;
        }

        if (typeof value === "number") {
            return Number.isFinite(value) && value !== 0;
        }

        if (typeof value === "boolean") {
            return value === true;
        }

        return false;
    });
}

export function ClinicalSessionClient({ appointment }: ClinicalSessionClientProps) {
    const rootContainerRef = React.useRef<HTMLDivElement | null>(null);
    const tabsRowRef = React.useRef<HTMLDivElement | null>(null);
    const [pullTabTop, setPullTabTop] = React.useState<number | null>(null);
    const [currentAppointment, setCurrentAppointment] = React.useState(appointment);
    const router = useRouter();
    const searchParams = useSearchParams();

    React.useEffect(() => {
        setCurrentAppointment(appointment);
    }, [appointment]);

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

        const {
                connect,
                disconnect,
                connected,
                sessionId,
                transcript,
                draftTranscript,
                speakerRoles,
                sendAudioChunk,
                stopSession,
        } = useClinicalWebSocket("http://localhost:8000");

  // State for recording and devices
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [isProcessing, setIsProcessing] = React.useState(false);
        const [microphoneDevices, setMicrophoneDevices] = React.useState<MediaDeviceInfo[]>([]);
        const [selectedMicrophoneId, setSelectedMicrophoneId] = React.useState<string>("default");
        const [isLoadingMicrophones, setIsLoadingMicrophones] = React.useState(false);
    const [recordingUrl, setRecordingUrl] = React.useState<string | null>(currentAppointment.recordingUrl ?? null);
    const [isRecordingInfoOpen, setIsRecordingInfoOpen] = React.useState(false);
    const [activeMainTab, setActiveMainTab] = React.useState<ClinicalSessionTab>("context");
    const [isChatPanelOpen, setIsChatPanelOpen] = React.useState(false);
    const [isChatPanelContentVisible, setIsChatPanelContentVisible] = React.useState(false);
        const [isLiveConnecting, setIsLiveConnecting] = React.useState(false);
        const [isRecorderPaused, setIsRecorderPaused] = React.useState(false);
        const liveTranscriptionCancelledRef = React.useRef(false);
    const [noteTemplates, setNoteTemplates] = React.useState<Array<{ id: string; name: string; description: string; template: SoapTemplate }>>([]);
    const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
    const [isLoadingNoteTemplates, setIsLoadingNoteTemplates] = React.useState(false);
    const [isGeneratingNote, setIsGeneratingNote] = React.useState(false);
    const [isSavingNote, setIsSavingNote] = React.useState(false);
    const [activeNotePanel, setActiveNotePanel] = React.useState<"editor" | "preview">("editor");
    const [editableNoteData, setEditableNoteData] = React.useState<Record<string, unknown>>(() => extractNoteDataFromPayload(appointment?.soapNote));
    const [isNoteDirty, setIsNoteDirty] = React.useState(false);
    const [generatedNoteText, setGeneratedNoteText] = React.useState<string>(() => extractNoteTextFromPayload(appointment?.soapNote));
    const [hasGeneratedNoteCheckpoint, setHasGeneratedNoteCheckpoint] = React.useState<boolean>(() => {
        const initialNoteText = extractNoteTextFromPayload(appointment?.soapNote);
        const initialNoteData = extractNoteDataFromPayload(appointment?.soapNote);
        return initialNoteText.trim().length > 0 || hasNonEmptyNoteData(initialNoteData);
    });
    const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
    const [isLinkPatientDialogOpen, setIsLinkPatientDialogOpen] = React.useState(false);
    const [isLoadingPatients, setIsLoadingPatients] = React.useState(false);
    const [isLinkingPatient, setIsLinkingPatient] = React.useState(false);
    const [isDeletingAppointment, setIsDeletingAppointment] = React.useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const [linkablePatients, setLinkablePatients] = React.useState<LinkablePatient[]>([]);
    const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = React.useState(false);
    const [isFinalizeChecklistLoading, setIsFinalizeChecklistLoading] = React.useState(false);
    const [isFinalizingSession, setIsFinalizingSession] = React.useState(false);
    const [finalizeChecklistResult, setFinalizeChecklistResult] = React.useState<FinalizeChecklistResult | null>(null);
    const hasAutoOpenedFinalizeRef = React.useRef(false);
        const hasMountedPanelRef = React.useRef(false);
        const panelRenderTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
        const [isPanelRendering, setIsPanelRendering] = React.useState(false);
        const transcriptEndRef = React.useRef<HTMLDivElement | null>(null);
        const liveAudioContextRef = React.useRef<AudioContext | null>(null);
        const liveProcessorRef = React.useRef<ScriptProcessorNode | null>(null);
        const liveSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
        const isRecorderPausedRef = React.useRef(false);

    const persistedTranscript = React.useMemo<TranscriptSegment[]>(() => {
        if (!Array.isArray(currentAppointment?.transcript)) {
            return [];
        }

        return currentAppointment.transcript
            .filter((segment: any) => segment && typeof segment === "object")
            .map((segment: any) => ({
                text: String(segment.text || "").trim(),
                speaker: String(segment.speaker || "Speaker 0"),
                start: typeof segment.start === "number" ? segment.start : 0,
                end: typeof segment.end === "number" ? segment.end : 0,
                role: typeof segment.role === "string" ? segment.role : undefined,
            }))
            .filter((segment: TranscriptSegment) => segment.text.length > 0);
    }, [currentAppointment?.transcript]);

    const displayedTranscript = transcript.length > 0 ? transcript : persistedTranscript;
    const isTranscriptReadyForNote = displayedTranscript.length > 0;

    const selectedTemplateOption = React.useMemo(
        () => noteTemplates.find((template) => template.id === selectedTemplateId) || null,
        [noteTemplates, selectedTemplateId],
    );

    const selectedTemplate = selectedTemplateOption?.template || null;
    const persistedNoteMetadata = React.useMemo(
        () => extractNoteMetadataFromPayload(currentAppointment?.soapNote),
        [currentAppointment?.soapNote],
    );
    const livePatientMetadata = React.useMemo(
        () => buildAppointmentPatientMetadata(currentAppointment),
        [
            currentAppointment?.date,
            currentAppointment?.patient?.id,
            currentAppointment?.patient?.dateOfBirth,
            currentAppointment?.patient?.user?.name,
        ],
    );
    const resolvedNoteMetadata = React.useMemo(
        () => mergeMetadataWithLiveAppointment(persistedNoteMetadata, livePatientMetadata),
        [persistedNoteMetadata, livePatientMetadata],
    );
    const noteDocumentData = React.useMemo(
        () => ({ ...editableNoteData, ...resolvedNoteMetadata }),
        [editableNoteData, resolvedNoteMetadata],
    );

  const { toast } = useToast();
  const { startUpload } = useUploadThing("audioUploader");

    const refreshMicrophoneDevices = React.useCallback(async (requestLabels = false, showError = false) => {
        if (!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices)) {
            setMicrophoneDevices([]);
            return;
        }

        setIsLoadingMicrophones(true);
        try {
            if (requestLabels && navigator.mediaDevices.getUserMedia) {
                try {
                    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    permissionStream.getTracks().forEach((track) => track.stop());
                } catch (error) {
                    console.error("Microphone permission was not granted for device labels", error);
                }
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter((device) => device.kind === "audioinput");
            setMicrophoneDevices(inputs);
            setSelectedMicrophoneId((current) => {
                if (current === "default") {
                    return current;
                }

                return inputs.some((device) => device.deviceId === current) ? current : "default";
            });
        } catch (error) {
            console.error("Unable to enumerate microphone devices", error);
            if (showError) {
                toast({
                    title: "Microphone devices unavailable",
                    description: "Could not read audio input devices from this browser.",
                    variant: "destructive",
                });
            }
        } finally {
            setIsLoadingMicrophones(false);
        }
    }, [toast]);

    React.useEffect(() => {
        void refreshMicrophoneDevices(false, false);

        if (!(navigator.mediaDevices && navigator.mediaDevices.addEventListener)) {
            return;
        }

        const handleDeviceChange = () => {
            void refreshMicrophoneDevices(false, false);
        };

        navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
        return () => {
            navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
        };
    }, [refreshMicrophoneDevices]);

    const selectableMicrophones = React.useMemo(
        () => microphoneDevices.filter((device) => device.deviceId && device.deviceId !== "default"),
        [microphoneDevices],
    );

    const selectedMicrophoneLabel = React.useMemo(() => {
        if (selectedMicrophoneId === "default") {
            return "System Default";
        }

        const matchedDevice = selectableMicrophones.find((device) => device.deviceId === selectedMicrophoneId);
        if (!matchedDevice) {
            return "Unknown microphone";
        }

        return matchedDevice.label?.trim() || "Unnamed microphone";
    }, [selectableMicrophones, selectedMicrophoneId]);

    const cleanupLiveTranscription = React.useCallback(() => {
        if (liveProcessorRef.current) {
            try {
                liveProcessorRef.current.disconnect();
            } catch (error) {
                console.error("Failed to disconnect live processor", error);
            }
            liveProcessorRef.current = null;
        }

        if (liveSourceRef.current) {
            try {
                liveSourceRef.current.disconnect();
            } catch (error) {
                console.error("Failed to disconnect live source", error);
            }
            liveSourceRef.current = null;
        }

        if (liveAudioContextRef.current && liveAudioContextRef.current.state !== "closed") {
            void liveAudioContextRef.current.close().catch((error) => {
                console.error("Failed to close live audio context", error);
            });
        }

        liveAudioContextRef.current = null;
    }, []);

    const handleRecordingStart = React.useCallback((stream: MediaStream) => {
        liveTranscriptionCancelledRef.current = false;
        isRecorderPausedRef.current = false;
        setIsRecorderPaused(false);
        setActiveMainTab("transcript");

        void (async () => {
            setIsLiveConnecting(true);

            try {
                const connectedToSocket = await connect();
                if (!connectedToSocket) {
                    throw new Error("WebSocket unavailable");
                }

                if (liveTranscriptionCancelledRef.current) {
                    return;
                }

                const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
                const audioContext = new AudioContextCtor({ sampleRate: 16000 });
                const source = audioContext.createMediaStreamSource(stream);
                const processor = audioContext.createScriptProcessor(4096, 1, 1);

                processor.onaudioprocess = (event) => {
                    if (liveTranscriptionCancelledRef.current || isRecorderPausedRef.current) {
                        return;
                    }

                    const inputData = event.inputBuffer.getChannelData(0);
                    const pcmData = new Int16Array(inputData.length);

                    for (let index = 0; index < inputData.length; index += 1) {
                        const sample = Math.max(-1, Math.min(1, inputData[index]));
                        pcmData[index] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                    }

                    sendAudioChunk(pcmData.buffer);
                };

                source.connect(processor);
                processor.connect(audioContext.destination);

                liveAudioContextRef.current = audioContext;
                liveSourceRef.current = source;
                liveProcessorRef.current = processor;

                toast({
                    title: "Live transcription connected",
                    description: "Your recording is now streaming to the Python service.",
                });
            } catch (error) {
                console.error("Failed to initialize live transcription", error);
                toast({
                    title: "Live transcription unavailable",
                    description: "The audio will still be saved, but realtime transcript could not connect.",
                    variant: "destructive",
                });
            } finally {
                setIsLiveConnecting(false);
            }
        })();
    }, [connect, sendAudioChunk, toast]);

    const handleRecordingDiscard = React.useCallback(() => {
        liveTranscriptionCancelledRef.current = true;
        isRecorderPausedRef.current = false;
        setIsRecorderPaused(false);
        cleanupLiveTranscription();
        disconnect();
        setActiveMainTab("context");
        setIsLiveConnecting(false);
    }, [cleanupLiveTranscription, disconnect]);

    const handleRecordingStop = React.useCallback(async (audioBlob: Blob) => {
        liveTranscriptionCancelledRef.current = true;
        isRecorderPausedRef.current = false;
        setIsRecorderPaused(false);
        stopSession();
        cleanupLiveTranscription();

        const audioFile = new File([audioBlob], `session-${currentAppointment.id}-${Date.now()}.webm`, { type: audioBlob.type });

        await uploadAudioFile(audioFile);
    }, [cleanupLiveTranscription, currentAppointment.id, stopSession, uploadAudioFile]);

    const handleRecordingPauseChange = React.useCallback((paused: boolean) => {
        isRecorderPausedRef.current = paused;
        setIsRecorderPaused(paused);
    }, []);

    React.useEffect(() => {
        if (activeMainTab === "transcript") {
            transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [activeMainTab, displayedTranscript, draftTranscript]);

    React.useEffect(() => {
        return () => {
            cleanupLiveTranscription();
            disconnect();
        };
    }, [cleanupLiveTranscription, disconnect]);

    React.useEffect(() => {
        if (!hasMountedPanelRef.current) {
            hasMountedPanelRef.current = true;
            return;
        }

        setIsPanelRendering(true);

        if (panelRenderTimeoutRef.current) {
            clearTimeout(panelRenderTimeoutRef.current);
        }

        panelRenderTimeoutRef.current = setTimeout(() => {
            setIsPanelRendering(false);
            panelRenderTimeoutRef.current = null;
        }, 280);
    }, [activeMainTab]);

    React.useEffect(() => {
        return () => {
            if (panelRenderTimeoutRef.current) {
                clearTimeout(panelRenderTimeoutRef.current);
            }
        };
    }, []);

    async function uploadAudioFile(audioFile: File) {
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

                const transcriptionResult = await confirmAndSaveAppointmentTranscription(currentAppointment.id);

                const latestSessionData = await getClinicalSessionData(currentAppointment.id);
                if (latestSessionData) {
                    setCurrentAppointment(latestSessionData);
                    if (Array.isArray((latestSessionData as any).transcript) && (latestSessionData as any).transcript.length > 0) {
                        setActiveMainTab("transcript");
                    }
                }
                setUploadProgress(100);
                await new Promise(resolve => setTimeout(resolve, 500));

                if (!transcriptionResult.success) {
                    toast({
                        title: "Recording saved, transcription pending",
                        description: transcriptionResult.error || "Audio uploaded successfully, but transcription could not be completed.",
                        variant: "destructive",
                    });
                } else {
                    toast({
                        title: "Session Finalized",
                        description: "Audio recording has been securely stored.",
                    });
                }
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
    }

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

    const loadActiveTemplates = React.useCallback(async () => {
        setIsLoadingNoteTemplates(true);
        try {
            const result = await getActiveNoteTemplatesForSession();
            if (!result.success) {
                toast({
                    title: "Template load failed",
                    description: result.error || "Could not fetch active templates from Note Studio.",
                    variant: "destructive",
                });
                return;
            }

            const templates = result.templates || [];
            setNoteTemplates(templates);

            const savedTemplateId = String((currentAppointment as any)?.soapNote?.template?.id || "");

            setSelectedTemplateId((current) => {
                if (current && templates.some((template) => template.id === current)) {
                    return current;
                }
                if (savedTemplateId && templates.some((template) => template.id === savedTemplateId)) {
                    return savedTemplateId;
                }
                if (result.defaultTemplateId) {
                    return result.defaultTemplateId;
                }
                return templates[0]?.id || "";
            });
        } catch (error) {
            console.error("Failed to load active templates", error);
            toast({
                title: "Template load failed",
                description: "Unexpected error while loading templates.",
                variant: "destructive",
            });
        } finally {
            setIsLoadingNoteTemplates(false);
        }
    }, [currentAppointment, toast]);

    const handleGenerateTemplateNote = React.useCallback(async () => {
        if (!selectedTemplateId) {
            toast({
                title: "Select a template",
                description: "Choose an active template before generating note text.",
                variant: "destructive",
            });
            return;
        }

        if (!isTranscriptReadyForNote) {
            toast({
                title: "Transcript required",
                description: "Complete transcription first, then click Generate to create the note.",
                variant: "destructive",
            });
            return;
        }

        setIsGeneratingNote(true);
        try {
            const result = await generateAppointmentNoteFromTemplate(currentAppointment.id, selectedTemplateId);
            if (!result.success || !result.noteText || !result.noteData) {
                toast({
                    title: "Note generation failed",
                    description: result.error || "Could not generate a template note for this session.",
                    variant: "destructive",
                });
                return;
            }

            setGeneratedNoteText(result.noteText);
            setEditableNoteData(result.noteData);
            setIsNoteDirty(false);
            setHasGeneratedNoteCheckpoint(true);

            const latestSessionData = await getClinicalSessionData(currentAppointment.id);
            if (latestSessionData) {
                setCurrentAppointment(latestSessionData);
            }

            toast({
                title: "Note generated",
                description: `${result.templateName || "Template"} note has been generated and saved.`,
            });
        } catch (error) {
            console.error("Failed to generate template note", error);
            toast({
                title: "Note generation failed",
                description: "Unexpected error while generating note.",
                variant: "destructive",
            });
        } finally {
            setIsGeneratingNote(false);
        }
    }, [currentAppointment.id, isTranscriptReadyForNote, selectedTemplateId, toast]);

    const handleNoteFieldChange = React.useCallback((fieldKey: string, nextValue: unknown) => {
        setEditableNoteData((prev) => ({
            ...prev,
            [fieldKey]: nextValue,
        }));
        setIsNoteDirty(true);
    }, []);

    const handleSaveTemplateNote = React.useCallback(async () => {
        if (!selectedTemplateId) {
            toast({
                title: "Select a template",
                description: "Choose an active template before saving note edits.",
                variant: "destructive",
            });
            return;
        }

        setIsSavingNote(true);
        try {
            const result = await saveAppointmentTemplateNoteDraft(currentAppointment.id, selectedTemplateId, editableNoteData);
            if (!result.success || !result.noteText || !result.noteData) {
                toast({
                    title: "Save failed",
                    description: result.error || "Could not save note changes.",
                    variant: "destructive",
                });
                return;
            }

            setGeneratedNoteText(result.noteText);
            setEditableNoteData(result.noteData);
            setIsNoteDirty(false);

            const latestSessionData = await getClinicalSessionData(currentAppointment.id);
            if (latestSessionData) {
                setCurrentAppointment(latestSessionData);
            }

            toast({
                title: "Note saved",
                description: "Your note edits were saved successfully.",
            });
        } catch (error) {
            console.error("Failed to save template note", error);
            toast({
                title: "Save failed",
                description: "Unexpected error while saving note edits.",
                variant: "destructive",
            });
        } finally {
            setIsSavingNote(false);
        }
    }, [currentAppointment.id, editableNoteData, selectedTemplateId, toast]);

    React.useEffect(() => {
        const payloadNoteText = extractNoteTextFromPayload(currentAppointment?.soapNote);
        const payloadNoteData = extractNoteDataFromPayload(currentAppointment?.soapNote);

        setGeneratedNoteText(payloadNoteText);
        setHasGeneratedNoteCheckpoint(payloadNoteText.trim().length > 0 || hasNonEmptyNoteData(payloadNoteData));
        if (Object.keys(payloadNoteData).length > 0) {
            setEditableNoteData(payloadNoteData);
            setIsNoteDirty(false);
        }
    }, [currentAppointment?.soapNote]);

    React.useEffect(() => {
        if (activeMainTab !== "note") {
            return;
        }
        if (noteTemplates.length > 0 || isLoadingNoteTemplates) {
            return;
        }

        void loadActiveTemplates();
    }, [activeMainTab, isLoadingNoteTemplates, loadActiveTemplates, noteTemplates.length]);

    React.useEffect(() => {
        if (!selectedTemplate) {
            return;
        }

        setIsNoteDirty(false);

        setEditableNoteData((prev) => {
            const defaults = buildDefaultNoteData(selectedTemplate);
            const next = selectedTemplate.bodySchema.fields.reduce<Record<string, unknown>>((acc, field) => {
                if (Object.prototype.hasOwnProperty.call(prev, field.key)) {
                    acc[field.key] = prev[field.key];
                    return acc;
                }
                acc[field.key] = defaults[field.key];
                return acc;
            }, {});

            return next;
        });
    }, [selectedTemplate]);

    React.useEffect(() => {
        if (!selectedTemplate) {
            return;
        }

        try {
            const noteText = renderNotePreviewFromObject(selectedTemplate, editableNoteData, resolvedNoteMetadata);
            if (noteText.trim().length > 0) {
                setGeneratedNoteText(noteText);
            }
        } catch {
            // Ignore preview rendering errors until template/note data is complete.
        }
    }, [editableNoteData, resolvedNoteMetadata, selectedTemplate]);

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

        const returnTo = `/doctor/clinical-session/${currentAppointment.id}`;
        const params = new URLSearchParams({
            mode: "link",
            appointmentId: currentAppointment.id,
            returnTo,
        });
        router.push(`/doctor/patients?${params.toString()}`);
    };

    const loadFinalizeChecklist = React.useCallback(async (showErrors = true) => {
        setIsFinalizeChecklistLoading(true);
        try {
            const result = await getAppointmentFinalizeChecklist(currentAppointment.id);
            setFinalizeChecklistResult(result);

            if (!result.success && showErrors) {
                toast({
                    title: "Could not load checklist",
                    description: result.error || "Unable to fetch finalize session checklist.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Failed to load finalize checklist", error);
            setFinalizeChecklistResult(null);
            if (showErrors) {
                toast({
                    title: "Could not load checklist",
                    description: "Unexpected error while loading finalize session checklist.",
                    variant: "destructive",
                });
            }
        } finally {
            setIsFinalizeChecklistLoading(false);
        }
    }, [currentAppointment.id, toast]);

    const openFinalizeDialog = React.useCallback(() => {
        setIsFinalizeDialogOpen(true);
        void loadFinalizeChecklist();
    }, [loadFinalizeChecklist]);

    React.useEffect(() => {
        if (hasAutoOpenedFinalizeRef.current) {
            return;
        }

        const shouldResumeFinalize = searchParams.get("finalize") === "1";
        if (!shouldResumeFinalize) {
            return;
        }

        hasAutoOpenedFinalizeRef.current = true;

        const focusTask = searchParams.get("focusTask");
        if (focusTask === "transcriptReady") {
            setActiveMainTab("transcript");
        } else if (focusTask === "noteReady") {
            setActiveMainTab("note");
        }

        setIsFinalizeDialogOpen(true);
        void loadFinalizeChecklist();
    }, [loadFinalizeChecklist, searchParams]);

    const handleFinalizeTaskAction = React.useCallback((taskKey: "patientLinked" | "transcriptReady" | "noteReady") => {
        if (taskKey === "patientLinked") {
            if (hasLinkedPatient) {
                return;
            }

            setIsFinalizeDialogOpen(false);
            const returnTo = `/doctor/clinical-session/${currentAppointment.id}`;
            const params = new URLSearchParams({
                mode: "link",
                appointmentId: currentAppointment.id,
                returnTo,
            });
            router.push(`/doctor/patients?${params.toString()}`);
            return;
        }

        if (taskKey === "transcriptReady") {
            setActiveMainTab("transcript");
            setIsFinalizeDialogOpen(false);
            return;
        }

        setActiveMainTab("note");
        setIsFinalizeDialogOpen(false);
    }, [currentAppointment.id, hasLinkedPatient, router]);

    const handleFinalizeSession = React.useCallback(async () => {
        setIsFinalizingSession(true);
        try {
            const result = await finalizeAppointmentSession(currentAppointment.id);
            setFinalizeChecklistResult(result);

            if (!result.success) {
                toast({
                    title: "Session not ready to finalize",
                    description: result.error || "Complete required steps before finalizing.",
                    variant: "destructive",
                });
                void loadFinalizeChecklist();
                return;
            }

            setCurrentAppointment((prev: any) => ({
                ...prev,
                status: "COMPLETED",
            }));
            setIsFinalizeDialogOpen(false);

            toast({
                title: "Clinical session finalized",
                description: "Session status is now completed.",
            });
        } catch (error) {
            console.error("Failed to finalize session", error);
            toast({
                title: "Finalize failed",
                description: "Unexpected error while finalizing this session.",
                variant: "destructive",
            });
            void loadFinalizeChecklist();
        } finally {
            setIsFinalizingSession(false);
        }
    }, [currentAppointment.id, loadFinalizeChecklist, toast]);

    const localFinalizeChecklist = React.useMemo(
        () => ({
            patientLinked: hasLinkedPatient,
            transcriptReady: isTranscriptReadyForNote,
            noteReady: isTranscriptReadyForNote && hasGeneratedNoteCheckpoint,
        }),
        [hasGeneratedNoteCheckpoint, hasLinkedPatient, isTranscriptReadyForNote],
    );
    const isSessionFinalized = currentAppointment.status === "COMPLETED";
    const finalizeChecklist = finalizeChecklistResult?.checklist ?? localFinalizeChecklist;
    const finalizeBlockersByKey = React.useMemo(
        () =>
            new Map(
                (finalizeChecklistResult?.blockers || []).map((blocker) => [
                    blocker.key,
                    blocker,
                ]),
            ),
        [finalizeChecklistResult?.blockers],
    );
    const canFinalizeSession = isSessionFinalized
        || (finalizeChecklistResult?.canFinalize
            ?? (finalizeChecklist.patientLinked && finalizeChecklist.transcriptReady && finalizeChecklist.noteReady));

    const finalizeTasks: Array<{
        key: "patientLinked" | "transcriptReady" | "noteReady";
        label: string;
        description: string;
        complete: boolean;
    }> = [
        {
            key: "patientLinked",
            label: "Patient linked",
            description: finalizeChecklist.patientLinked
                ? "Patient is linked and ready for finalization."
                : finalizeBlockersByKey.get("patientLinked")?.description || "Attach this session to the correct patient profile.",
            complete: finalizeChecklist.patientLinked,
        },
        {
            key: "transcriptReady",
            label: "Transcript ready",
            description: finalizeChecklist.transcriptReady
                ? "Transcript is available for this session."
                : finalizeBlockersByKey.get("transcriptReady")?.description
                    || (finalizeChecklistResult?.aiStatus === "PROCESSING"
                        ? "Transcription is still processing. Check Transcript to monitor progress."
                        : "Record or upload audio, then confirm transcription."),
            complete: finalizeChecklist.transcriptReady,
        },
        {
            key: "noteReady",
            label: "Visit note generated",
            description: finalizeChecklist.noteReady
                ? "Visit note is generated and available."
                : finalizeBlockersByKey.get("noteReady")?.description
                    || (!finalizeChecklist.transcriptReady
                        ? "Complete transcript first, then click Generate in the Note tab."
                        : "Click Generate in the Note tab, then review the generated note."),
            complete: finalizeChecklist.noteReady,
        },
    ];
    const finalizeTrackingTasks = React.useMemo(
        () => finalizeTasks.map((task) => ({
            ...task,
            complete: isSessionFinalized ? true : task.complete,
        })),
        [finalizeTasks, isSessionFinalized],
    );
    const isMainPanelBusy = isPanelRendering
        || (activeMainTab === "transcript" && isLiveConnecting)
        || (activeMainTab === "note" && (isLoadingNoteTemplates || isGeneratingNote || isSavingNote));

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

    const handleToggleChatPane = React.useCallback(() => {
        setIsChatPanelOpen((prev) => !prev);
    }, []);

    React.useEffect(() => {
        if (!isChatPanelOpen) {
            return;
        }

        window.dispatchEvent(
            new CustomEvent(CLINICAL_CHAT_PANE_EVENT, {
                detail: { open: true },
            }),
        );
    }, [isChatPanelOpen]);

    React.useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        if (isChatPanelOpen) {
            setIsChatPanelContentVisible(false);
            timeoutId = setTimeout(() => {
                setIsChatPanelContentVisible(true);
            }, CHAT_PANEL_TRANSITION_MS + CHAT_PANEL_CONTENT_FADE_DELAY_MS);
        } else {
            setIsChatPanelContentVisible(false);
        }

        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [isChatPanelOpen]);

    const updatePullTabPosition = React.useCallback(() => {
        const rootRect = rootContainerRef.current?.getBoundingClientRect();
        const tabsRect = tabsRowRef.current?.getBoundingClientRect();
        if (!rootRect || !tabsRect) {
            return;
        }

        setPullTabTop(tabsRect.top - rootRect.top + (tabsRect.height / 2));
    }, []);

    React.useEffect(() => {
        updatePullTabPosition();

        window.addEventListener("resize", updatePullTabPosition);
        return () => {
            window.removeEventListener("resize", updatePullTabPosition);
        };
    }, [updatePullTabPosition]);

    React.useEffect(() => {
        const onSubSidebarRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ open?: boolean }>;
            if (customEvent.detail?.open) {
                setIsChatPanelOpen(false);
            }
        };

        window.addEventListener(CLINICAL_SUB_SIDEBAR_EVENT, onSubSidebarRequest as EventListener);
        return () => {
            window.removeEventListener(CLINICAL_SUB_SIDEBAR_EVENT, onSubSidebarRequest as EventListener);
        };
    }, []);

    const localChatModelAdapter = React.useMemo(
        () => ({
            run: async ({ messages }: { messages: ReadonlyArray<{ role: string; content: ReadonlyArray<{ type: string; text?: string }> }> }) => {
                const lastUserText = [...messages]
                    .reverse()
                    .find((message) => message.role === "user")
                    ?.content.filter((part) => part.type === "text")
                    .map((part) => part.text ?? "")
                    .join(" ")
                    .trim();

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: lastUserText
                                ? `I captured your question: "${lastUserText}". Retrieval-backed generation will be connected next.`
                                : "Ask a follow-up question and I can help draft the next clinical step.",
                        },
                    ],
                };
            },
        }),
        [],
    );

    const chatRuntime = useLocalRuntime(localChatModelAdapter);

    return (
        <div ref={rootContainerRef} className="relative flex h-[calc(100svh-3rem)] overflow-hidden bg-background">
            <div className="min-w-0 flex flex-1 flex-col">
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
                                    <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">{patientName}</h1>
                                    {hasLinkedPatient && (
                                        <Badge variant="outline" className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold">Patient</Badge>
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
                                                    <Badge variant="outline" className="border-2 border-border bg-muted text-foreground font-semibold hover:bg-muted/80 cursor-pointer">Unlinked</Badge>
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">Link patient</TooltipContent>
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
                                        <TooltipContent side="bottom">Delete session</TooltipContent>
                                    </Tooltip>
                                </div>
                                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                                    {hasLinkedPatient ? `Reason: ${reason}` : "Click patient icon or Unlinked label to find and link a patient"}
                                </span>
                            </div>
                        </div>

                        <SessionRecordingActions
                            isUploading={isUploading}
                            selectedMicrophoneId={selectedMicrophoneId}
                            onStart={handleRecordingStart}
                            onPauseChange={handleRecordingPauseChange}
                            onDiscard={handleRecordingDiscard}
                            onStop={handleRecordingStop}
                            onManualUpload={handleManualUpload}
                            uploadInputRef={uploadInputRef}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        {currentAppointment.status !== "UNLINKED" && (
                            <Badge variant="outline" className={`gap-1.5 py-1 border-2 ${statusBadgeClass}`}>{statusLabel}</Badge>
                        )}
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

            <main className="flex-1 overflow-hidden p-4 pt-6">
                <div className="mx-auto flex h-full w-full max-w-[1280px] min-h-0">
                    <div className="min-w-0 flex flex-1 flex-col gap-2.5">
                        <div ref={tabsRowRef} className="flex items-center justify-between">
                            <SessionTabs activeTab={activeMainTab} onTabChange={setActiveMainTab} />
                        </div>

                        <div className="flex flex-col flex-1 min-h-0 bg-card rounded-xl border shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between p-2 border-b bg-muted/30">
                                <div className="flex items-center gap-2">
                                    {activeMainTab === "transcript" && (
                                        <div className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
                                            <AudioLines className="h-4 w-4 text-muted-foreground" />
                                            <span>Live Transcription</span>
                                        </div>
                                    )}
                                    {activeMainTab === "note" && (
                                        <div className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
                                            <PenLine className="h-4 w-4 text-muted-foreground" />
                                            <span>Template Note</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-1">
                                    {activeMainTab === "transcript" && (
                                        <DropdownMenu
                                            onOpenChange={(open) => {
                                                if (open) {
                                                    void refreshMicrophoneDevices(true, false);
                                                }
                                            }}
                                        >
                                            <div className="flex items-center border rounded-md bg-background">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 border-r rounded-none">
                                                    <Mic className="w-4 h-4" />
                                                </Button>
                                                <Badge variant="outline" className="mx-1 gap-1.5 border-border bg-background/80 text-xs font-semibold">
                                                    <span
                                                        className={`h-2 w-2 rounded-full ${isLiveConnecting ? "bg-amber-500" : connected ? (isRecorderPaused ? "bg-amber-500" : "bg-emerald-500") : "bg-black shadow-[0_0_8px_1px_rgba(0,0,0,0.45)]"}`}
                                                        aria-hidden="true"
                                                    />
                                                    {isLiveConnecting ? "Connecting" : connected ? (isRecorderPaused ? "Paused" : `Live · ${sessionId?.slice(-6) || "ready"}`) : "Offline"}
                                                </Badge>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-none px-1"
                                                        aria-label="Microphone settings"
                                                        title="Microphone settings"
                                                    >
                                                        <ChevronDown className="w-3 h-3" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                            </div>

                                            <DropdownMenuContent align="end" className="w-72">
                                                <DropdownMenuLabel>Microphone Input</DropdownMenuLabel>
                                                <DropdownMenuRadioGroup value={selectedMicrophoneId} onValueChange={setSelectedMicrophoneId}>
                                                    <DropdownMenuRadioItem value="default">System Default</DropdownMenuRadioItem>
                                                    {selectableMicrophones.map((device, index) => (
                                                        <DropdownMenuRadioItem key={device.deviceId} value={device.deviceId}>
                                                            {device.label?.trim() || `Microphone ${index + 1}`}
                                                        </DropdownMenuRadioItem>
                                                    ))}
                                                </DropdownMenuRadioGroup>

                                                {selectableMicrophones.length === 0 && (
                                                    <DropdownMenuItem disabled>No specific microphones detected</DropdownMenuItem>
                                                )}

                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={() => {
                                                        void refreshMicrophoneDevices(true, true);
                                                    }}
                                                    disabled={isLoadingMicrophones}
                                                >
                                                    {isLoadingMicrophones ? "Refreshing devices..." : "Refresh device list"}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem disabled title={selectedMicrophoneLabel}>
                                                    Selected: {selectedMicrophoneLabel}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem disabled>
                                                    Changes apply on next recording start
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}

                                    {activeMainTab === "note" && (
                                        <div className="flex items-center gap-2">
                                            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                                                <SelectTrigger className="h-8 min-w-[240px] bg-background">
                                                    <SelectValue placeholder={isLoadingNoteTemplates ? "Loading templates..." : "Select template"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {noteTemplates.map((template) => (
                                                        <SelectItem key={template.id} value={template.id}>
                                                            {template.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            <Button
                                                type="button"
                                                size="sm"
                                                className="h-8"
                                                disabled={isGeneratingNote || !selectedTemplateId || !isTranscriptReadyForNote}
                                                onClick={handleGenerateTemplateNote}
                                                title={isTranscriptReadyForNote ? "Generate note" : "Transcript required before generating note"}
                                            >
                                                {isGeneratingNote ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Generating
                                                    </>
                                                ) : (
                                                    "Generate"
                                                )}
                                            </Button>

                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className={`h-8 w-8 rounded-sm ${activeNotePanel === "editor" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                                                onClick={() => setActiveNotePanel("editor")}
                                                title="Editor"
                                            >
                                                <FileCode2 className="h-4 w-4" />
                                            </Button>

                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className={`h-8 w-8 rounded-sm ${activeNotePanel === "preview" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                                                onClick={() => setActiveNotePanel("preview")}
                                                title="Preview"
                                            >
                                                <FileText className="h-4 w-4" />
                                            </Button>

                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 rounded-sm text-zinc-700 hover:text-zinc-900"
                                                title={isSavingNote ? "Saving..." : "Save note"}
                                                disabled={isSavingNote || !isNoteDirty || !selectedTemplateId}
                                                onClick={() => {
                                                    void handleSaveTemplateNote();
                                                }}
                                            >
                                                {isSavingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                            </Button>

                                            {selectedTemplate ? (
                                                <PDFDownloadLink
                                                    document={<NoteDocument template={selectedTemplate} llmObject={noteDocumentData} />}
                                                    fileName={`${selectedTemplate.name.toLowerCase().replace(/\s+/g, "-")}.pdf`}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-sm p-0 text-zinc-700 hover:bg-transparent hover:text-zinc-900"
                                                    title="Download PDF"
                                                >
                                                    {({ loading }) =>
                                                        loading ? (
                                                            <span className="text-[10px] text-muted-foreground">...</span>
                                                        ) : (
                                                            <Download className="h-4 w-4" />
                                                        )
                                                    }
                                                </PDFDownloadLink>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 rounded-sm"
                                                    disabled
                                                    title="Download PDF"
                                                >
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className={`relative flex-1 min-h-0 p-4 ${activeMainTab === "note" ? "bg-white" : "bg-white/50 dark:bg-black/20"}`}>
                                {isMainPanelBusy && (
                                    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                )}

                                {activeMainTab === "transcript" ? (
                                    <LiveTranscriptPanel
                                        transcript={displayedTranscript}
                                        draftTranscript={draftTranscript}
                                        speakerRoles={speakerRoles}
                                        transcriptEndRef={transcriptEndRef}
                                    />
                                ) : activeMainTab === "note" ? (
                                    <div className="flex h-full min-h-0 flex-col gap-3">
                                        {noteTemplates.length === 0 && !isLoadingNoteTemplates ? (
                                            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                                                No active personal templates found. Activate templates in Note Studio to generate notes.
                                            </div>
                                        ) : null}

                                        <div className="flex-1 min-h-0 overflow-y-auto px-1">
                                            {activeNotePanel === "editor" ? (
                                                selectedTemplate ? (
                                                    <div className="space-y-4 pb-2">
                                                        {selectedTemplate.bodySchema.fields.map((field) => {
                                                            const currentValue = editableNoteData[field.key];

                                                            return (
                                                                <div key={field.key} className="space-y-1.5">
                                                                    <label className="text-sm font-medium text-foreground">{field.label}</label>

                                                                    {field.type === "boolean" ? (
                                                                        <Select
                                                                            value={String(currentValue ?? false)}
                                                                            onValueChange={(value) => handleNoteFieldChange(field.key, value === "true")}
                                                                        >
                                                                            <SelectTrigger className="w-full bg-white">
                                                                                <SelectValue placeholder="Select value" />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="true">True</SelectItem>
                                                                                <SelectItem value="false">False</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    ) : field.type === "number" ? (
                                                                        <Input
                                                                            type="number"
                                                                            value={typeof currentValue === "number" ? String(currentValue) : ""}
                                                                            onChange={(event) => {
                                                                                const next = event.target.value;
                                                                                handleNoteFieldChange(field.key, next === "" ? 0 : Number(next));
                                                                            }}
                                                                            className="bg-white"
                                                                        />
                                                                    ) : (
                                                                        <Textarea
                                                                            value={typeof currentValue === "string" ? currentValue : String(currentValue ?? "")}
                                                                            onChange={(event) => handleNoteFieldChange(field.key, event.target.value)}
                                                                            className="min-h-24 bg-white"
                                                                        />
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">
                                                        Select an active template to start editing note fields.
                                                    </p>
                                                )
                                            ) : generatedNoteText ? (
                                                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{generatedNoteText}</p>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    Choose a template and click Generate to create note text from this session transcript.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex h-full min-h-0 items-center justify-center rounded-xl border bg-background/70 p-8 text-center">
                                        <div className="max-w-md space-y-3">
                                            <div className="flex items-center justify-center gap-2 text-sm font-medium">
                                                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                                                Session Context
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                Use the transcript tab to watch live speech bubbles render in the large sheet.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-2 border-t bg-muted/10 text-xs text-muted-foreground text-center">
                                Review your note before use to ensure it accurately represents the visit
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <div className="border-t border-stone-200 bg-stone-50/95 backdrop-blur px-4 sm:px-5 py-2.5">
                <div className={`mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center ${isSessionFinalized ? "sm:justify-start" : "sm:justify-between"}`}>
                    <div className="flex min-w-0 items-center">
                        <div className="min-w-0 flex-1 overflow-x-auto">
                            <div className="inline-flex min-w-max items-center">
                                {finalizeTrackingTasks.map((task, index) => (
                                    <React.Fragment key={task.key}>
                                        {index > 0 && (
                                            <div className={`mx-1 h-px w-6 ${task.complete ? "bg-emerald-300" : "bg-red-300"}`} />
                                        )}

                                        <button
                                            type="button"
                                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${task.complete
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                                : "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"}`}
                                            disabled={isSessionFinalized || task.complete}
                                            onClick={() => {
                                                if (!isSessionFinalized && !task.complete) {
                                                    handleFinalizeTaskAction(task.key);
                                                }
                                            }}
                                            title={task.description}
                                            aria-label={`${task.label}: ${task.complete ? "complete" : "incomplete"}`}
                                        >
                                            <span className={`h-2.5 w-2.5 rounded-full ${task.complete ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden="true" />
                                            {task.label}
                                        </button>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    </div>

                    {!isSessionFinalized && (
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 rounded-full border border-stone-300 bg-white p-0 text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                                onClick={() => {
                                    void loadFinalizeChecklist();
                                }}
                                disabled={isFinalizeChecklistLoading || isFinalizingSession}
                                title="Refresh checklist"
                                aria-label="Refresh checklist"
                            >
                                {isFinalizeChecklistLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="default"
                                className="h-8 border border-black bg-black text-white hover:bg-stone-800 hover:text-white"
                                onClick={openFinalizeDialog}
                            >
                                Finalize Session
                            </Button>
                        </div>
                    )}
                </div>
            </div>
            </div>

            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="absolute z-30 h-14 w-6 -translate-y-1/2 rounded-r-none rounded-l-lg border-r-0 bg-background/95 shadow-sm transition-all duration-300"
                        style={{
                            top: pullTabTop ? `${pullTabTop}px` : "50%",
                            right: isChatPanelOpen ? "30rem" : "0.25rem",
                        }}
                        onClick={handleToggleChatPane}
                        aria-label={isChatPanelOpen ? "Collapse chat sidebar" : "Expand chat sidebar"}
                        aria-expanded={isChatPanelOpen}
                        aria-controls="clinical-chat-panel"
                    >
                        {isChatPanelOpen
                            ? <ChevronRight className="h-4 w-4" strokeWidth={2.75} />
                            : <ChevronLeft className="h-4 w-4" strokeWidth={2.75} />}
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                    {isChatPanelOpen ? "Hide chat sidebar" : "Show chat sidebar"}
                </TooltipContent>
            </Tooltip>

            <aside
                id="clinical-chat-panel"
                className={`h-full min-h-0 shrink-0 self-stretch border-l border-border/80 bg-card transition-all duration-300 ease-in-out ${isChatPanelOpen
                    ? "w-[30rem] translate-x-0 opacity-100"
                    : "w-0 translate-x-4 opacity-0 pointer-events-none"}`}
            >
                <div className={`flex h-full min-h-0 flex-col transition-opacity duration-200 ease-out ${isChatPanelContentVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                    <div className="flex items-center justify-between bg-background px-4 py-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                            New chat
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground">
                            <span className="text-xs">New chat</span>
                            <ChevronDown className="h-3 w-3" />
                        </Button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-hidden">
                        <AssistantRuntimeProvider runtime={chatRuntime}>
                            <Thread patientName={patientName} />
                        </AssistantRuntimeProvider>
                    </div>

                </div>
            </aside>

            <Dialog open={isProcessing} onOpenChange={() => {}}>
                <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>{uploadProgress === 100 ? "Session Saved" : "Finalizing Session"}</DialogTitle>
                        <DialogDescription>
                            {uploadProgress === 100
                                ? "Your recording has been successfully uploaded and linked to the patient record."
                                : "Please wait while we upload and secure your clinical recording."}
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
                        <DialogDescription>Audio is already attached to this appointment.</DialogDescription>
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

            <Dialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Finalize Clinical Session</DialogTitle>
                        <DialogDescription>
                            Complete all required tasks before ending this visit.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs">
                        <span className="text-stone-600">
                            {isSessionFinalized
                                ? "This session has been finalized."
                                : "Complete each checkpoint to finalize this session."}
                        </span>
                        {!isSessionFinalized && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 rounded-full border border-stone-300 bg-white p-0 text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                                onClick={() => {
                                    void loadFinalizeChecklist();
                                }}
                                disabled={isFinalizeChecklistLoading || isFinalizingSession}
                                title="Refresh checklist"
                                aria-label="Refresh checklist"
                            >
                                {isFinalizeChecklistLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            </Button>
                        )}
                    </div>

                    {isFinalizeChecklistLoading ? (
                        <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/20 py-8 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading checklist...
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="overflow-x-auto rounded-lg border bg-muted/20 p-3">
                                <div className="inline-flex min-w-max items-center">
                                    {finalizeTrackingTasks.map((task, index) => (
                                        <React.Fragment key={task.key}>
                                            {index > 0 && (
                                                <div className={`mx-1 h-px w-6 ${task.complete ? "bg-emerald-300" : "bg-red-300"}`} />
                                            )}

                                            <button
                                                type="button"
                                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${task.complete
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                                    : "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"}`}
                                                disabled={isSessionFinalized || task.complete}
                                                onClick={() => {
                                                    if (!isSessionFinalized && !task.complete) {
                                                        handleFinalizeTaskAction(task.key);
                                                    }
                                                }}
                                                title={task.description}
                                                aria-label={`${task.label}: ${task.complete ? "complete" : "incomplete"}`}
                                            >
                                                <span className={`h-2.5 w-2.5 rounded-full ${task.complete ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden="true" />
                                                {task.label}
                                            </button>
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>

                            {finalizeTasks.map((task) => (
                                <div key={task.key} className="rounded-lg border p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-foreground">{task.label}</p>
                                            <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
                                        </div>
                                        <Badge
                                            className={task.complete
                                                ? "shrink-0 border-emerald-300 bg-emerald-100 text-emerald-900"
                                                : "shrink-0 border-red-300 bg-red-100 text-red-900"}
                                            variant="outline"
                                        >
                                            <span className={`mr-1 inline-block h-2.5 w-2.5 rounded-full ${task.complete ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden="true" />
                                            {task.complete ? "Complete" : "Pending"}
                                        </Badge>
                                    </div>
                                </div>
                            ))}

                            {!canFinalizeSession && (
                                <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900">
                                    Complete remaining tasks to finalize this session.
                                </div>
                            )}

                            {canFinalizeSession && (
                                <div className="rounded-lg border border-emerald-300 bg-emerald-50/80 p-3 text-xs text-emerald-900">
                                    All requirements are complete. You can now finalize this clinical session.
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setIsFinalizeDialogOpen(false)}>
                            Close
                        </Button>
                        {!isSessionFinalized && (
                            <Button
                                type="button"
                                className="border border-black bg-black text-white hover:bg-stone-800 hover:text-white"
                                onClick={() => {
                                    void handleFinalizeSession();
                                }}
                                disabled={isFinalizeChecklistLoading || !canFinalizeSession || isFinalizingSession}
                            >
                                {isFinalizingSession ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Finalizing
                                    </>
                                ) : (
                                    "Finalize Session"
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isLinkPatientDialogOpen} onOpenChange={setIsLinkPatientDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Link patient to this session</DialogTitle>
                        <DialogDescription>Choose a patient to attach to this appointment.</DialogDescription>
                    </DialogHeader>

                    <div className="max-h-72 overflow-y-auto space-y-2">
                        {isLoadingPatients ? (
                            <div className="py-8 flex items-center justify-center text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading patients...
                            </div>
                        ) : linkablePatients.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">No patients found for this doctor yet.</div>
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
                        <AlertDialogTitle>Are you sure you want to delete this session?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete all transcripts, notes and documents associated with this session.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
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
