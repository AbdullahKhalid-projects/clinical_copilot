"use client";

import * as React from "react";
import { Loader2, Mic, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

type VoiceEnrollmentProps = {
  doctorId: string;
};

const RECORD_SECONDS = 10;

export function VoiceEnrollment({ doctorId }: VoiceEnrollmentProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [secondsRemaining, setSecondsRemaining] = React.useState(RECORD_SECONDS);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const recordedChunksRef = React.useRef<Blob[]>([]);
  const stopTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = React.useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const stopTracks = React.useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const uploadRecording = React.useCallback(
    async (audioBlob: Blob) => {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, "voice-enrollment.webm");
        formData.append("doctorId", doctorId);

        const response = await fetch("/api/doctor/voice-enroll", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Failed to enroll voice");
        }

        toast({
          title: "Voice enrolled",
          description: "Your voice embedding has been saved successfully.",
        });
      } catch (error) {
        console.error("Voice enrollment failed", error);
        toast({
          title: "Voice enrollment failed",
          description: error instanceof Error ? error.message : "Could not save voice embedding.",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    },
    [doctorId, toast],
  );

  const stopRecording = React.useCallback(() => {
    clearTimers();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopTracks();
      setIsRecording(false);
      setSecondsRemaining(RECORD_SECONDS);
    }
  }, [clearTimers, stopTracks]);

  const startRecording = React.useCallback(async () => {
    if (isRecording || isUploading) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stopTracks();
        setIsRecording(false);
        setSecondsRemaining(RECORD_SECONDS);
        if (blob.size > 0) {
          void uploadRecording(blob);
        }
      };

      recorder.start();
      setIsRecording(true);
      setSecondsRemaining(RECORD_SECONDS);

      countdownIntervalRef.current = setInterval(() => {
        setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);

      stopTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, RECORD_SECONDS * 1000);

      toast({
        title: "Recording started",
        description: "Speak naturally for 10 seconds.",
      });
    } catch (error) {
      console.error("Failed to start recording", error);
      stopTracks();
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to enroll your voice.",
        variant: "destructive",
      });
    }
  }, [isRecording, isUploading, stopRecording, stopTracks, toast, uploadRecording]);

  React.useEffect(() => {
    return () => {
      clearTimers();
      stopTracks();
    };
  }, [clearTimers, stopTracks]);

  const progressValue = ((RECORD_SECONDS - secondsRemaining) / RECORD_SECONDS) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice Enrollment</CardTitle>
        <CardDescription>Record exactly 10 seconds so your voice can be recognized during live sessions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={isRecording ? progressValue : 0} />
        <div className="text-sm text-muted-foreground">
          {isRecording ? `${secondsRemaining}s remaining` : "Press Start to record"}
        </div>
        <div className="flex gap-2">
          <Button onClick={startRecording} disabled={isRecording || isUploading}>
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
            {isUploading ? "Uploading..." : "Start 10s Recording"}
          </Button>
          <Button variant="outline" onClick={stopRecording} disabled={!isRecording || isUploading}>
            <StopCircle className="mr-2 h-4 w-4" />
            Stop
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
