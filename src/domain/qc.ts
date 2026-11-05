import type { Category, Device, Grade, QCResult } from "./types";

export interface QCCheck {
  id: string;
  label: string;
  categories: Category[]; // which device types this check applies to
}

const ALL: Category[] = ["Smartphone", "Laptop", "Tablet"];

export const QC_CHECKS: QCCheck[] = [
  { id: "power", label: "Powers on and boots", categories: ALL },
  { id: "screen", label: "Display: no dead pixels / burn-in", categories: ALL },
  { id: "touch", label: "Touchscreen responds everywhere", categories: ["Smartphone", "Tablet"] },
  { id: "battery", label: "Battery health ≥ 80%", categories: ALL },
  { id: "charging", label: "Charges via port", categories: ALL },
  { id: "camera", label: "Front + rear cameras", categories: ["Smartphone", "Tablet"] },
  { id: "audio", label: "Speakers + microphone", categories: ALL },
  { id: "wifi", label: "Wi-Fi + Bluetooth", categories: ALL },
  { id: "cellular", label: "SIM / cellular signal", categories: ["Smartphone"] },
  { id: "biometrics", label: "Face ID / fingerprint", categories: ["Smartphone", "Tablet"] },
  { id: "keyboard", label: "Keyboard + trackpad", categories: ["Laptop"] },
  { id: "wipe", label: "Data wiped + iCloud/Google lock removed", categories: ALL },
];

export function checksFor(category: Category): QCCheck[] {
  return QC_CHECKS.filter((c) => c.categories.includes(category));
}

/** True only if every applicable check has been recorded as passed. */
export function qcPassed(device: Pick<Device, "category" | "qc">): boolean {
  const results = new Map(device.qc.map((r) => [r.checkId, r.passed]));
  return checksFor(device.category).every((c) => results.get(c.id) === true);
}

export function qcProgress(device: Pick<Device, "category" | "qc">) {
  const checks = checksFor(device.category);
  const results = new Map(device.qc.map((r) => [r.checkId, r.passed]));
  const done = checks.filter((c) => results.has(c.id)).length;
  const failed = checks.filter((c) => results.get(c.id) === false).length;
  return { total: checks.length, done, failed };
}

/**
 * Grade from cosmetic condition and battery health.
 * A = like new (cosmetic 5, battery ≥ 90), B = light wear, C = visible wear.
 */
export function computeGrade(cosmeticScore: number, batteryHealth: number): Grade {
  if (cosmeticScore >= 5 && batteryHealth >= 90) return "A";
  if (cosmeticScore >= 3 && batteryHealth >= 85) return "B";
  return "C";
}

export function setQCResult(qc: QCResult[], checkId: string, passed: boolean): QCResult[] {
  return [...qc.filter((r) => r.checkId !== checkId), { checkId, passed }];
}
