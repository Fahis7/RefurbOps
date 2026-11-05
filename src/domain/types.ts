// Domain types for RefurbOps: one refurbished device moving through the pipeline.

export const STAGES = ["RECEIVED", "GRADING", "REPAIR", "QC", "LISTED", "SOLD"] as const;
export type Stage = (typeof STAGES)[number];

export type Grade = "A" | "B" | "C";
export type Category = "Smartphone" | "Laptop" | "Tablet";

export type MarketplaceId = "backmarket" | "refurbed" | "amazon";

export interface StageEvent {
  stage: Stage;
  at: string; // ISO timestamp
  note?: string;
}

export interface QCResult {
  checkId: string;
  passed: boolean;
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
  costPrice: number; // what we paid for it (EUR)
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
  costPrice: number;
  batteryHealth: number;
}

/** Thrown for business-rule violations; API routes turn it into HTTP 400. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
