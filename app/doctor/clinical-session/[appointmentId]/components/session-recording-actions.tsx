"use client";

import { ChangeEvent, RefObject } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioRecorderWithVisualizer } from "@/components/audio-recorder-visualizer";

interface SessionRecordingActionsProps {
  isUploading: boolean;
  selectedMicrophoneId?: string;
  onStart: (stream: MediaStream) => void;
  onPauseChange: (paused: boolean) => void;
  onDiscard: () => void;
  onStop: (blob: Blob) => void;
  onManualUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  uploadInputRef: RefObject<HTMLInputElement | null>;
}

export function SessionRecordingActions({
  isUploading,
  selectedMicrophoneId,
  onStart,
  onPauseChange,
  onDiscard,
  onStop,
  onManualUpload,
  uploadInputRef,
}: SessionRecordingActionsProps) {
  return (
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
        onChange={onManualUpload}
      />
      <AudioRecorderWithVisualizer
        onStart={onStart}
        onPauseChange={onPauseChange}
        onDiscard={onDiscard}
        onStop={onStop}
        isUploading={isUploading}
        selectedMicrophoneId={selectedMicrophoneId}
      />
    </div>
  );
}
