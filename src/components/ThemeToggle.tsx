"use client";
import { useEffect, useState } from "react";
import { applyThemeMode, loadThemeMode, nextThemeMode, saveThemeMode, type ThemeMode } from "@/client/theme";

const LABEL: Record<ThemeMode, { icon: string; text: string }> = {
  system: { icon: "◐", text: "System" },
  light: { icon: "☀", text: "Light" },
  dark: { icon: "☾", text: "Dark" },
};

/** Cycles System → Light → Dark. The inline init script has already applied the saved mode before paint. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");

  // Read the saved mode after mount, so server and client render the same markup.
  useEffect(() => setMode(loadThemeMode()), []);

  const next = nextThemeMode(mode);
  const onClick = () => {
    saveThemeMode(next);
    applyThemeMode(next);
    setMode(next);
  };

  return (
    <button
      type="button"
      className="btn ghost small-btn theme-toggle"
      onClick={onClick}
      aria-label={`Theme: ${LABEL[mode].text}. Switch to ${LABEL[next].text}`}
      title={`Theme: ${LABEL[mode].text} (click for ${LABEL[next].text})`}
    >
      <span aria-hidden className="theme-icon">
        {LABEL[mode].icon}
      </span>
      {LABEL[mode].text}
    </button>
  );
}
