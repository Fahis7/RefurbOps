import type { Device, Grade, MarketplaceId } from "./types";

export const MARKETPLACES: Record<MarketplaceId, { name: string; code: string; feeRate: number }> = {
  backmarket: { name: "Back Market", code: "BM", feeRate: 0.1 },
  refurbed: { name: "refurbed", code: "RF", feeRate: 0.12 },
  amazon: { name: "Amazon Renewed", code: "AZ", feeRate: 0.15 },
};

export const MARKETPLACE_IDS = Object.keys(MARKETPLACES) as MarketplaceId[];

const GRADE_FACTOR: Record<Grade, number> = { A: 1, B: 0.93, C: 0.85 };
const TARGET_MARGIN = 0.6; // aim for ~60% markup over total cost before grade discount

/** Suggested list price: total cost + target margin, discounted by grade, rounded to x9. */
export function suggestPrice(device: Pick<Device, "costPrice" | "repairCost">, grade: Grade): number {
  const base = (device.costPrice + device.repairCost) * (1 + TARGET_MARGIN) * GRADE_FACTOR[grade];
  return Math.max(19, Math.round(base / 10) * 10 - 1);
}

export function marketplaceFee(marketplace: MarketplaceId, price: number): number {
  return Math.round(price * MARKETPLACES[marketplace].feeRate * 100) / 100;
}

/** Profit = sale price − marketplace fee − purchase cost − repair cost. */
export function profit(device: Device): number | null {
  if (!device.sale) return null;
  return Math.round((device.sale.price - device.sale.fee - device.costPrice - device.repairCost) * 100) / 100;
}
