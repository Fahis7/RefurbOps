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
