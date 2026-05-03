"use client";

import type { RefObject } from "react";
import type { TranscriptSegment } from "@/hooks/use-smart-chunker";

interface LiveTranscriptPanelProps {
  transcript: TranscriptSegment[];
  speakerRoles: Record<string, string>;
  transcriptEndRef: RefObject<HTMLDivElement | null>;
}

export function LiveTranscriptPanel({
  transcript,
  speakerRoles,
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
        {transcript.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            Start recording to transcribe the consultation with Gemma.
          </div>
        ) : null}

        {transcript.map((segment, index) => {
          const role = segment.role || speakerRoles[segment.speaker] || segment.speaker;
          const roleText = role.toLowerCase();
          const side = roleText.includes("doctor") || roleText.includes("clinician") ? "right" : "left";
          const tone = roleText.includes("doctor") || roleText.includes("clinician")
            ? "doctor"
            : roleText.includes("patient")
              ? "patient"
              : "neutral";
          const meta = `${segment.speaker}${typeof segment.start === "number" && typeof segment.end === "number" ? ` · ${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s` : ""}`;

          return (
            <div key={`${segment.speaker}-${segment.start}-${segment.end}-${index}`}>
              {renderBubble(segment.text, side, tone, meta)}
            </div>
          );
        })}

        <div ref={transcriptEndRef} />
      </div>
    </div>
  );
}
