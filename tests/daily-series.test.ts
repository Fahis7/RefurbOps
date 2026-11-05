import { describe, expect, it } from "vitest";
import { computeStats, dailySeries } from "@/domain/stats";
import { profit } from "@/domain/pricing";
import { emptyState, seedState } from "@/domain/seed";
import type { AppState, Device } from "@/domain/types";
import { withDevice } from "./helpers";

const base = withDevice().state.devices[0];

/** A device received at `receivedAt` and (optionally) sold at `soldAt` for `price`. */
function dev(id: string, receivedAt: string, soldAt?: string, price = 500): Device {
  return {
    ...base,
    id,
    stage: soldAt ? "SOLD" : "RECEIVED",
    history: soldAt
      ? [
          { stage: "RECEIVED", at: receivedAt },
          { stage: "SOLD", at: soldAt },
        ]
      : [{ stage: "RECEIVED", at: receivedAt }],
    sale: soldAt ? { marketplace: "backmarket", orderId: `O-${id}`, price, fee: price * 0.1, at: soldAt } : undefined,
  };
}
const state = (devices: Device[]): AppState => ({ ...emptyState(), devices });

describe("dailySeries", () => {
  it("returns exactly `days` points, oldest first, ending today, zero-filled", () => {
    const s = dailySeries(state([dev("RO-1", "2026-11-04T10:00:00Z", "2026-11-04T15:00:00Z")]), "2026-11-06T12:00:00Z", 7);
    expect(s.map((p) => p.date)).toEqual([
      "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06",
    ]);
    expect(s[4]).toMatchObject({ date: "2026-11-04", sold: 1, received: 1, revenue: 500 });
    for (const p of [s[0], s[1], s[2], s[3], s[5], s[6]]) expect(p).toEqual({ date: p.date, revenue: 0, profit: 0, sold: 0, received: 0 });
  });

  it("splits days at local midnight, not UTC midnight", () => {
    const s = dailySeries(
      state([
        dev("RO-1", "2026-11-01T00:00:00Z", "2026-11-05T19:30:00Z"), // 23:30 in Dubai (UTC+4) → 5 Nov
        dev("RO-2", "2026-11-01T00:00:00Z", "2026-11-05T20:30:00Z"), // 00:30 in Dubai → 6 Nov
        dev("RO-3", "2026-11-01T00:00:00Z", "2026-11-05T21:00:00Z"), // 21:00 UTC → 6 Nov in Dubai, 5 Nov in UTC
      ]),
      "2026-11-06T12:00:00Z",
      3,
      "Asia/Dubai",
    );
    expect(s.map((p) => [p.date, p.sold])).toEqual([["2026-11-04", 0], ["2026-11-05", 1], ["2026-11-06", 2]]);
    const utc = dailySeries(state([dev("RO-3", "2026-11-01T00:00:00Z", "2026-11-05T21:00:00Z")]), "2026-11-06T12:00:00Z", 2, "UTC");
    expect(utc.map((p) => [p.date, p.sold])).toEqual([["2026-11-05", 1], ["2026-11-06", 0]]);
  });

  it("has every day exactly once across a daylight-saving change (Europe/Berlin, 25 Oct 2026)", () => {
    const s = dailySeries(
      state([dev("RO-1", "2026-10-01T00:00:00Z", "2026-10-25T23:30:00Z")]), // 00:30 CET on 26 Oct
      "2026-10-28T12:00:00Z",
      7,
      "Europe/Berlin",
    );
    expect(s.map((p) => p.date)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(s.find((p) => p.date === "2026-10-26")!.sold).toBe(1);
  });

  it("excludes activity before the window and in the future", () => {
    const s = dailySeries(
      state([
        dev("RO-1", "2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z"), // long before
        dev("RO-2", "2026-11-06T13:00:00Z", "2026-11-06T14:00:00Z"), // later today, after `now`
      ]),
      "2026-11-06T12:00:00Z",
      7,
    );
    expect(s.reduce((n, p) => n + p.sold + p.received, 0)).toBe(0);
  });

  it("uses profit() per sale and counts devices received by their first history date", () => {
    const a = dev("RO-1", "2026-11-02T09:00:00Z", "2026-11-05T09:00:00Z", 600);
    const b = dev("RO-2", "2026-11-02T10:00:00Z", "2026-11-05T11:00:00Z", 400);
    const c = dev("RO-3", "2026-11-02T11:00:00Z");
    const s = dailySeries(state([a, b, c]), "2026-11-06T12:00:00Z", 7);
    const nov5 = s.find((p) => p.date === "2026-11-05")!;
    expect(nov5).toMatchObject({ sold: 2, revenue: 1000, profit: Math.round((profit(a)! + profit(b)!) * 100) / 100 });
    expect(s.find((p) => p.date === "2026-11-02")!.received).toBe(3);
  });

  it("totals equal computeStats when the window covers every sale", () => {
    const now = "2026-11-06T12:00:00.000Z";
    const seeded = seedState(now);
    const s = dailySeries(seeded, now, 120);
    const stats = computeStats(seeded, now);
    expect(s.reduce((n, p) => n + p.sold, 0)).toBe(stats.soldCount);
    // computeStats rounds revenue and profit to whole euros – compare after the same rounding.
    expect(Math.round(s.reduce((n, p) => n + p.revenue, 0))).toBe(stats.revenue);
    expect(Math.round(s.reduce((n, p) => n + p.profit, 0))).toBe(stats.totalProfit);
    expect(s.reduce((n, p) => n + p.received, 0)).toBe(seeded.devices.length);
  });
});
