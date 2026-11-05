import { describe, expect, it } from "vitest";
import { seedState } from "@/domain/seed";
import { computeStats } from "@/domain/stats";
import { qcPassed } from "@/domain/qc";

describe("seed data + stats invariants", () => {
  const now = "2026-11-05T09:00:00.000Z";
  const state = seedState(now);
  const stats = computeStats(state, now);

  it("is deterministic", () => {
    expect(seedState(now)).toEqual(state);
  });

  it("every listed or sold device passed QC", () => {
    for (const d of state.devices.filter((x) => x.stage === "LISTED" || x.stage === "SOLD")) {
      expect(qcPassed(d), d.id).toBe(true);
    }
  });

  it("no device is sold more than once", () => {
    for (const d of state.devices) {
      const sold = state.listings.filter((l) => l.deviceId === d.id && l.status === "SOLD");
      expect(sold.length).toBeLessThanOrEqual(1);
    }
  });

  it("stage counts add up to total devices", () => {
    expect(stats.byStage.reduce((s, x) => s + x.count, 0)).toBe(state.devices.length);
  });
});
