"use client";

import type { RefObject } from "react";
import type { TranscriptSegment } from "@/hooks/use-clinical-websocket";

interface LiveTranscriptPanelProps {
  transcript: TranscriptSegment[];
  draftTranscript: string;
  speakerRoles: Record<string, string>;
  speakerMapping: Record<string, string>;
  transcriptEndRef: RefObject<HTMLDivElement | null>;
}

export function LiveTranscriptPanel({
  transcript,
  draftTranscript,
  speakerRoles,
  speakerMapping,
  transcriptEndRef,
}: LiveTranscriptPanelProps) {
  const renderBubble = (
    text: string,
    side: "left" | "right",
    tone: "neutral" | "doctor" | "patient" | "draft",
    meta?: string,
  ) => {
    const alignment = side === "right" ? "items-end text-right" : "items-start text-left";
    const bubbleTone = {
      neutral: "border-border bg-background text-foreground",
      doctor: "border-sky-200 bg-sky-50 text-sky-950",
      patient: "border-emerald-200 bg-emerald-50 text-emerald-950",
      draft: "border-amber-200 bg-amber-50 text-amber-950",
    }[tone];

    return (
      <div className={`flex w-full flex-col gap-1 ${alignment}`}>
        {meta && <div className="text-[11px] text-muted-foreground">{meta}</div>}
        <div className={`max-w-[82%] rounded-2xl border px-4 py-3 shadow-sm ${bubbleTone}`}>
          <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col text-left">
      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-1 sm:px-3 sm:py-2">
        {transcript.length === 0 && !draftTranscript ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            Start recording from the header to stream audio into the Python transcription service.
          </div>
        ) : null}

        {transcript.map((segment, index) => {
          const mappedSpeakerName = speakerMapping[segment.speaker] || segment.speaker;
          const role = segment.role || speakerRoles[segment.speaker] || mappedSpeakerName;
          const roleText = role.toLowerCase();
          const speakerNumMatch = /^speaker\s*(\d+)$/i.exec(role.trim());
          const speakerNum = speakerNumMatch ? parseInt(speakerNumMatch[1], 10) : null;

          let side: "left" | "right";
          let tone: "neutral" | "doctor" | "patient" | "draft";
          if (roleText.includes("doctor") || roleText.includes("clinician")) {
            side = "right";
            tone = "doctor";
          } else if (roleText.includes("patient")) {
            side = "left";
            tone = "patient";
          } else if (speakerNum !== null) {
            // Provisional diarization labels: alternate sides without claiming Doctor/Patient yet.
            side = speakerNum % 2 === 0 ? "right" : "left";
            tone = "neutral";
          } else {
            side = "left";
            tone = "neutral";
          }
          const meta = `${mappedSpeakerName}${typeof segment.start === "number" && typeof segment.end === "number" ? ` · ${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s` : ""}`;

          return (
            <div key={`${segment.speaker}-${segment.start}-${segment.end}-${index}`} data-segment-key={`${segment.speaker}-${segment.start}-${segment.end}`}>
              {renderBubble(segment.text, side, tone, meta)}
            </div>
          );
        })}

        <div ref={transcriptEndRef} />
      </div>
      <div className="border-t bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-3">
        {renderBubble(
          draftTranscript || "Listening... audio buffer is currently empty.",
          "left",
          "draft",
          "Processing Buffer",
        )}
      </div>
    </div>
  );
}
