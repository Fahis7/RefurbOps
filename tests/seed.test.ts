import { describe, expect, it } from "vitest";
import { seedState } from "@/domain/seed";
import { isValidImei, lookupByImei } from "@/domain/catalog";
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

  it("sync log is in time order, newest first", () => {
    const log = state.syncLog;
    for (let i = 0; i < log.length - 1; i++) {
      expect(log[i].at >= log[i + 1].at, `${log[i].id} (${log[i].at}) before ${log[i + 1].id} (${log[i + 1].at})`).toBe(true);
    }
  });

  it("every seeded phone has a valid IMEI whose TAC matches its model", () => {
    const phones = state.devices.filter((d) => d.category === "Smartphone");
    expect(phones.length).toBeGreaterThan(0);
    for (const d of phones) {
      expect(isValidImei(d.serial), `${d.id} ${d.serial}`).toBe(true);
      expect(lookupByImei(d.serial)?.model, d.id).toBe(d.model);
    }
  });

  it("has AED and INR purchases, each converted to EUR with its stored rate", () => {
    const currencies = new Set(state.devices.map((d) => d.purchase?.currency));
    expect(currencies).toContain("AED");
    expect(currencies).toContain("INR");
    for (const d of state.devices) {
      const p = d.purchase!;
      expect(d.costPrice, d.id).toBe(Math.round((p.amount / p.rate + Number.EPSILON) * 100) / 100);
    }
  });

  it("stage counts add up to total devices", () => {
    expect(stats.byStage.reduce((s, x) => s + x.count, 0)).toBe(state.devices.length);
  });
});
