export const SHIFA_HELP_SECTIONS = [
  {
    title: "Patient-specific checks",
    badge: "Patient graph",
    description:
      "Use Shifa when you need answers grounded in the current patient's allergies, medications, conditions, previous notes, or lab history.",
    examples: [
      "Can I prescribe amoxicillin to this patient?",
      "Show the latest hemoglobin and creatinine.",
      "What happened in the previous visit?",
    ],
  },
  {
    title: "Drug and disease knowledge",
    badge: "PrimeKG",
    description:
      "Turn on PrimeKG when the question is general medical knowledge rather than patient-specific safety.",
    examples: [
      "What is prednisone indicated for?",
      "What does metformin target?",
      "What drugs are linked to asthma?",
    ],
  },
  {
    title: "Medication follow-ups",
    badge: "Follow-up flow",
    description:
      "After a medication safety review, Shifa can suggest the next PrimeKG actions so the doctor can drill deeper without retyping the medication.",
    examples: [
      "Review indications",
      "Check contraindication context",
      "Inspect drug targets",
    ],
  },
] as const;

export const SHIFA_STRONG_EXAMPLES = [
  "Can I prescribe amoxicillin to this patient?",
  "Show the latest hemoglobin trend.",
  "What does prednisone target?",
] as const;
