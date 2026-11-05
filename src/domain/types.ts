// Domain types for RefurbOps: one refurbished device moving through the pipeline.

import type { CurrencyCode } from "./currency";

export const STAGES = ["RECEIVED", "GRADING", "REPAIR", "QC", "LISTED", "SOLD"] as const;
export type Stage = (typeof STAGES)[number];

export type Grade = "A" | "B" | "C";
export type Category = "Smartphone" | "Laptop" | "Tablet";

export type MarketplaceId = "backmarket" | "refurbed" | "amazon";

/** Storage sizes devices actually ship with. Intake rejects anything else. */
export const STORAGE_OPTIONS_GB: readonly number[] = [32, 64, 128, 256, 512, 1024, 2048];

/** 128 → "128 GB", 1024 → "1 TB". Used by the UI and the listing text. */
export const formatStorage = (gb: number) => (gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`);

export interface StageEvent {
  stage: Stage;
  at: string; // ISO timestamp
  note?: string;
}

export interface QCResult {
  checkId: string;
  passed: boolean;
}

/** What we actually paid the supplier, with the FX rate frozen at intake (history never changes). */
export interface Purchase {
  amount: number; // in `currency`, e.g. 1650
  currency: CurrencyCode; // e.g. "AED"
  rate: number; // units of `currency` per 1 EUR at intake, e.g. 4.02 (EUR → 1)
  rateAsOf: string; // date of that rate, e.g. "2026-11-05"
}

export interface Device {
  id: string; // internal SKU, e.g. RO-1024
  serial: string; // IMEI or serial number
  brand: string;
  model: string;
  category: Category;
  storageGb: number;
  color: string;
  supplier: string;
  costPrice: number; // what we paid for it, in EUR – the ONLY value pricing, profit and stats use
  purchase?: Purchase; // set on every new device; optional only for records saved before multi-currency
  repairCost: number; // parts + labour (EUR)
  cosmeticScore: number; // 1 (bad) .. 5 (like new), set at grading
  batteryHealth: number; // percent
  stage: Stage;
  history: StageEvent[];
  qc: QCResult[];
  grade?: Grade;
  listPrice?: number;
  listing?: { title: string; description: string; source: "ai" | "template" };
  sale?: { marketplace: MarketplaceId; orderId: string; price: number; fee: number; at: string };
}

export type ListingStatus = "ACTIVE" | "DELISTED" | "SOLD";

export interface MarketplaceListing {
  deviceId: string;
  marketplace: MarketplaceId;
  status: ListingStatus;
  price: number;
  updatedAt: string;
}

export type SyncLevel = "info" | "success" | "warning" | "error";

export interface SyncLogEntry {
  id: string;
  at: string;
  level: SyncLevel;
  marketplace?: MarketplaceId;
  deviceId?: string;
  message: string;
}

export interface OrderEvent {
  marketplace: MarketplaceId;
  orderId: string; // marketplace's own order id - used for idempotency
  deviceId: string;
  price: number;
}

export interface AppState {
  devices: Device[];
  listings: MarketplaceListing[];
  syncLog: SyncLogEntry[];
  processedOrderIds: string[]; // "<marketplace>:<orderId>" already handled
  nextSku: number;
  nextLogId: number; // kept in state (not a module global) so IDs are deterministic and unique
}

export interface NewDeviceInput {
  serial: string;
  brand: string;
  model: string;
  category: Category;
  storageGb: number;
  color: string;
  supplier: string;
  costPrice: number; // amount paid, in `currency`
  currency?: CurrencyCode; // omitted → "EUR", so older API callers behave as before
  batteryHealth: number;
}

/** Thrown for business-rule violations; API routes turn it into HTTP 400. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
