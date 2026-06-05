"use client";

import * as React from "react";

const STORAGE_KEY = "clinical-copilot-ui-preferences";
const DEFAULT_HTML_FONT_SIZE = 13.5;

type UIPreferences = {
  htmlFontSize: number;
};

type UIPreferencesContextValue = UIPreferences & {
  setHtmlFontSize: (value: number) => void;
  resetPreferences: () => void;
};

const defaultPreferences: UIPreferences = {
  htmlFontSize: DEFAULT_HTML_FONT_SIZE,
};

const UIPreferencesContext = React.createContext<UIPreferencesContextValue | null>(null);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function applyPreferences(preferences: UIPreferences) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty("--app-html-font-size", `${preferences.htmlFontSize}px`);
}

function readStoredPreferences(): UIPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UIPreferences>;
    return {
      htmlFontSize: clamp(parsed.htmlFontSize ?? DEFAULT_HTML_FONT_SIZE, 11, 18),
    };
  } catch {
    return null;
  }
}

export function UIPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = React.useState<UIPreferences>(defaultPreferences);
  const [hasHydrated, setHasHydrated] = React.useState(false);

  React.useEffect(() => {
    const storedPreferences = readStoredPreferences();
    const nextPreferences = storedPreferences ?? defaultPreferences;
    setPreferences(nextPreferences);
    applyPreferences(nextPreferences);
    setHasHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    applyPreferences(preferences);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }
  }, [hasHydrated, preferences]);

  const value = React.useMemo<UIPreferencesContextValue>(
    () => ({
      ...preferences,
      setHtmlFontSize: (htmlFontSize: number) =>
        setPreferences((current) => ({
          ...current,
          htmlFontSize: clamp(htmlFontSize, 11, 18),
        })),
      resetPreferences: () => setPreferences(defaultPreferences),
    }),
    [preferences],
  );

  return <UIPreferencesContext.Provider value={value}>{children}</UIPreferencesContext.Provider>;
}

export function useUIPreferences() {
  const context = React.useContext(UIPreferencesContext);

  if (!context) {
    throw new Error("useUIPreferences must be used within a UIPreferencesProvider");
  }

  return context;
}
