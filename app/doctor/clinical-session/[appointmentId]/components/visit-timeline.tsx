"use client";

import { format } from "date-fns";

import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";

type VisitTimelineItem = {
  id: string;
  date: Date;
  status: string;
  reason: string | null;
  doctorName: string | null;
  soapNoteUrl: string | null;
  soapNote?: unknown;
};

type VisitTimelineProps = {
  visits: VisitTimelineItem[];
};

export function VisitTimeline({ visits }: VisitTimelineProps) {
  return (
    <div className="overflow-x-auto pb-2">
      <Timeline
        defaultValue={visits.length}
        orientation="horizontal"
        className="min-w-[620px] pt-2"
      >
        {visits.map((visit, index) => {
          const doctorLabel = visit.doctorName?.trim()
            ? `Dr. ${visit.doctorName.trim()}`
            : "Doctor unavailable";
          const reasonLabel = visit.reason?.trim() || "Completed appointment";
          const isClickable = Boolean(visit.soapNote || visit.soapNoteUrl);
          const visitSummaryUrl = `/api/doctor/visit-summaries/${visit.id}/download?mode=view`;

          return (
            <TimelineItem
              key={visit.id}
              step={index + 1}
              className="min-w-0 group-data-[orientation=horizontal]/timeline:not-last:pe-1"
            >
              {isClickable ? (
                <a
                  href={visitSummaryUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open SOAP note for ${doctorLabel} on ${format(new Date(visit.date), "MMM d, yyyy, h:mm a")}`}
                  className="absolute inset-0 z-10 rounded-md"
                />
              ) : null}

              <div className={`relative ${isClickable ? "cursor-pointer" : ""}`}>
                <TimelineHeader>
                  <TimelineSeparator className="bg-[#1C1917] group-data-completed/timeline-item:bg-[#1C1917] group-data-[orientation=horizontal]/timeline:w-[calc(100%-0.4rem)] group-data-[orientation=horizontal]/timeline:translate-x-2.5" />
                  <TimelineDate className="mb-1 text-[0.74rem] font-medium text-[#7A6A63]">
                    {format(new Date(visit.date), "MMM d, yyyy, h:mm a")}
                  </TimelineDate>
                  <TimelineTitle className="truncate text-[0.84rem] font-semibold tracking-[-0.02em] text-[#1F1714] xl:text-[0.92rem]">
                    {doctorLabel}
                  </TimelineTitle>
                  <TimelineIndicator className="border-[#F7F3EE] bg-[#111111] shadow-[0_0_0_1px_rgba(17,17,17,0.10)]" />
                </TimelineHeader>
                <TimelineContent className="mt-1 max-w-[7rem] text-[0.72rem] leading-4 text-[#7A6A63]">
                  {reasonLabel}
                </TimelineContent>
              </div>
            </TimelineItem>
          );
        })}
      </Timeline>
    </div>
  );
}
