import { FileText, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function VisitSummariesLoading() {
  return (
    <div className="h-full flex-1 flex-col space-y-0 md:flex">
      {/* Header Skeleton */}
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 rounded-md border-2 border-black bg-yellow-300 flex items-center justify-center">
            <FileText className="h-5 w-5 text-black stroke-2" />
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
      </header>

      {/* Filters Bar Skeleton */}
      <div className="px-4 sm:px-5 pt-4 pb-2 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-9 w-[180px]" />
            <Skeleton className="h-9 w-[160px]" />
            <Skeleton className="h-9 w-[100px]" />
          </div>
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="px-4 sm:px-5 pb-8 space-y-4">
        <div className="rounded-lg border overflow-hidden">
          {/* Table Header */}
          <div className="bg-muted/50 border-b">
            <div className="flex items-center px-4 py-3 gap-4">
              <div className="w-[180px]">
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="flex-1">
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="flex-1">
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="w-[140px]">
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="w-[160px] flex justify-end">
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
          {/* Table Rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center px-4 py-4 gap-4 border-b last:border-b-0"
            >
              <div className="w-[180px] space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex-1 flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="w-[140px]">
                <Skeleton className="h-5 w-24" />
              </div>
              <div className="w-[160px] flex justify-end gap-1.5">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
