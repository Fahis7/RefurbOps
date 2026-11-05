import type { AppState } from "@/domain/types";
import { addDevice, approveAndList, grade, move, recordQC } from "@/domain/service";
import { checksFor } from "@/domain/qc";
import { emptyState } from "@/domain/seed";

export const T0 = "2026-11-01T09:00:00.000Z";
export const at = (hours: number) => new Date(Date.parse(T0) + hours * 3_600_000).toISOString();

export function withDevice(overrides: Record<string, unknown> = {}): { state: AppState; id: string } {
  const state = addDevice(
    emptyState(),
    {
      serial: "356789104523987",
      brand: "Apple",
      model: "iPhone 13",
      category: "Smartphone",
      storageGb: 128,
      color: "Midnight",
      supplier: "TradeIn Partner EU",
      costPrice: 280,
      batteryHealth: 92,
      ...overrides,
    },
    T0,
  );
  return { state, id: state.devices[0].id };
}

/** A device that has passed QC and is live on all three marketplaces. */
export function listedDevice(): { state: AppState; id: string } {
  let { state, id } = withDevice();
  state = move(state, id, "GRADING", at(1));
  state = grade(state, id, { cosmeticScore: 5, batteryHealth: 92, needsRepair: false }, at(2));
  for (const c of checksFor("Smartphone")) state = recordQC(state, id, c.id, true);
  state = approveAndList(state, id, ["backmarket", "refurbed", "amazon"], at(3));
  return { state, id };
}
