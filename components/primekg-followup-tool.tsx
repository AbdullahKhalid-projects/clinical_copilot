"use client";

import { memo, useMemo, useState } from "react";
import {
  type ToolCallMessagePartComponent,
  useThreadRuntime,
} from "@assistant-ui/react";
import { Pill, Sparkles, Target, TriangleAlert } from "lucide-react";
import { ToolFallback } from "@/components/tool-fallback";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  buildPrimeKgMedicationFollowupPrompt,
  getPrimeKgFollowupAction,
  PRIMEKG_FOLLOWUP_ACTIONS,
  type PrimeKgFollowupMedication,
} from "@/lib/primekg-followups";

type FollowupToolArgs = {
  title?: string;
  instructions?: string;
  medications?: Array<{
    medicationName?: string;
    queryDrug?: string;
    genericName?: string | null;
    activeIngredients?: string[];
  }>;
};

type FollowupToolResult = {
  selectedActionId: string;
  selectedActionLabel: string;
  medicationName: string;
  queryDrug: string;
  prompt: string;
};

function normalizeMedications(
  medications: FollowupToolArgs["medications"],
): PrimeKgFollowupMedication[] {
  if (!Array.isArray(medications)) {
    return [];
  }

  const normalized: PrimeKgFollowupMedication[] = [];

  for (const medication of medications) {
    const medicationName = medication?.medicationName?.trim() ?? "";
    const queryDrug = medication?.queryDrug?.trim() ?? "";

    if (!medicationName || !queryDrug) {
      continue;
    }

    normalized.push({
      medicationName,
      queryDrug,
      genericName: medication?.genericName?.trim() || null,
      activeIngredients: Array.isArray(medication?.activeIngredients)
        ? medication.activeIngredients
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : [],
    });
  }

  return normalized;
}

const PrimeKgFollowupToolImpl: ToolCallMessagePartComponent<
  FollowupToolArgs,
  FollowupToolResult
> = ({ toolName, status, args, result, addResult }) => {
  const threadRuntime = useThreadRuntime();
  const { toast } = useToast();
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);

  const medications = useMemo(
    () => normalizeMedications(args?.medications),
    [args?.medications],
  );

  const hasSelection =
    !!result &&
    typeof result === "object" &&
    "selectedActionId" in result &&
    "medicationName" in result;

  const handleSelection = async (
    medication: PrimeKgFollowupMedication,
    actionId: string,
  ) => {
    const action = getPrimeKgFollowupAction(actionId);
    const prompt = buildPrimeKgMedicationFollowupPrompt({
      medication,
      actionId,
    });
    const selectionKey = `${medication.queryDrug}:${action.id}`;
    setPendingSelection(selectionKey);

    try {
      addResult({
        selectedActionId: action.id,
        selectedActionLabel: action.label,
        medicationName: medication.medicationName,
        queryDrug: medication.queryDrug,
        prompt,
      });

      threadRuntime.append({
        role: "user",
        content: [{ type: "text", text: prompt }],
        startRun: true,
      });
    } catch (error) {
      console.error("Failed to queue PrimeKG follow-up prompt", error);
      toast({
        title: "PrimeKG follow-up failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not queue the next PrimeKG query.",
        variant: "destructive",
      });
    } finally {
      setPendingSelection(null);
    }
  };

  return (
    <ToolFallback.Root defaultOpen>
      <ToolFallback.Trigger toolName={toolName} status={status} />
      <ToolFallback.Content>
        <div className="space-y-3 px-4">
          <div className="rounded-lg border border-[#DCE8E3] bg-[#F4FAF7] px-3 py-2 text-sm text-[#365C4F]">
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4" />
              <span>{args?.title?.trim() || "PrimeKG next actions"}</span>
            </div>
            <p className="mt-1 text-xs text-[#4D7467]">
              {args?.instructions?.trim() ||
                "Choose the next graph-backed medication question to run from the staged prescriptions."}
            </p>
          </div>

          {medications.length === 0 ? (
            <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              No medication follow-ups were provided for this selector.
            </div>
          ) : null}

          {medications.map((medication) => (
            <div
              key={`${medication.medicationName}:${medication.queryDrug}`}
              className="rounded-lg border border-[#E7DDD4] bg-white px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-[#5B4741]">
                    {medication.medicationName}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#7A625A]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#F6EFE8] px-2 py-0.5">
                      <Pill className="h-3 w-3" />
                      {medication.queryDrug}
                    </span>
                    {medication.genericName ? (
                      <span>{medication.genericName}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {PRIMEKG_FOLLOWUP_ACTIONS.map((action) => {
                  const selectionKey = `${medication.queryDrug}:${action.id}`;
                  const isPending = pendingSelection === selectionKey;
                  return (
                    <Button
                      key={action.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto items-start justify-start whitespace-normal px-3 py-2 text-left"
                      disabled={Boolean(pendingSelection) || hasSelection}
                      onClick={() => {
                        void handleSelection(medication, action.id);
                      }}
                    >
                      <span className="flex items-start gap-2">
                        {action.id === "contraindications" ? (
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : action.id === "targets" ? (
                          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        )}
                        <span>
                          <span className="block text-xs font-semibold">
                            {isPending ? "Launching..." : action.label}
                          </span>
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            {action.description}
                          </span>
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}

          {hasSelection ? (
            <div className="rounded-lg border border-[#D8E9E1] bg-[#F5FAF8] px-3 py-2 text-sm text-[#355E50]">
              Selected follow-up:{" "}
              <span className="font-medium">
                {(result as FollowupToolResult).selectedActionLabel}
              </span>{" "}
              for{" "}
              <span className="font-medium">
                {(result as FollowupToolResult).medicationName}
              </span>
              .
            </div>
          ) : null}
        </div>
      </ToolFallback.Content>
    </ToolFallback.Root>
  );
};

export const PrimeKgFollowupTool = memo(
  PrimeKgFollowupToolImpl,
) as ToolCallMessagePartComponent<FollowupToolArgs, FollowupToolResult>;

PrimeKgFollowupTool.displayName = "PrimeKgFollowupTool";
