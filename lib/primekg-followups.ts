export const PRIMEKG_FOLLOWUP_ACTIONS = [
  {
    id: "overview",
    label: "PrimeKG Overview",
    description:
      "Get the main graph context for this drug, including indications, contraindications, and targets.",
    promptInstruction:
      "Give a compact PrimeKG overview for this medication. Use the focused drug-to-disease and drug-target PrimeKG tools when useful, and include indications, contraindication-linked diseases, and targets.",
  },
  {
    id: "indications",
    label: "Indications",
    description:
      "Focus only on what diseases or uses the graph connects to this drug.",
    promptInstruction:
      "Use the focused PrimeKG drug-to-disease tool and focus only on indication-linked diseases or uses for this medication.",
  },
  {
    id: "contraindications",
    label: "Contraindications",
    description:
      "Focus only on diseases or conditions the graph links as contraindications.",
    promptInstruction:
      "Use the focused PrimeKG drug-to-disease tool and focus only on contraindication-linked diseases or conditions for this medication.",
  },
  {
    id: "targets",
    label: "Targets",
    description:
      "Focus only on the proteins or biological targets linked to this drug.",
    promptInstruction:
      "Use the focused PrimeKG drug-target tool and focus only on target and protein links for this medication.",
  },
] as const;

export type PrimeKgFollowupActionId =
  (typeof PRIMEKG_FOLLOWUP_ACTIONS)[number]["id"];

export type PrimeKgFollowupMedication = {
  medicationName: string;
  queryDrug: string;
  genericName?: string | null;
  activeIngredients?: string[];
};

export function getPrimeKgFollowupAction(
  actionId: string,
): (typeof PRIMEKG_FOLLOWUP_ACTIONS)[number] {
  return (
    PRIMEKG_FOLLOWUP_ACTIONS.find((action) => action.id === actionId) ??
    PRIMEKG_FOLLOWUP_ACTIONS[0]
  );
}

export function buildPrimeKgMedicationFollowupPrompt(args: {
  medication: PrimeKgFollowupMedication;
  actionId: string;
}): string {
  const action = getPrimeKgFollowupAction(args.actionId);
  const genericLine = args.medication.genericName?.trim()
    ? `Generic name: ${args.medication.genericName.trim()}`
    : "";
  const ingredientsLine =
    Array.isArray(args.medication.activeIngredients) &&
    args.medication.activeIngredients.length > 0
      ? `Active ingredients: ${args.medication.activeIngredients.join(", ")}`
      : "";

  return [
    "#primekg",
    action.promptInstruction,
    `Medication: ${args.medication.medicationName}`,
    `PrimeKG query drug: ${args.medication.queryDrug}`,
    genericLine,
    ingredientsLine,
    "Use only the PrimeKG graph tool output. Do not provide patient-specific prescribing advice.",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}
