import type { AppState, Category, MarketplaceId } from "./types";
import { addDevice, approveAndList, completeRepair, grade, move, receiveOrder, recordQC, setListingText } from "./service";
import { checksFor } from "./qc";
import { MARKETPLACES, MARKETPLACE_IDS } from "./pricing";
import { templateListing } from "./listing";

/**
 * Demo data. Instead of hand-writing JSON, the seed REPLAYS realistic history
 * through the real service functions – so seed data can never break the rules.
 */

const CATALOG: { brand: string; model: string; category: Category; storageGb: number; cost: number; colors: string[] }[] = [
  { brand: "Apple", model: "iPhone 13", category: "Smartphone", storageGb: 128, cost: 280, colors: ["Midnight", "Starlight", "Blue"] },
  { brand: "Apple", model: "iPhone 14 Pro", category: "Smartphone", storageGb: 256, cost: 520, colors: ["Space Black", "Deep Purple"] },
  { brand: "Apple", model: "iPhone 12", category: "Smartphone", storageGb: 64, cost: 190, colors: ["Black", "White"] },
  { brand: "Samsung", model: "Galaxy S22", category: "Smartphone", storageGb: 128, cost: 240, colors: ["Phantom Black", "Green"] },
  { brand: "Samsung", model: "Galaxy S23", category: "Smartphone", storageGb: 256, cost: 360, colors: ["Cream", "Lavender"] },
  { brand: "Google", model: "Pixel 7", category: "Smartphone", storageGb: 128, cost: 200, colors: ["Obsidian", "Snow"] },
  { brand: "Apple", model: "MacBook Air M1", category: "Laptop", storageGb: 256, cost: 430, colors: ["Space Grey", "Silver"] },
  { brand: "Apple", model: 'MacBook Pro 14" M1 Pro', category: "Laptop", storageGb: 512, cost: 900, colors: ["Space Grey"] },
  { brand: "Dell", model: "XPS 13 9310", category: "Laptop", storageGb: 512, cost: 380, colors: ["Platinum Silver"] },
  { brand: "Lenovo", model: "ThinkPad T14 Gen 2", category: "Laptop", storageGb: 256, cost: 300, colors: ["Black"] },
  { brand: "Apple", model: "iPad Air 5", category: "Tablet", storageGb: 64, cost: 290, colors: ["Blue", "Starlight"] },
  { brand: "Apple", model: "iPad 9th gen", category: "Tablet", storageGb: 64, cost: 150, colors: ["Space Grey", "Silver"] },
];

const SUPPLIERS = ["TradeIn Partner EU", "Corporate Lease Returns", "Carrier Buyback FR", "B2B Wholesale DE"];
const REPAIRS = [
  { note: "Battery replacement", cost: 35 },
  { note: "Screen replacement", cost: 85 },
  { note: "Charging port replaced", cost: 25 },
  { note: "Rear glass replaced", cost: 45 },
  { note: "Keyboard replaced", cost: 60 },
];

// Small deterministic PRNG so the demo looks the same every reset.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function emptyState(): AppState {
  return { devices: [], listings: [], syncLog: [], processedOrderIds: [], nextSku: 1001, nextLogId: 1 };
}

export function seedState(nowIso: string, count = 42): AppState {
  const rand = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const now = Date.parse(nowIso);
  const DAY = 86_400_000;
  let state = emptyState();
  let orderNo = 50000;

  // Process devices oldest-first so the activity log reads in time order.
  const plans = Array.from({ length: count }, (_, i) => ({ i, age: 0.2 + rand() ** 1.5 * 36 })).sort((a, b) => b.age - a.age);

  for (const { i, age } of plans) {
    const item = pick(CATALOG);
    let t = now - age * DAY;
    const iso = () => new Date(t).toISOString();
    const step = (minDays: number, maxDays: number) => {
      t += (minDays + rand() * (maxDays - minDays)) * DAY;
      return t < now;
    };

    state = addDevice(
      state,
      {
        serial: `${item.category === "Laptop" ? "SN" : "35"}${String(100000000 + Math.floor(rand() * 899999999))}${i}`,
        brand: item.brand,
        model: item.model,
        category: item.category,
        storageGb: item.storageGb,
        color: pick(item.colors),
        supplier: pick(SUPPLIERS),
        costPrice: Math.round(item.cost * (0.85 + rand() * 0.3)),
        batteryHealth: Math.round(76 + rand() * 22),
      },
      iso(),
    );
    const id = state.devices[0].id;

    if (!step(0.2, 1.5)) continue;
    state = move(state, id, "GRADING", iso());

    if (!step(0.2, 1)) continue;
    const battery = state.devices[0].batteryHealth;
    const needsRepair = battery < 82 || rand() < 0.45;
    state = grade(state, id, { cosmeticScore: 2 + Math.floor(rand() * 4), batteryHealth: battery, needsRepair }, iso());

    if (needsRepair) {
      if (!step(1, 4.5)) continue;
      const r = battery < 82 ? REPAIRS[0] : pick(item.category === "Laptop" ? [REPAIRS[0], REPAIRS[4]] : REPAIRS.slice(0, 4));
      state = completeRepair(state, id, r, iso());
    }

    // QC – about 1 in 6 devices fails a check and goes back to repair.
    if (!step(0.3, 1.2)) continue;
    const checks = checksFor(item.category);
    if (rand() < 0.17) {
      const failed = pick(checks.filter((c) => c.id !== "wipe"));
      for (const c of checks) state = recordQC(state, id, c.id, c.id !== failed.id);
      state = move(state, id, "REPAIR", iso(), `QC failed: ${failed.label}`);
      if (!step(0.5, 2)) continue;
      state = completeRepair(state, id, { cost: 30, note: `Fixed: ${failed.label}` }, iso());
      if (!step(0.3, 1)) continue;
    }
    const d = state.devices.find((x) => x.id === id)!;
    if (d.stage !== "QC") continue;
    // Some devices are mid-QC right now: only some checks done.
    const finished = !step(0, 0.6) ? Math.floor(rand() * checks.length) : checks.length;
    for (const c of checks.slice(0, finished)) state = recordQC(state, id, c.id, true);
    if (finished < checks.length) continue;

    state = setListingText(state, id, { ...templateListing(d), source: "template" });
    const mps: MarketplaceId[] = rand() < 0.75 ? [...MARKETPLACE_IDS] : MARKETPLACE_IDS.slice(0, 2);
    state = approveAndList(state, id, mps, iso());

    if (!step(2, 14)) continue;
    const listed = state.devices.find((x) => x.id === id)!;
    const mp = pick(mps);
    const discount = 1 - Math.floor(rand() * 3) * 0.03; // accepted offers / promos
    orderNo += 1 + Math.floor(rand() * 40);
    state = receiveOrder(
      state,
      { marketplace: mp, orderId: `${MARKETPLACES[mp].code}-${orderNo}`, deviceId: id, price: Math.round(listed.listPrice! * discount) },
      iso(),
    ).state;
  }
  return state;
}
