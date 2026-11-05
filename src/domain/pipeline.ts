import { DomainError, type Device, type Stage } from "./types";
import { qcPassed } from "./qc";

/**
 * Allowed stage transitions. Anything not listed here is rejected.
 * QC can send a device back to REPAIR; LISTED can be pulled back to QC.
 * SOLD is only reached through a marketplace order, never by hand.
 */
export const TRANSITIONS: Record<Stage, Stage[]> = {
  RECEIVED: ["GRADING"],
  GRADING: ["REPAIR", "QC"], // skip repair if nothing is broken
  REPAIR: ["QC"],
  QC: ["REPAIR", "LISTED"],
  LISTED: ["QC"],
  SOLD: [],
};

export function canMove(device: Device, to: Stage): { ok: true } | { ok: false; reason: string } {
  if (to === "SOLD") return { ok: false, reason: "Devices are marked SOLD only by a marketplace order" };
  if (!TRANSITIONS[device.stage].includes(to)) {
    return { ok: false, reason: `Cannot move from ${device.stage} to ${to}` };
  }
  if (to === "LISTED" && !qcPassed(device)) {
    return { ok: false, reason: "All QC checks must pass before a device can be listed" };
  }
  return { ok: true };
}

/** Returns a new device moved to `to`; throws DomainError if not allowed. */
export function moveDevice(device: Device, to: Stage, at: string, note?: string): Device {
  const check = canMove(device, to);
  if (!check.ok) throw new DomainError(check.reason);
  return {
    ...device,
    stage: to,
    // Re-running QC after a repair should start from a clean checklist.
    qc: to === "QC" && device.stage === "REPAIR" ? [] : device.qc,
    history: [...device.history, { stage: to, at, note }],
  };
}

/** Days the device has spent in each stage (current stage counts up to `now`). */
export function daysPerStage(device: Device, now: string): Partial<Record<Stage, number>> {
  const out: Partial<Record<Stage, number>> = {};
  device.history.forEach((ev, i) => {
    const end = device.history[i + 1]?.at ?? (device.stage === "SOLD" ? ev.at : now);
    const days = (Date.parse(end) - Date.parse(ev.at)) / 86_400_000;
    out[ev.stage] = (out[ev.stage] ?? 0) + Math.max(0, days);
  });
  return out;
}
