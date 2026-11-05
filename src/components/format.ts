import type { Stage } from "@/domain/types";

// Lives in the domain so listing text formats storage the same way as the UI.
export { formatStorage } from "@/domain/types";

export const eur = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);

export const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export const STAGE_LABEL: Record<Stage, string> = {
  RECEIVED: "Received",
  GRADING: "Grading",
  REPAIR: "Repair",
  QC: "QC",
  LISTED: "Listed",
  SOLD: "Sold",
};

export function ago(iso: string, now = Date.now()): string {
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function daysSince(iso: string, now = Date.now()) {
  return Math.max(0, (now - Date.parse(iso)) / 86_400_000);
}

/** Short euro labels for chart axes: €0, €850, €1.2k, €15k, €1.5M. */
export function eurShort(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  const trim = (v: number) => (Math.round(v * 10) / 10).toString();
  if (a >= 1_000_000) return `${sign}€${trim(a / 1_000_000)}M`;
  if (a >= 1_000) return `${sign}€${trim(a / 1_000)}k`;
  return `${sign}€${Math.round(a)}`;
}

/** "2026-11-05" (a calendar day) → "5 Nov"; with weekday → "Thu 5 Nov". */
export function dayLabel(date: string, withWeekday = false): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", ...(withWeekday ? { weekday: "short" } : {}) })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(",", "");
}

/** "2026-11-05" → "Thu". */
export function weekdayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(new Date(`${date}T00:00:00Z`));
}
