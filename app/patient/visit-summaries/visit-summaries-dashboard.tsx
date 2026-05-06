"use client";

import React, { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import {
  Calendar,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Filter,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";

import {
  deleteVisitSummary,
  type PatientVisitSummaryItem,
} from "@/app/actions/fetchers";

interface VisitSummariesDashboardProps {
  initialSummaries: PatientVisitSummaryItem[];
}

type SortOption = "newest" | "oldest";
type DateFilter = "all" | "last30" | "last90" | "last6m" | "last1y";

export function VisitSummariesDashboard({
  initialSummaries,
}: VisitSummariesDashboardProps) {
  const [summaries, setSummaries] = useState<PatientVisitSummaryItem[]>(initialSummaries);
  const [searchQuery, setSearchQuery] = useState("");
  const [doctorFilter, setDoctorFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [isPending, startTransition] = useTransition();

  const uniqueDoctors = useMemo(() => {
    const docs = new Set<string>();
    initialSummaries.forEach((s) => docs.add(s.doctorName));
    return Array.from(docs).sort();
  }, [initialSummaries]);

  const filteredSummaries = useMemo(() => {
    let result = [...summaries];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.reason.toLowerCase().includes(q) ||
          s.doctorName.toLowerCase().includes(q) ||
          format(new Date(s.appointmentDate), "MMMM d, yyyy")
            .toLowerCase()
            .includes(q)
      );
    }

    // Doctor filter
    if (doctorFilter !== "all") {
      result = result.filter((s) => s.doctorName === doctorFilter);
    }

    // Date filter
    const now = new Date();
    if (dateFilter === "last30") {
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      result = result.filter((s) => new Date(s.appointmentDate) >= cutoff);
    } else if (dateFilter === "last90") {
      const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      result = result.filter((s) => new Date(s.appointmentDate) >= cutoff);
    } else if (dateFilter === "last6m") {
      const cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      result = result.filter((s) => new Date(s.appointmentDate) >= cutoff);
    } else if (dateFilter === "last1y") {
      const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      result = result.filter((s) => new Date(s.appointmentDate) >= cutoff);
    }

    // Sort
    result.sort((a, b) => {
      const da = new Date(a.appointmentDate).getTime();
      const db = new Date(b.appointmentDate).getTime();
      return sortBy === "newest" ? db - da : da - db;
    });

    return result;
  }, [summaries, searchQuery, doctorFilter, dateFilter, sortBy]);

  const hasActiveFilters =
    searchQuery || doctorFilter !== "all" || dateFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setDoctorFilter("all");
    setDateFilter("all");
    setSortBy("newest");
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteVisitSummary(id);
      if (result.success) {
        setSummaries((prev) => prev.filter((s) => s.id !== id));
        toast.success("Visit summary deleted", {
          description: "The note has been removed from your records.",
        });
      } else {
        toast.error("Failed to delete", {
          description: result.error || "Something went wrong. Please try again.",
        });
      }
    });
  };

  return (
    <div className="h-full flex-1 flex-col space-y-0 md:flex">
      {/* Header */}
      <header className="px-4 sm:px-5 py-3 border-b-2 border-border bg-background/95 backdrop-blur z-10">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-md border-2 border-black bg-yellow-300 flex items-center justify-center">
                <FileText className="h-5 w-5 text-black stroke-2" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                    After Visit Summaries
                  </h1>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-2 border-border bg-muted text-foreground font-semibold"
                  >
                    Finalized Notes
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground mt-0.5 font-medium truncate">
                  View and download notes finalized by your care team.
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <Badge
              variant="outline"
              className="gap-1.5 py-1 border-2 border-border bg-muted/70"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>{summaries.length} Summaries</span>
            </Badge>
            <Badge
              variant="outline"
              className="gap-1.5 py-1 border-2 border-border bg-muted/70"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Secure PDF</span>
            </Badge>
          </div>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="px-4 sm:px-5 pt-4 pb-2 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by reason, doctor, or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Select value={doctorFilter} onValueChange={setDoctorFilter}>
              <SelectTrigger className="h-9 w-[180px]">
                <User className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filter by doctor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Doctors</SelectItem>
                {uniqueDoctors.map((doc) => (
                  <SelectItem key={doc} value={doc}>
                    {doc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="h-9 w-[160px]">
                <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="last30">Last 30 Days</SelectItem>
                <SelectItem value="last90">Last 90 Days</SelectItem>
                <SelectItem value="last6m">Last 6 Months</SelectItem>
                <SelectItem value="last1y">Last Year</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <Filter className="h-3.5 w-3.5" />
                  Sort
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSortBy("newest")}>
                  Newest First {sortBy === "newest" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("oldest")}>
                  Oldest First {sortBy === "oldest" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 text-muted-foreground"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span>
              Showing {filteredSummaries.length} of {summaries.length}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 sm:px-5 pb-8 space-y-4">
        {summaries.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <h2 className="text-lg font-semibold text-foreground">
                No finalized visit summaries yet
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Visit summaries will appear here after a completed appointment with a finalized note.
              </p>
            </CardContent>
          </Card>
        ) : filteredSummaries.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Search className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <h2 className="text-lg font-semibold text-foreground">
                No matching summaries
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Try adjusting your filters or search query.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider w-[180px]">
                    Visit Date
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Doctor
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Reason
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider w-[140px]">
                    Finalized
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-right w-[160px]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummaries.map((summary) => (
                  <TableRow
                    key={summary.id}
                    className="group hover:bg-muted/30 transition-colors"
                  >
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {format(new Date(summary.appointmentDate), "MMM d, yyyy")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(summary.appointmentDate), "EEEE")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{summary.doctorName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{summary.reason}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs bg-muted/60 border-border">
                        {format(
                          new Date(summary.finalizedAt ?? summary.appointmentDate),
                          "MMM d, yyyy"
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-100">
                        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                          <a
                            href={summary.viewUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">View</span>
                          </a>
                        </Button>
                        <Button asChild size="sm" className="h-8 gap-1.5">
                          <a
                            href={summary.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Download</span>
                          </a>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              disabled={isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Visit Summary</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove the visit note from your records.
                                The appointment will remain, but the note will be deleted.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(summary.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
