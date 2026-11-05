/**
 * Device catalog + pure intake helpers (model search, IMEI checks, TAC lookup).
 * Shared by the seed data and the intake form, so matching logic lives in ONE place.
 */
import type { Category } from "./types";

export interface CatalogEntry {
  brand: string;
  model: string;
  category: Category;
  storageOptions: number[]; // subset of STORAGE_OPTIONS_GB (checked by tests)
  colors: string[];
  typicalCost: number; // EUR purchase price – a hint for the buyer, never auto-filled
  /**
   * First 8 digits of the IMEI (Type Allocation Code).
   * DEMO VALUES ONLY: real TACs come from the licensed GSMA database. These are made up
   * (deliberately sequential) and may not match any real device. Wi-Fi tablets and
   * laptops have no IMEI, so they have none.
   */
  tacPrefixes: string[];
}

export const CATALOG: CatalogEntry[] = [
  { brand: "Apple", model: "iPhone 13", category: "Smartphone", storageOptions: [128, 256, 512], colors: ["Midnight", "Starlight", "Blue"], typicalCost: 280, tacPrefixes: ["35000101", "35000102"] },
  { brand: "Apple", model: "iPhone 14 Pro", category: "Smartphone", storageOptions: [128, 256, 512, 1024], colors: ["Space Black", "Deep Purple"], typicalCost: 520, tacPrefixes: ["35000201"] },
  { brand: "Apple", model: "iPhone 12", category: "Smartphone", storageOptions: [64, 128, 256], colors: ["Black", "White"], typicalCost: 190, tacPrefixes: ["35000301"] },
  { brand: "Apple", model: "iPhone 15", category: "Smartphone", storageOptions: [128, 256, 512], colors: ["Pink", "Black", "Blue"], typicalCost: 410, tacPrefixes: ["35000401"] },
  { brand: "Samsung", model: "Galaxy S22", category: "Smartphone", storageOptions: [128, 256], colors: ["Phantom Black", "Green"], typicalCost: 240, tacPrefixes: ["35000501"] },
  { brand: "Samsung", model: "Galaxy S23", category: "Smartphone", storageOptions: [128, 256, 512], colors: ["Cream", "Lavender"], typicalCost: 360, tacPrefixes: ["35000601"] },
  { brand: "Google", model: "Pixel 7", category: "Smartphone", storageOptions: [128, 256], colors: ["Obsidian", "Snow"], typicalCost: 200, tacPrefixes: ["35000701"] },
  { brand: "Apple", model: "MacBook Air M1", category: "Laptop", storageOptions: [256, 512, 1024, 2048], colors: ["Space Grey", "Silver"], typicalCost: 430, tacPrefixes: [] },
  { brand: "Apple", model: 'MacBook Pro 14" M1 Pro', category: "Laptop", storageOptions: [512, 1024, 2048], colors: ["Space Grey"], typicalCost: 900, tacPrefixes: [] },
  { brand: "Dell", model: "XPS 13 9310", category: "Laptop", storageOptions: [256, 512, 1024], colors: ["Platinum Silver"], typicalCost: 380, tacPrefixes: [] },
  { brand: "Lenovo", model: "ThinkPad T14 Gen 2", category: "Laptop", storageOptions: [256, 512, 1024], colors: ["Black"], typicalCost: 300, tacPrefixes: [] },
  { brand: "Apple", model: "iPad Air 5", category: "Tablet", storageOptions: [64, 256], colors: ["Blue", "Starlight"], typicalCost: 290, tacPrefixes: [] },
  { brand: "Apple", model: "iPad 9th gen", category: "Tablet", storageOptions: [64, 256], colors: ["Space Grey", "Silver"], typicalCost: 150, tacPrefixes: [] },
];

/**
 * Model search for the intake form. Every word of the query must appear in
 * "brand model" (any order, case-insensitive). Entries whose name or model starts
 * with the whole query come first; otherwise catalog order is kept.
 */
export function suggestModels(query: string, limit = 6, catalog: CatalogEntry[] = CATALOG): CatalogEntry[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [];
  const words = q.split(" ");
  const scored = catalog.flatMap((entry, index) => {
    const model = entry.model.toLowerCase();
    const full = `${entry.brand.toLowerCase()} ${model}`;
    if (!words.every((w) => full.includes(w))) return [];
    const prefix = full.startsWith(q) || model.startsWith(q);
    return [{ entry, index, rank: prefix ? 0 : 1 }];
  });
  return scored
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.entry);
}

/** Luhn check digit for the first 14 digits of an IMEI. */
export function imeiCheckDigit(body14: string): number {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body14[i]);
    if (i % 2 === 1) {
      d *= 2; // double every second digit, counting from the left
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/** Shaped like an IMEI (15 digits) – the checksum may still be wrong. */
export function looksLikeImei(serial: string): boolean {
  return /^\d{15}$/.test(serial);
}

/** 15 digits and a correct Luhn check digit. */
export function isValidImei(imei: string): boolean {
  return looksLikeImei(imei) && imeiCheckDigit(imei.slice(0, 14)) === Number(imei[14]);
}

/** 14 digits → full 15-digit IMEI. Used by the seed and the "Fill example" button. */
export function withCheckDigit(body14: string): string {
  return body14 + imeiCheckDigit(body14);
}

/** Catalog entry whose TAC matches the first 8 digits, or null. Does not check the checksum. */
export function lookupByImei(imei: string): CatalogEntry | null {
  if (!/^\d{8}/.test(imei)) return null;
  const tac = imei.slice(0, 8);
  return CATALOG.find((e) => e.tacPrefixes.includes(tac)) ?? null;
}
