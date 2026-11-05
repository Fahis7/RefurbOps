// CSV export for Excel. Pure: no Date.now(), no DOM – `now` is passed in, downloading lives in src/client/download.ts.

import { MARKETPLACES, profit } from "./pricing";
import { formatStorage, type Device } from "./types";

export type Cell = string | number | null | undefined;

/** UTF-8 byte-order mark: without it Excel opens the file as ANSI and mangles € and ₹. */
export const CSV_BOM = "﻿";

const DAY_MS = 86_400_000;

/** Cells Excel/Sheets would run as a formula (CSV/formula injection). Tab and CR per OWASP. */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/**
 * One cell. Text that starts like a formula gets a leading apostrophe; numbers never do, so a
 * negative profit stays a number Excel can sum. Then RFC 4180 quoting: wrap in quotes if the cell
 * contains a comma, quote or line break, and double any quotes inside.
 */
function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = value;
  if (FORMULA_START.test(s)) s = `'${s}`;
  return NEEDS_QUOTES.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Comma-separated, CRLF line endings, BOM first. */
export function toCsv(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return CSV_BOM + [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/** Money is a float in the domain; round only here, at the 2-decimal boundary. */
const money = (n: number | null | undefined): number | null => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

const soldDate = (d: Device) => (d.sale ? d.sale.at.slice(0, 10) : null);

export const DEVICE_COLUMNS = [
  "SKU",
  "IMEI/Serial",
  "Brand",
  "Model",
  "Storage",
  "Colour",
  "Category",
  "Grade",
  "Stage",
  "Days in stage",
  "Supplier",
  "Paid amount",
  "Paid currency",
  "FX rate",
  "Cost EUR",
  "Repair EUR",
  "List price EUR",
  "Sold price EUR",
  "Marketplace",
  "Fee EUR",
  "Profit EUR",
  "Sold date",
] as const;

export function devicesToRows(devices: readonly Device[], now: string): Cell[][] {
  const nowMs = Date.parse(now);
  return devices.map((d) => {
    const enteredStage = Date.parse(d.history[d.history.length - 1].at);
    // Devices saved before multi-currency have no purchase record: their cost was always EUR.
    const paid = d.purchase ?? { amount: d.costPrice, currency: "EUR", rate: 1 };
    const row: Record<(typeof DEVICE_COLUMNS)[number], Cell> = {
      SKU: d.id,
      "IMEI/Serial": d.serial,
      Brand: d.brand,
      Model: d.model,
      Storage: formatStorage(d.storageGb),
      Colour: d.color,
      Category: d.category,
      Grade: d.grade ?? null,
      Stage: d.stage,
      "Days in stage": Math.round(((nowMs - enteredStage) / DAY_MS) * 10) / 10,
      Supplier: d.supplier,
      "Paid amount": money(paid.amount),
      "Paid currency": paid.currency,
      "FX rate": paid.rate,
      "Cost EUR": money(d.costPrice),
      "Repair EUR": money(d.repairCost),
      "List price EUR": money(d.listPrice),
      "Sold price EUR": money(d.sale?.price),
      Marketplace: d.sale ? MARKETPLACES[d.sale.marketplace].name : null,
      "Fee EUR": money(d.sale?.fee),
      "Profit EUR": profit(d),
      "Sold date": soldDate(d),
    };
    return DEVICE_COLUMNS.map((c) => row[c]);
  });
}

export const SALES_COLUMNS = [
  "SKU",
  "IMEI/Serial",
  "Brand",
  "Model",
  "Grade",
  "Marketplace",
  "Order ID",
  "Sold date",
  "Sold price EUR",
  "Fee EUR",
  "Cost EUR",
  "Repair EUR",
  "Profit EUR",
] as const;

export function salesToRows(devices: readonly Device[]): Cell[][] {
  return devices
    .filter((d) => d.stage === "SOLD" && d.sale)
    .map((d) => {
      const sale = d.sale!;
      const row: Record<(typeof SALES_COLUMNS)[number], Cell> = {
        SKU: d.id,
        "IMEI/Serial": d.serial,
        Brand: d.brand,
        Model: d.model,
        Grade: d.grade ?? null,
        Marketplace: MARKETPLACES[sale.marketplace].name,
        "Order ID": sale.orderId,
        "Sold date": soldDate(d),
        "Sold price EUR": money(sale.price),
        "Fee EUR": money(sale.fee),
        "Cost EUR": money(d.costPrice),
        "Repair EUR": money(d.repairCost),
        "Profit EUR": profit(d),
      };
      return SALES_COLUMNS.map((c) => row[c]);
    });
}

/** The repair-pipeline board filter: search box (SKU, serial, brand, model, colour, supplier) + "Show sold". */
export function filterDevices(devices: readonly Device[], query: string, showSold: boolean): Device[] {
  const q = query.trim().toLowerCase();
  return devices.filter(
    (d) =>
      (showSold || d.stage !== "SOLD") &&
      (!q || [d.id, d.serial, d.brand, d.model, d.color, d.supplier].join(" ").toLowerCase().includes(q)),
  );
}
