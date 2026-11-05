import {
  DomainError,
  type AppState,
  type MarketplaceId,
  type OrderEvent,
  type SyncLevel,
  type SyncLogEntry,
} from "./types";
import { MARKETPLACES, MARKETPLACE_IDS, marketplaceFee } from "./pricing";

/**
 * Marketplace stock sync.
 *
 * Each refurbished device is a single physical unit, but we list it on several
 * marketplaces at once. The core problem: when it sells on one, it must disappear
 * from the others before a second customer buys it (an "oversell").
 *
 * Rules implemented here:
 *  1. Idempotency  – the same order webhook delivered twice is processed once.
 *  2. First wins   – the first valid order marks the device SOLD.
 *  3. Delist rest  – every other active listing for that device is delisted.
 *  4. Reject late  – a second order for an already-sold device is rejected and
 *                    flagged for cancellation instead of creating a double sale.
 */

export function log(
  state: AppState,
  level: SyncLevel,
  message: string,
  at: string,
  extra: Partial<SyncLogEntry> = {},
): AppState {
  const entry: SyncLogEntry = { id: `log-${state.nextLogId}`, at, level, message, ...extra };
  return { ...state, nextLogId: state.nextLogId + 1, syncLog: [entry, ...state.syncLog].slice(0, 200) };
}

/** Publish a LISTED device to the chosen marketplaces. */
export function publishListings(
  state: AppState,
  deviceId: string,
  marketplaces: MarketplaceId[],
  at: string,
): AppState {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device) throw new DomainError(`Device ${deviceId} not found`);
  if (device.stage !== "LISTED") throw new DomainError("Only LISTED devices can be published");
  if (!device.listPrice) throw new DomainError("Device has no list price");
  if (marketplaces.length === 0) throw new DomainError("Choose at least one marketplace");

  let next = state;
  for (const mp of marketplaces) {
    const others = next.listings.filter((l) => !(l.deviceId === deviceId && l.marketplace === mp));
    next = {
      ...next,
      listings: [...others, { deviceId, marketplace: mp, status: "ACTIVE", price: device.listPrice, updatedAt: at }],
    };
    next = log(next, "info", `Listed ${deviceId} at €${device.listPrice}`, at, { marketplace: mp, deviceId });
  }
  return next;
}

export type OrderOutcome = "PROCESSED" | "DUPLICATE" | "REJECTED_OVERSELL";

/** Handle an incoming order webhook from a marketplace. */
export function handleOrder(state: AppState, order: OrderEvent, at: string): { state: AppState; outcome: OrderOutcome } {
  const key = `${order.marketplace}:${order.orderId}`;
  const mpName = MARKETPLACES[order.marketplace].name;

  // 1. Idempotency: webhooks are retried, so never process the same order twice.
  if (state.processedOrderIds.includes(key)) {
    const s = log(state, "info", `Duplicate webhook for order ${order.orderId} ignored`, at, {
      marketplace: order.marketplace,
      deviceId: order.deviceId,
    });
    return { state: s, outcome: "DUPLICATE" };
  }

  const device = state.devices.find((d) => d.id === order.deviceId);
  if (!device) throw new DomainError(`Unknown device ${order.deviceId}`);
  let next: AppState = { ...state, processedOrderIds: [...state.processedOrderIds, key] };

  // 4. Oversell guard: device already sold elsewhere (or never listed here).
  const listing = next.listings.find((l) => l.deviceId === device.id && l.marketplace === order.marketplace);
  if (device.stage === "SOLD" || !listing || listing.status !== "ACTIVE") {
    next = log(
      next,
      "error",
      `Oversell blocked: ${device.id} already sold – order ${order.orderId} on ${mpName} flagged for cancellation`,
      at,
      { marketplace: order.marketplace, deviceId: device.id },
    );
    return { state: next, outcome: "REJECTED_OVERSELL" };
  }

  // 2. First valid order wins.
  const fee = marketplaceFee(order.marketplace, order.price);
  next = {
    ...next,
    devices: next.devices.map((d) =>
      d.id === device.id
        ? {
            ...d,
            stage: "SOLD" as const,
            history: [...d.history, { stage: "SOLD" as const, at, note: `Order ${order.orderId} on ${mpName}` }],
            sale: { marketplace: order.marketplace, orderId: order.orderId, price: order.price, fee, at },
          }
        : d,
    ),
    listings: next.listings.map((l) => {
      if (l.deviceId !== device.id) return l;
      if (l.marketplace === order.marketplace) return { ...l, status: "SOLD" as const, updatedAt: at };
      // 3. Delist from every other marketplace.
      return l.status === "ACTIVE" ? { ...l, status: "DELISTED" as const, updatedAt: at } : l;
    }),
  };
  next = log(next, "success", `Sold ${device.id} for €${order.price} (order ${order.orderId})`, at, {
    marketplace: order.marketplace,
    deviceId: device.id,
  });
  for (const mp of MARKETPLACE_IDS) {
    const l = state.listings.find((x) => x.deviceId === device.id && x.marketplace === mp);
    if (mp !== order.marketplace && l?.status === "ACTIVE") {
      next = log(next, "warning", `Delisted ${device.id} – sold on ${mpName}`, at, { marketplace: mp, deviceId: device.id });
    }
  }
  return { state: next, outcome: "PROCESSED" };
}
