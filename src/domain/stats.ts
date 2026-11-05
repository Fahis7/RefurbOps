import { STAGES, type AppState, type MarketplaceId, type Stage } from "./types";
import { daysPerStage } from "./pipeline";
import { MARKETPLACE_IDS, profit } from "./pricing";

export interface DashboardStats {
  inPipeline: number;
  listedCount: number;
  stockValue: number; // sum of list prices of LISTED devices
  soldCount: number;
  revenue: number;
  totalProfit: number;
  avgMargin: number; // profit / revenue
  qcFirstPassRate: number; // share of devices that reached LISTED without going back to REPAIR
  byStage: { stage: Stage; count: number }[];
  avgDaysByStage: { stage: Stage; days: number }[];
  byMarketplace: { marketplace: MarketplaceId; sold: number; revenue: number; profit: number }[];
}

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

export function computeStats(state: AppState, now: string): DashboardStats {
  const devices = state.devices;
  const sold = devices.filter((d) => d.stage === "SOLD");
  const listed = devices.filter((d) => d.stage === "LISTED");
  const revenue = sold.reduce((s, d) => s + (d.sale?.price ?? 0), 0);
  const totalProfit = sold.reduce((s, d) => s + (profit(d) ?? 0), 0);

  // Average days per stage, over every device that has been in that stage.
  const sums: Partial<Record<Stage, { total: number; n: number }>> = {};
  for (const d of devices) {
    for (const [stage, days] of Object.entries(daysPerStage(d, now)) as [Stage, number][]) {
      const s = (sums[stage] ??= { total: 0, n: 0 });
      s.total += days;
      s.n += 1;
    }
  }

  const reachedListing = devices.filter((d) => d.history.some((h) => h.stage === "LISTED"));
  const firstPass = reachedListing.filter((d) => {
    const qcIdx = d.history.findIndex((h) => h.stage === "QC");
    return !d.history.slice(qcIdx + 1).some((h) => h.stage === "REPAIR");
  });

  return {
    inPipeline: devices.filter((d) => !["LISTED", "SOLD"].includes(d.stage)).length,
    listedCount: listed.length,
    stockValue: listed.reduce((s, d) => s + (d.listPrice ?? 0), 0),
    soldCount: sold.length,
    revenue: round(revenue),
    totalProfit: round(totalProfit),
    avgMargin: revenue ? round(totalProfit / revenue, 3) : 0,
    qcFirstPassRate: reachedListing.length ? round(firstPass.length / reachedListing.length, 3) : 0,
    byStage: STAGES.map((stage) => ({ stage, count: devices.filter((d) => d.stage === stage).length })),
    avgDaysByStage: STAGES.filter((s) => s !== "SOLD").map((stage) => ({
      stage,
      days: sums[stage] ? round(sums[stage]!.total / sums[stage]!.n, 1) : 0,
    })),
    byMarketplace: MARKETPLACE_IDS.map((mp) => {
      const s = sold.filter((d) => d.sale?.marketplace === mp);
      return {
        marketplace: mp,
        sold: s.length,
        revenue: round(s.reduce((a, d) => a + (d.sale?.price ?? 0), 0)),
        profit: round(s.reduce((a, d) => a + (profit(d) ?? 0), 0)),
      };
    }),
  };
}

export interface DayPoint {
  date: string; // local calendar day, YYYY-MM-DD
  revenue: number;
  profit: number;
  sold: number;
  received: number;
}

/**
 * Per-day revenue, profit, units sold and devices received for the last `days` local calendar days
 * (oldest first, ending today, zero-filled). `timeZone` is passed in (the browser's zone) so the domain
 * stays pure; Intl handles daylight-saving changes. Profit uses profit(), like every other figure.
 */
export function dailySeries(state: AppState, now: string, days: number, timeZone = "UTC"): DayPoint[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayOf = (iso: string) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const [y, m, d] = dayOf(now).split("-").map(Number);
  const points = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) {
    // Calendar arithmetic on the date itself (no clock time), so DST can't skip or repeat a day.
    const date = new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10);
    points.set(date, { date, revenue: 0, profit: 0, sold: 0, received: 0 });
  }
  const nowMs = Date.parse(now);
  for (const dev of state.devices) {
    const receivedAt = dev.history[0]?.at;
    if (receivedAt && Date.parse(receivedAt) <= nowMs) {
      const p = points.get(dayOf(receivedAt));
      if (p) p.received += 1;
    }
    if (dev.sale && Date.parse(dev.sale.at) <= nowMs) {
      const p = points.get(dayOf(dev.sale.at));
      if (p) {
        p.sold += 1;
        p.revenue += dev.sale.price;
        p.profit += profit(dev) ?? 0;
      }
    }
  }
  return [...points.values()].map((p) => ({ ...p, revenue: round(p.revenue, 2), profit: round(p.profit, 2) }));
}
