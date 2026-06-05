"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShifaActionPillProps = {
  disabled?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
};

export function ShifaActionPill({
  disabled = false,
  isLoading = false,
  onClick,
  title,
  className,
}: ShifaActionPillProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        "group h-auto rounded-full border-0 bg-transparent p-0 shadow-none hover:bg-transparent",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      <span className="inline-flex rounded-full bg-[length:200%_200%] bg-[linear-gradient(110deg,#20c5e8_0%,#4fd29e_30%,#d5d400_60%,#20c5e8_100%)] p-[2px] shadow-[0_0_0_1px_rgba(32,197,232,0.18),0_8px_20px_rgba(120,190,80,0.14)] transition-[background-position,transform,box-shadow] duration-500 ease-out group-hover:bg-[position:100%_50%] group-hover:shadow-[0_0_0_1px_rgba(32,197,232,0.24),0_12px_24px_rgba(120,190,80,0.22)] group-hover:scale-[1.02]">
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-[#1f1f1f]">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 fill-current" />
          )}
          Ask Shifa
        </span>
      </span>
    </Button>
  );
}
