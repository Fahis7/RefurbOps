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
