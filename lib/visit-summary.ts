export function extractNoteTextFromSoapNote(rawSoapNote: unknown): string {
  if (!rawSoapNote || typeof rawSoapNote !== "object" || Array.isArray(rawSoapNote)) {
    if (typeof rawSoapNote === "string") {
      return rawSoapNote.trim();
    }
    return "";
  }

  const payload = rawSoapNote as {
    noteText?: unknown;
    noteData?: unknown;
    subjective?: unknown;
    objective?: unknown;
    assessment?: unknown;
    plan?: unknown;
  };

  if (typeof payload.noteText === "string" && payload.noteText.trim()) {
    return payload.noteText.trim();
  }

  const sectionText = [
    typeof payload.subjective === "string" ? payload.subjective.trim() : "",
    typeof payload.objective === "string" ? payload.objective.trim() : "",
    typeof payload.assessment === "string" ? payload.assessment.trim() : "",
    typeof payload.plan === "string" ? payload.plan.trim() : "",
  ]
    .filter((value) => value.length > 0)
    .join("\n\n")
    .trim();

  if (sectionText) {
    return sectionText;
  }

  if (payload.noteData && typeof payload.noteData === "object" && !Array.isArray(payload.noteData)) {
    const derived = Object.entries(payload.noteData as Record<string, unknown>)
      .map(([key, value]) => {
        if (typeof value === "string") {
          const trimmed = value.trim();
          return trimmed ? `${key}: ${trimmed}` : "";
        }

        if (typeof value === "number") {
          return Number.isFinite(value) ? `${key}: ${value}` : "";
        }

        if (typeof value === "boolean") {
          return `${key}: ${value ? "Yes" : "No"}`;
        }

        return "";
      })
      .filter((line) => line.length > 0)
      .join("\n")
      .trim();

    if (derived) {
      return derived;
    }
  }

  return "";
}

export function buildVisitSummaryExcerpt(noteText: string, maxChars: number = 220): string {
  const normalized = noteText.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Visit note is available for download.";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

export function getSoapNoteFinalizedAt(rawSoapNote: unknown): string | null {
  if (!rawSoapNote || typeof rawSoapNote !== "object" || Array.isArray(rawSoapNote)) {
    return null;
  }

  const payload = rawSoapNote as { finalizedAt?: unknown };
  return typeof payload.finalizedAt === "string" && payload.finalizedAt.trim()
    ? payload.finalizedAt
    : null;
}

export function markSoapNoteAsFinalized(rawSoapNote: unknown, finalizedAtIso: string): Record<string, unknown> {
  const noteText = extractNoteTextFromSoapNote(rawSoapNote);

  if (!rawSoapNote || typeof rawSoapNote !== "object" || Array.isArray(rawSoapNote)) {
    return {
      version: 2,
      mode: "template-finalized",
      noteText,
      finalizedAt: finalizedAtIso,
      isFinalized: true,
    };
  }

  return {
    ...(rawSoapNote as Record<string, unknown>),
    noteText,
    finalizedAt: finalizedAtIso,
    isFinalized: true,
  };
}
