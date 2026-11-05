/**
 * Application service: every write operation in the app, as a pure function
 *   (state, input, now) => newState
 * The server (API routes + JSON/Postgres store) and the offline demo (browser
 * storage) both call these same functions, so business rules live in ONE place.
 */
import {
  DomainError,
  type AppState,
  type Device,
  type MarketplaceId,
  type NewDeviceInput,
  type OrderEvent,
  type Stage,
} from "./types";
import { moveDevice } from "./pipeline";
import { computeGrade, setQCResult } from "./qc";
import { suggestPrice } from "./pricing";
import { handleOrder, log, publishListings, type OrderOutcome } from "./marketplace";

function updateDevice(state: AppState, id: string, fn: (d: Device) => Device): AppState {
  const device = state.devices.find((d) => d.id === id);
  if (!device) throw new DomainError(`Device ${id} not found`);
  return { ...state, devices: state.devices.map((d) => (d.id === id ? fn(d) : d)) };
}

export function validateNewDevice(input: Partial<NewDeviceInput>): NewDeviceInput {
  const errors: string[] = [];
  const str = (k: keyof NewDeviceInput) => {
    const v = input[k];
    if (typeof v !== "string" || !v.trim()) errors.push(`${k} is required`);
    return typeof v === "string" ? v.trim() : "";
  };
  const num = (k: keyof NewDeviceInput, min: number, max: number) => {
    const v = Number(input[k]);
    if (!Number.isFinite(v) || v < min || v > max) errors.push(`${k} must be between ${min} and ${max}`);
    return v;
  };
  const out: NewDeviceInput = {
    serial: str("serial"),
    brand: str("brand"),
    model: str("model"),
    category: input.category as NewDeviceInput["category"],
    storageGb: num("storageGb", 16, 8192),
    color: str("color"),
    supplier: str("supplier"),
    costPrice: num("costPrice", 1, 10000),
    batteryHealth: num("batteryHealth", 0, 100),
  };
  if (!["Smartphone", "Laptop", "Tablet"].includes(out.category)) errors.push("category is invalid");
  if (errors.length) throw new DomainError(errors.join("; "));
  return out;
}

export function addDevice(state: AppState, raw: Partial<NewDeviceInput>, now: string): AppState {
  const input = validateNewDevice(raw);
  if (state.devices.some((d) => d.serial === input.serial)) {
    throw new DomainError(`A device with serial ${input.serial} already exists`);
  }
  const device: Device = {
    ...input,
    id: `RO-${state.nextSku}`,
    repairCost: 0,
    cosmeticScore: 0,
    stage: "RECEIVED",
    history: [{ stage: "RECEIVED", at: now, note: `From ${input.supplier}` }],
    qc: [],
  };
  return { ...state, devices: [device, ...state.devices], nextSku: state.nextSku + 1 };
}

export function move(state: AppState, id: string, to: Stage, now: string, note?: string): AppState {
  const before = state.devices.find((d) => d.id === id);
  let next = updateDevice(state, id, (d) => moveDevice(d, to, now, note));
  // Pulling a device off sale must take it down from every marketplace too.
  if (before?.stage === "LISTED") {
    next = {
      ...next,
      listings: next.listings.map((l) =>
        l.deviceId === id && l.status === "ACTIVE" ? { ...l, status: "DELISTED" as const, updatedAt: now } : l,
      ),
    };
    next = log(next, "warning", `Delisted ${id} everywhere – sent back to ${to}`, now, { deviceId: id });
  }
  return next;
}

/** Grading: record cosmetic score + battery, compute grade, send to REPAIR or straight to QC. */
export function grade(
  state: AppState,
  id: string,
  input: { cosmeticScore: number; batteryHealth: number; needsRepair: boolean },
  now: string,
): AppState {
  if (input.cosmeticScore < 1 || input.cosmeticScore > 5) throw new DomainError("Cosmetic score must be 1–5");
  return updateDevice(state, id, (d) => {
    if (d.stage !== "GRADING") throw new DomainError("Device is not in GRADING");
    const g = computeGrade(input.cosmeticScore, input.batteryHealth);
    const graded = { ...d, cosmeticScore: input.cosmeticScore, batteryHealth: input.batteryHealth, grade: g };
    return moveDevice(graded, input.needsRepair ? "REPAIR" : "QC", now, `Graded ${g}`);
  });
}

export function completeRepair(state: AppState, id: string, input: { cost: number; note: string }, now: string): AppState {
  if (!(input.cost >= 0)) throw new DomainError("Repair cost must be 0 or more");
  return updateDevice(state, id, (d) => {
    if (d.stage !== "REPAIR") throw new DomainError("Device is not in REPAIR");
    // Battery replacement restores battery health to 100%.
    const battery = /battery/i.test(input.note) ? 100 : d.batteryHealth;
    const repaired = { ...d, repairCost: d.repairCost + input.cost, batteryHealth: battery };
    if (battery !== d.batteryHealth && d.cosmeticScore) repaired.grade = computeGrade(d.cosmeticScore, battery);
    return moveDevice(repaired, "QC", now, input.note || "Repair done");
  });
}

export function recordQC(state: AppState, id: string, checkId: string, passed: boolean): AppState {
  return updateDevice(state, id, (d) => {
    if (d.stage !== "QC") throw new DomainError("Device is not in QC");
    return { ...d, qc: setQCResult(d.qc, checkId, passed) };
  });
}

export function setListingText(
  state: AppState,
  id: string,
  listing: { title: string; description: string; source: "ai" | "template" },
): AppState {
  return updateDevice(state, id, (d) => ({ ...d, listing }));
}

/** QC passed → LISTED with a suggested price, then publish to the chosen marketplaces. */
export function approveAndList(
  state: AppState,
  id: string,
  marketplaces: MarketplaceId[],
  now: string,
  price?: number,
): AppState {
  const next = updateDevice(state, id, (d) => {
    const moved = moveDevice(d, "LISTED", now, `Listed on ${marketplaces.length} marketplace(s)`);
    return { ...moved, listPrice: price ?? suggestPrice(d, d.grade ?? "B") };
  });
  return publishListings(next, id, marketplaces, now);
}

export function receiveOrder(state: AppState, order: OrderEvent, now: string): { state: AppState; outcome: OrderOutcome } {
  return handleOrder(state, order, now);
}
