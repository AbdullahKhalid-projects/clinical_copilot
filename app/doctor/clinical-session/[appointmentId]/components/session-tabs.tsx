"use client";

import { AudioLines, Mic, PenLine, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ClinicalSessionTab = "context" | "transcript" | "note";

type SessionTabsProps = {
  activeTab: ClinicalSessionTab;
  onTabChange: (tab: ClinicalSessionTab) => void;
};

export function SessionTabs({ activeTab, onTabChange }: SessionTabsProps) {
  return (
    <div className="flex items-center gap-1.5 bg-transparent">
      <Button
        type="button"
        variant="ghost"
        onClick={() => onTabChange("context")}
        className={`group rounded-lg px-3 h-9 border transition-colors ${activeTab === "context" ? "bg-muted text-foreground border-transparent" : "text-foreground border-transparent hover:bg-muted"}`}
      >
        <SlidersHorizontal className={activeTab === "context" ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-muted-foreground group-hover:text-emerald-500"} />
        Context
      </Button>
      <div className="h-6 w-px bg-border/70" />
      <Button
        type="button"
        variant="ghost"
        onClick={() => onTabChange("transcript")}
        className={`group rounded-lg px-3 h-9 border transition-colors ${activeTab === "transcript" ? "bg-muted text-foreground border-transparent" : "text-foreground border-transparent hover:bg-muted"}`}
      >
        <AudioLines className={activeTab === "transcript" ? "h-4 w-4 text-violet-600" : "h-4 w-4 text-muted-foreground group-hover:text-violet-500"} />
        Transcript
      </Button>
      <div className="h-6 w-px bg-border/70" />
      <Button
        type="button"
        variant="ghost"
        onClick={() => onTabChange("note")}
        className={`group rounded-lg px-3 h-9 border transition-colors ${activeTab === "note" ? "bg-muted text-foreground border-transparent" : "text-foreground border-transparent hover:bg-muted"}`}
      >
        <PenLine className={activeTab === "note" ? "h-4 w-4 text-blue-600" : "h-4 w-4 text-muted-foreground group-hover:text-blue-500"} />
        Note
      </Button>
    </div>
  );
}
