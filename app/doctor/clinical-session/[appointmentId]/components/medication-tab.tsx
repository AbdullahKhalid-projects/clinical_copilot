"use client";

import * as React from "react";
import {
  Loader2,
  Moon,
  Plus,
  ShoppingBag,
  Sun,
  Sunset,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShifaActionPill } from "@/components/shifa-action-pill";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { MedicationCatalogItem } from "@/lib/medicine-catalog";
import {
  getMedicationCatalogForSession,
  type MedicationPrescriptionSummary,
  type MedicationSafetyReviewItemResult,
} from "../../actions";

type MedicationSlot = "day" | "noon" | "night";
export type MedicationScheduleCounts = Record<MedicationSlot, number>;

export type MedicationDraftSelection = {
  draftId: string;
  medication: MedicationCatalogItem;
  durationWeeks: number;
  scheduleCounts: MedicationScheduleCounts;
};

type MedicationTabProps = {
  appointmentId: string;
  hasLinkedPatient: boolean;
  currentPrescriptions: MedicationPrescriptionSummary[];
  draftSelections: MedicationDraftSelection[];
  onDraftSelectionsChange: React.Dispatch<React.SetStateAction<MedicationDraftSelection[]>>;
  safetyReviewByDraftId: Record<string, MedicationSafetyReviewItemResult>;
  isSafetyReviewRunning: boolean;
  reviewingDraftIds?: string[];
  onAskShifaForDraft?: (draftId: string) => void;
};

type MedicationCatalogCard = {
  medication: MedicationCatalogItem;
  scheduleCounts: MedicationScheduleCounts;
};

const SLOT_META: Array<{
  key: MedicationSlot;
  label: string;
  activeClass: string;
  tintClass: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "day", label: "Morning", activeClass: "bg-amber-400", tintClass: "border-amber-200 bg-amber-50 text-amber-950", icon: Sun },
  { key: "noon", label: "Afternoon", activeClass: "bg-orange-400", tintClass: "border-orange-200 bg-orange-50 text-orange-950", icon: Sunset },
  { key: "night", label: "Evening", activeClass: "bg-zinc-800", tintClass: "border-zinc-300 bg-zinc-100 text-zinc-950", icon: Moon },
];

const EMPTY_SCHEDULE_COUNTS: MedicationScheduleCounts = {
  day: 0,
  noon: 0,
  night: 0,
};

const DEFAULT_DRAFT_SCHEDULE: MedicationScheduleCounts = {
  day: 1,
  noon: 1,
  night: 1,
};

const DURATION_OPTIONS = [1, 2, 3, 4, 8];

function formatMedicationSubtitle(medication: MedicationCatalogItem): string {
  return [medication.strength, medication.form].filter(Boolean).join(" - ") || "Compound not specified";
}

function formatMedicationGenericLine(medication: MedicationCatalogItem): string | null {
  const generic = medication.genericName?.trim() || "";
  if (!generic) {
    return null;
  }

  return generic;
}

function formatMedicationIngredientLine(medication: MedicationCatalogItem): string | null {
  if (!Array.isArray(medication.activeIngredients) || medication.activeIngredients.length === 0) {
    return null;
  }

  const visible = medication.activeIngredients.slice(0, 2);
  const suffix =
    medication.activeIngredients.length > visible.length
      ? ` +${medication.activeIngredients.length - visible.length} more`
      : "";

  return `${visible.join(", ")}${suffix}`;
}

function formatMedicationInsightLine(medication: MedicationCatalogItem): string | null {
  return formatMedicationGenericLine(medication) ?? formatMedicationIngredientLine(medication);
}

function inferSlotsFromFrequency(frequency: string): MedicationSlot[] {
  const normalized = frequency.toLowerCase();
  const next = new Set<MedicationSlot>();

  if (normalized.includes("once") || normalized.includes("morning") || normalized.includes("day") || normalized.includes("am")) {
    next.add("day");
  }

  if (normalized.includes("noon") || normalized.includes("afternoon") || normalized.includes("lunch") || normalized.includes("mid")) {
    next.add("noon");
  }

  if (normalized.includes("night") || normalized.includes("evening") || normalized.includes("bed") || normalized.includes("pm")) {
    next.add("night");
  }

  if (normalized.includes("twice")) {
    next.add("day");
    next.add("night");
  }

  if (normalized.includes("three")) {
    next.add("day");
    next.add("noon");
    next.add("night");
  }

  if (next.size === 0) {
    next.add("day");
  }

  return Array.from(next);
}

function countsFromSlots(slots: MedicationSlot[]): MedicationScheduleCounts {
  return {
    day: slots.includes("day") ? 1 : 0,
    noon: slots.includes("noon") ? 1 : 0,
    night: slots.includes("night") ? 1 : 0,
  };
}

function countsFromFrequency(frequency: string): MedicationScheduleCounts {
  const compactMatch = frequency.match(/^\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (compactMatch) {
    return {
      day: Number(compactMatch[1] || 0),
      noon: Number(compactMatch[2] || 0),
      night: Number(compactMatch[3] || 0),
    };
  }

  return countsFromSlots(inferSlotsFromFrequency(frequency));
}

function formatScheduleSummary(counts: MedicationScheduleCounts): string {
  return `${counts.day}-${counts.noon}-${counts.night}`;
}

function MedicationScheduleLights({
  value,
  onCycle,
}: {
  value: MedicationScheduleCounts;
  onCycle?: (slot: MedicationSlot) => void;
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-3 gap-2">
      {SLOT_META.map((slot) => {
        const count = value[slot.key] ?? 0;
        const Icon = slot.icon;

        return (
          <button
            key={slot.key}
            type="button"
            onClick={() => onCycle?.(slot.key)}
            className={cn(
              "flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border px-2 transition-colors focus-visible:ring-0 focus-visible:outline-none",
              onCycle ? "cursor-pointer" : "cursor-default",
              slot.tintClass,
              count === 0 ? "opacity-70" : "",
            )}
            title={slot.label}
          >
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]">{slot.label}</span>
            </span>
            <span className="ml-auto flex shrink-0 items-center justify-end gap-1">
              {Array.from({ length: 3 }).map((_, index) => (
                <span
                  key={`${slot.key}-${index}`}
                  className={cn(
                    "h-2.5 w-2.5 rounded-full border transition-all",
                    index < count ? `${slot.activeClass} border-transparent` : "border-border bg-background",
                  )}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MedicationCatalogDetailsDialog({
  medication,
  open,
  onOpenChange,
}: {
  medication: MedicationCatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!medication) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <div className="p-5">
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl">{medication.drugName}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {formatMedicationSubtitle(medication)}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{medication.prescriptionRequired ? "Prescription" : "Over the Counter"}</Badge>
              {medication.ageRestriction ? <Badge variant="outline">{medication.ageRestriction}</Badge> : null}
              {medication.price ? <Badge variant="outline">PKR {medication.price}</Badge> : null}
            </div>

            {formatMedicationGenericLine(medication) ? (
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Generic
                </div>
                <p className="mt-2 text-sm text-foreground">{formatMedicationGenericLine(medication)}</p>
              </div>
            ) : null}

            {formatMedicationIngredientLine(medication) ? (
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Active Ingredients
                </div>
                <p className="mt-2 text-sm text-foreground">{formatMedicationIngredientLine(medication)}</p>
              </div>
            ) : null}

            <div className="grid gap-3">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Indication
                </div>
                <p className="mt-2 text-sm text-foreground">
                  {medication.indication || "No indication details available."}
                </p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Side Effects
                </div>
                <p className="mt-2 text-sm text-foreground">
                  {medication.sideEffects || "No side effect details available."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {medication.manufacturer ? <Badge variant="outline">{medication.manufacturer}</Badge> : null}
              {medication.availableIn ? <Badge variant="outline">{medication.availableIn}</Badge> : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MedicationListItem({
  title,
  subtitle,
  doctorLabel,
  scheduleCounts,
  onRemove,
  badge,
  onOpenDetails,
}: {
  title: string;
  subtitle: string;
  doctorLabel: string | null;
  scheduleCounts: MedicationScheduleCounts;
  onRemove?: () => void;
  badge?: React.ReactNode;
  onOpenDetails?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onDoubleClick={() => onOpenDetails?.()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails?.();
        }
      }}
      className="group flex w-full min-w-0 items-center gap-3 rounded-2xl bg-card text-left transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{title}</div>
            <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            {badge}
            {onRemove ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
          <MedicationScheduleLights value={scheduleCounts} />
          {doctorLabel ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserRound className="h-3.5 w-3.5" />
              <span className="truncate">{doctorLabel}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MedicationTab({
  appointmentId,
  hasLinkedPatient,
  currentPrescriptions,
  draftSelections,
  onDraftSelectionsChange,
  safetyReviewByDraftId,
  isSafetyReviewRunning,
  reviewingDraftIds = [],
  onAskShifaForDraft,
}: MedicationTabProps) {
  const { toast } = useToast();
  const [isCatalogDialogOpen, setIsCatalogDialogOpen] = React.useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = React.useState(false);
  const [catalog, setCatalog] = React.useState<MedicationCatalogItem[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedMedicationId, setSelectedMedicationId] = React.useState<string | null>(null);
  const [currentMedicationSlotOverrides] = React.useState<Record<string, MedicationScheduleCounts>>({});
  const [detailMedication, setDetailMedication] = React.useState<MedicationCatalogItem | null>(null);
  const hasLoadedCatalogRef = React.useRef(false);
  const addedMedicationIds = React.useMemo(
    () => new Set(draftSelections.map((draft) => draft.medication.id)),
    [draftSelections],
  );

  const loadCatalog = React.useCallback(async () => {
    setIsCatalogLoading(true);
    try {
      const result = await getMedicationCatalogForSession(appointmentId);
      if (!result.success) {
        throw new Error(result.error || "Could not load medication catalog.");
      }

      setCatalog(result.medications);
      hasLoadedCatalogRef.current = true;

      if (result.medications.length > 0) {
        setSelectedMedicationId((prev) => prev ?? result.medications[0].id);
      }
    } catch (error) {
      toast({
        title: "Medication catalog unavailable",
        description: error instanceof Error ? error.message : "Could not load medications.",
        variant: "destructive",
      });
    } finally {
      setIsCatalogLoading(false);
    }
  }, [appointmentId, toast]);

  React.useEffect(() => {
    if (!isCatalogDialogOpen || hasLoadedCatalogRef.current) {
      return;
    }

    void loadCatalog();
  }, [isCatalogDialogOpen, loadCatalog]);

  React.useEffect(() => {
    const handleOpenCatalog = () => {
      setIsCatalogDialogOpen(true);
    };

    window.addEventListener("clinical-session:open-medication-catalog", handleOpenCatalog);
    return () => {
      window.removeEventListener("clinical-session:open-medication-catalog", handleOpenCatalog);
    };
  }, []);

  const filteredCatalog = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return catalog;
    }

    return catalog.filter((medication) => {
      const haystack = [
        medication.drugName,
        medication.manufacturer,
        medication.strength,
        medication.form,
        medication.indication,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [catalog, searchQuery]);

  React.useEffect(() => {
    if (filteredCatalog.length === 0) {
      setSelectedMedicationId(null);
      return;
    }

    if (!selectedMedicationId || !filteredCatalog.some((medication) => medication.id === selectedMedicationId)) {
      setSelectedMedicationId(filteredCatalog[0].id);
    }
  }, [filteredCatalog, selectedMedicationId]);

  const currentMedicationCards = React.useMemo<MedicationCatalogCard[]>(() => {
    return currentPrescriptions.map((prescription) => ({
      medication: {
        id: prescription.id,
        drugName: prescription.name,
        drugNameNormalized: prescription.name.toLowerCase(),
        manufacturer: null,
        strength: prescription.medicineStrength,
        form: prescription.medicineForm,
        genericName: null,
        activeIngredients: [],
        primekgQueryTerms: [],
        matchConfidence: null,
        mappingNotes: null,
        indication: null,
        sideEffects: null,
        availableIn: null,
        ageRestriction: null,
        prescriptionRequired: true,
        price: null,
        imageUrl: prescription.medicineImageUrl,
        source: "database",
      },
      scheduleCounts: countsFromFrequency(prescription.frequency),
    }));
  }, [currentPrescriptions]);

  const handleAddDraftMedication = React.useCallback((medication: MedicationCatalogItem) => {
    if (addedMedicationIds.has(medication.id)) {
      toast({
        title: "Already added",
        description: `${medication.drugName} is already in the prescribing list.`,
      });
      return;
    }

    setSelectedMedicationId(medication.id);

    const draftMedication: MedicationDraftSelection = {
      draftId: `${medication.id}-${Date.now()}`,
      medication,
      durationWeeks: 2,
      scheduleCounts: { ...DEFAULT_DRAFT_SCHEDULE },
    };

    onDraftSelectionsChange((prev) => [draftMedication, ...prev]);
    toast({
      title: "Medication added",
      description: `${medication.drugName} is ready for dosage and duration setup.`,
    });
  }, [addedMedicationIds, onDraftSelectionsChange, toast]);

  const updateDraftDuration = React.useCallback((draftId: string, durationWeeks: number) => {
    onDraftSelectionsChange((prev) =>
      prev.map((draft) => (draft.draftId === draftId ? { ...draft, durationWeeks } : draft)),
    );
  }, [onDraftSelectionsChange]);

  const cycleDraftScheduleCount = React.useCallback((draftId: string, slot: MedicationSlot) => {
    onDraftSelectionsChange((prev) =>
      prev.map((draft) => {
        if (draft.draftId !== draftId) {
          return draft;
        }

        const currentCount = draft.scheduleCounts[slot] ?? 0;
        return {
          ...draft,
          scheduleCounts: {
            ...draft.scheduleCounts,
            [slot]: (currentCount + 1) % 4,
          },
        };
      }),
    );
  }, [onDraftSelectionsChange]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!hasLinkedPatient ? (
        <div className="flex flex-1 min-h-0 items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Link a patient before staging prescriptions for this session.
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-1 pb-2 pr-4">
            <section className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Current Medications</h3>
                  <p className="text-xs text-muted-foreground">
                    Existing patient prescriptions appear first so the doctor can prescribe with full context.
                  </p>
                </div>
                <Badge variant="outline" className="border-border bg-muted/40 text-xs">
                  {currentMedicationCards.length}
                </Badge>
              </div>

              {currentPrescriptions.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                  No active prescriptions are linked to this patient yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {currentPrescriptions.map((prescription, index) => (
                    <Card key={prescription.id} className="gap-0 overflow-hidden py-0">
                      <div className="p-4">
                        <MedicationListItem
                          title={prescription.name}
                          subtitle={
                            [prescription.medicineStrength, prescription.medicineForm].filter(Boolean).join(" - ")
                            || prescription.dosage
                          }
                          doctorLabel={prescription.prescribedBy}
                          scheduleCounts={currentMedicationSlotOverrides[prescription.id] ?? currentMedicationCards[index]?.scheduleCounts ?? EMPTY_SCHEDULE_COUNTS}
                          badge={<Badge variant="outline">{prescription.status}</Badge>}
                          onOpenDetails={() => setDetailMedication(currentMedicationCards[index]?.medication ?? null)}
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <div className="space-y-3">
              <Separator />
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <ShoppingBag className="h-3.5 w-3.5" />
                Now Prescribing
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Staged Medications</h3>
                  <p className="text-xs text-muted-foreground">
                    Set duration and a light-based schedule directly here.
                  </p>
                </div>
                <Badge variant="outline" className="border-border bg-muted/40 text-xs">
                  {draftSelections.length}
                </Badge>
              </div>

              {draftSelections.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                  Nothing staged yet. Use the <span className="font-medium text-foreground">Add Medication</span> button in the top bar to start building the prescription list.
                </div>
              ) : (
                <div className="space-y-4">
                  {draftSelections.map((draft) => {
                    const safetyReview = safetyReviewByDraftId[draft.draftId];
                    const isDraftReviewRunning = reviewingDraftIds.includes(draft.draftId);
                    const safetyClasses =
                      safetyReview?.status === "safe"
                        ? "border-emerald-400 bg-emerald-50/90 shadow-[0_0_0_1px_rgba(52,211,153,0.36),0_0_26px_rgba(16,185,129,0.14)]"
                        : safetyReview?.status === "warning"
                        ? "border-red-400 bg-red-50/90 shadow-[0_0_0_1px_rgba(248,113,113,0.34),0_0_26px_rgba(239,68,68,0.12)]"
                        : safetyReview?.status === "caution"
                        ? "border-amber-400 bg-amber-50/90 shadow-[0_0_0_1px_rgba(251,191,36,0.34),0_0_26px_rgba(245,158,11,0.12)]"
                        : isDraftReviewRunning
                        ? "border-sky-300 bg-sky-50/70 shadow-[0_0_0_1px_rgba(125,211,252,0.28),0_0_20px_rgba(56,189,248,0.08)]"
                        : "";

                    return (
                    <Card
                      key={draft.draftId}
                      className={cn("relative gap-0 overflow-hidden border py-0", safetyClasses)}
                    >
                      <div className={cn("absolute inset-0 pointer-events-none rounded-[inherit]", safetyClasses)} />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="absolute right-2 top-2 z-10 h-5 w-5 rounded-none p-0 text-red-500 hover:bg-transparent hover:text-red-700"
                        onClick={() => {
                          onDraftSelectionsChange((prev) => prev.filter((item) => item.draftId !== draft.draftId));
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      <CardContent className="relative space-y-3 px-4 py-4 pr-9">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 pr-4">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{draft.medication.drugName}</div>
                            <div className="truncate text-xs text-muted-foreground">{formatMedicationSubtitle(draft.medication)}</div>
                            {formatMedicationInsightLine(draft.medication) ? (
                              <div className="truncate text-xs text-muted-foreground/80">
                                {formatMedicationInsightLine(draft.medication)}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {safetyReview ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "capitalize",
                                  safetyReview.status === "safe"
                                    ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                                    : safetyReview.status === "warning"
                                    ? "border-red-300 bg-red-100 text-red-900"
                                    : "border-amber-300 bg-amber-100 text-amber-900",
                                )}
                              >
                                {safetyReview.status === "caution" ? "Unresolved" : safetyReview.status}
                              </Badge>
                            ) : null}
                            <Badge variant="outline" className="w-fit">{formatScheduleSummary(draft.scheduleCounts)}</Badge>
                            <Select
                              value={String(draft.durationWeeks)}
                              onValueChange={(value) => updateDraftDuration(draft.draftId, Number(value))}
                            >
                              <SelectTrigger className="h-9 w-[96px] rounded-xl border px-2 text-center">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DURATION_OPTIONS.map((weeks) => (
                                  <SelectItem key={weeks} value={String(weeks)}>
                                    {weeks} week{weeks > 1 ? "s" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <MedicationScheduleLights
                          value={draft.scheduleCounts}
                          onCycle={(slot) => cycleDraftScheduleCount(draft.draftId, slot)}
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs text-muted-foreground">
                            {safetyReview?.status === "warning"
                              ? "Allergy warnings found for this medication."
                              : safetyReview?.status === "safe"
                              ? "No graph allergy warnings found."
                              : safetyReview?.status === "caution"
                              ? "This medication could not be resolved cleanly."
                              : "Run Shifa on this medication to check allergy safety."}
                          </div>
                          <ShifaActionPill
                            disabled={!hasLinkedPatient || isDraftReviewRunning || isSafetyReviewRunning}
                            isLoading={isDraftReviewRunning}
                            onClick={() => onAskShifaForDraft?.(draft.draftId)}
                            title={
                              !hasLinkedPatient
                                ? "Link a patient before asking Shifa"
                                : "Run Shifa for this medication"
                            }
                          />
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      )}

      <Dialog open={isCatalogDialogOpen} onOpenChange={setIsCatalogDialogOpen}>
        <DialogContent className="h-[92vh] max-w-[calc(100vw-0.75rem)] overflow-hidden p-0 sm:max-w-[calc(100vw-0.75rem)]">
          <div className="flex h-full min-h-0 flex-col bg-background">
            <DialogHeader className="border-b px-6 py-4 text-left">
              <DialogTitle className="text-xl">Add Medication</DialogTitle>
              <DialogDescription className="sr-only">
                Browse the medicine catalog and add a medication to the prescribing list.
              </DialogDescription>
            </DialogHeader>

            <div className="border-b px-6 py-4">
              <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3">
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search medicines"
                  className="h-11 w-full bg-background text-center"
                />
                <p className="text-sm text-muted-foreground">{filteredCatalog.length} medications</p>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              {isCatalogLoading ? (
                <div className="flex min-h-52 items-center justify-center p-8 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading medications...
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div className="flex min-h-52 items-center justify-center p-8 text-sm text-muted-foreground">
                  No medications matched your search.
                </div>
              ) : (
                <div
                  className="grid gap-6 p-6"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
                >
                  {filteredCatalog.map((medication) => {
                    const isSelected = medication.id === selectedMedicationId;
                    const isAdded = addedMedicationIds.has(medication.id);

                    return (
                      <Card
                        key={medication.id}
                        className={cn(
                          "group relative gap-0 overflow-hidden rounded-[1.4rem] border py-0 transition-all",
                          isAdded
                            ? "border-emerald-300 bg-emerald-50 shadow-md shadow-emerald-100"
                            : isSelected
                            ? "border-rose-300 bg-rose-50 shadow-md shadow-rose-100"
                            : "border-border bg-card hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md",
                        )}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedMedicationId(medication.id)}
                          onDoubleClick={() => setDetailMedication(medication)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedMedicationId(medication.id);
                            }
                          }}
                          className="flex h-full w-full min-w-0 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2"
                        >
                          <div className="flex flex-1 flex-col gap-3 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex flex-wrap gap-2">
                                {medication.ageRestriction ? (
                                  <Badge variant="outline">Age: {medication.ageRestriction}</Badge>
                                ) : (
                                  <Badge variant="outline">Age: All ages</Badge>
                                )}
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                className={cn(
                                  "h-9 w-9 rounded-full shadow-sm",
                                  isAdded ? "bg-emerald-600 hover:bg-emerald-700" : "",
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleAddDraftMedication(medication);
                                }}
                                title={isAdded ? "Medication added" : "Add medication"}
                              >
                                {isAdded ? "✓" : <Plus className="h-4 w-4" />}
                              </Button>
                            </div>
                            <div className="space-y-1">
                              <div className="break-words text-base font-semibold text-foreground">
                                {medication.drugName}
                              </div>
                              <div className="break-words text-sm text-muted-foreground">
                                {formatMedicationSubtitle(medication)}
                              </div>
                              {formatMedicationInsightLine(medication) ? (
                                <div className="break-words text-xs font-medium text-foreground/75">
                                  {formatMedicationInsightLine(medication)}
                                </div>
                              ) : null}
                            </div>

                            <p className="text-sm leading-6 text-muted-foreground">
                              {medication.indication || "No indication summary available yet."}
                            </p>

                            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                              {isAdded ? (
                                <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Added</Badge>
                              ) : isSelected ? (
                                <Badge className="bg-rose-100 text-rose-900 hover:bg-rose-100">Selected</Badge>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <MedicationCatalogDetailsDialog
        medication={detailMedication}
        open={detailMedication !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailMedication(null);
          }
        }}
      />
    </div>
  );
}
