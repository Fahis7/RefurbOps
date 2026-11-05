import { describe, expect, it } from "vitest";
import {
  CSV_BOM,
  DEVICE_COLUMNS,
  SALES_COLUMNS,
  devicesToRows,
  filterDevices,
  salesToRows,
  toCsv,
} from "@/domain/export";
import { profit } from "@/domain/pricing";
import { receiveOrder } from "@/domain/service";
import type { AppState, Device } from "@/domain/types";
import { exportFileName } from "@/client/download";
import { T0, at, listedDevice, withDevice } from "./helpers";

/** Strip the BOM and split into rows of raw (still escaped) lines. */
const lines = (csv: string) => csv.slice(CSV_BOM.length).split("\r\n");

function soldDevice(price = 500): { state: AppState; device: Device } {
  const { state: s0, id } = listedDevice();
  const { state } = receiveOrder(s0, { marketplace: "backmarket", orderId: "BM-1", deviceId: id, price }, at(5));
  return { state, device: state.devices.find((d) => d.id === id)! };
}

const col = (row: unknown[], name: string, columns: readonly string[]) => row[columns.indexOf(name)];

describe("toCsv escaping", () => {
  it("quotes cells containing a comma", () => {
    expect(lines(toCsv(["a"], [["Smith, John"]]))[1]).toBe('"Smith, John"');
  });

  it("doubles quotes and wraps the cell", () => {
    expect(lines(toCsv(["a"], [['6.1" screen']]))[1]).toBe('"6.1"" screen"');
  });

  it("quotes cells containing newlines and separates rows with CRLF", () => {
    const csv = toCsv(["a", "b"], [["line1\nline2", "x"], ["r\r\nn", "y"]]);
    expect(csv).toBe(`${CSV_BOM}a,b\r\n"line1\nline2",x\r\n"r\r\nn",y`);
  });

  it("writes plain cells unquoted, numbers as numbers, null/undefined as empty", () => {
    expect(lines(toCsv(["a", "b", "c", "d"], [["iPhone 13", 1234.5, null, undefined]]))[1]).toBe("iPhone 13,1234.5,,");
  });
});

describe("toCsv formula-injection guard", () => {
  it("prefixes text starting with = + - @ tab or CR with an apostrophe", () => {
    const row = lines(toCsv(["a", "b", "c", "d", "e", "f"], [["=SUM(A1)", "+1", "-cmd", "@x", "\tx", "\rx"]]))[1];
    expect(row).toBe(`'=SUM(A1),'+1,'-cmd,'@x,'\tx,"'\rx"`);
  });

  it("guards before quoting", () => {
    expect(lines(toCsv(["a"], [['=HYPERLINK("http://x","y")']]))[1]).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it("does not touch negative numbers (they must stay summable in Excel)", () => {
    expect(lines(toCsv(["a"], [[-12.5]]))[1]).toBe("-12.5");
  });

  it("leaves text with = elsewhere alone", () => {
    expect(lines(toCsv(["a"], [["a=b"]]))[1]).toBe("a=b");
  });
});

describe("toCsv encoding", () => {
  it("starts with a UTF-8 BOM so Excel shows € and ₹", () => {
    const csv = toCsv(["Price €", "Paid ₹"], [["€ 1", "₹ 2"]]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Price €,Paid ₹");
    expect(new TextEncoder().encode(csv).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
  });
});

describe("devicesToRows", () => {
  it("has the 22 agreed columns in order", () => {
    expect(DEVICE_COLUMNS).toEqual([
      "SKU", "IMEI/Serial", "Brand", "Model", "Storage", "Colour", "Category", "Grade", "Stage", "Days in stage",
      "Supplier", "Paid amount", "Paid currency", "FX rate", "Cost EUR", "Repair EUR", "List price EUR",
      "Sold price EUR", "Marketplace", "Fee EUR", "Profit EUR", "Sold date",
    ]);
  });

  it("profit column = sale price − fee − cost − repair, same as profit()", () => {
    const { device } = soldDevice(500);
    const [row] = devicesToRows([device], at(6));
    const expected = Math.round((500 - device.sale!.fee - device.costPrice - device.repairCost) * 100) / 100;
    expect(col(row, "Profit EUR", DEVICE_COLUMNS)).toBe(expected);
    expect(col(row, "Profit EUR", DEVICE_COLUMNS)).toBe(profit(device));
    expect(col(row, "Sold price EUR", DEVICE_COLUMNS)).toBe(500);
    expect(col(row, "Fee EUR", DEVICE_COLUMNS)).toBe(device.sale!.fee);
    expect(col(row, "Marketplace", DEVICE_COLUMNS)).toBe("Back Market");
    expect(col(row, "Sold date", DEVICE_COLUMNS)).toBe(at(5).slice(0, 10));
    expect(col(row, "Stage", DEVICE_COLUMNS)).toBe("SOLD");
  });

  it("leaves sale columns empty for unsold devices", () => {
    const { state } = withDevice();
    const [row] = devicesToRows(state.devices, at(1));
    for (const c of ["Sold price EUR", "Marketplace", "Fee EUR", "Profit EUR", "Sold date", "List price EUR", "Grade"]) {
      expect(col(row, c, DEVICE_COLUMNS)).toBeNull();
    }
  });

  it("computes days in stage from the given now, 1 decimal", () => {
    const { state } = withDevice(); // received at T0
    const [row] = devicesToRows(state.devices, at(36));
    expect(col(row, "Days in stage", DEVICE_COLUMNS)).toBe(1.5);
  });

  it("exports the purchase as paid, with the frozen FX rate", () => {
    const { state } = withDevice({ costPrice: 1650, currency: "AED" });
    const d = state.devices[0];
    const [row] = devicesToRows([d], T0);
    expect(col(row, "Paid amount", DEVICE_COLUMNS)).toBe(1650);
    expect(col(row, "Paid currency", DEVICE_COLUMNS)).toBe("AED");
    expect(col(row, "FX rate", DEVICE_COLUMNS)).toBe(d.purchase!.rate);
    expect(col(row, "Cost EUR", DEVICE_COLUMNS)).toBe(d.costPrice);
  });

  it("legacy devices without a purchase record export cost / EUR / 1", () => {
    const { state } = withDevice();
    const legacy: Device = { ...state.devices[0], purchase: undefined, costPrice: 280 };
    const [row] = devicesToRows([legacy], T0);
    expect(col(row, "Paid amount", DEVICE_COLUMNS)).toBe(280);
    expect(col(row, "Paid currency", DEVICE_COLUMNS)).toBe("EUR");
    expect(col(row, "FX rate", DEVICE_COLUMNS)).toBe(1);
  });
});

describe("salesToRows", () => {
  it("only includes SOLD devices, with profit", () => {
    const { state: sold, device } = soldDevice(450);
    const { state: other } = withDevice({ serial: "356789104523995" });
    const rows = salesToRows([...sold.devices, ...other.devices]);
    expect(rows).toHaveLength(1);
    expect(col(rows[0], "SKU", SALES_COLUMNS)).toBe(device.id);
    expect(col(rows[0], "Order ID", SALES_COLUMNS)).toBe("BM-1");
    expect(col(rows[0], "Profit EUR", SALES_COLUMNS)).toBe(profit(device));
  });
});

describe("filterDevices (same filter the pipeline board and its export use)", () => {
  const { device: sold } = soldDevice();
  const mk = (id: string, model: string, supplier: string): Device => ({ ...sold, id, model, supplier, stage: "REPAIR", sale: undefined });
  const devices = [mk("RO-1", "iPhone 13", "TradeIn EU"), mk("RO-2", "Galaxy S22", "Bulk GmbH"), { ...sold, id: "RO-3", model: "iPhone 12" }];

  it("only includes devices matching the search box", () => {
    expect(filterDevices(devices, "galaxy", true).map((d) => d.id)).toEqual(["RO-2"]);
    expect(filterDevices(devices, "  BULK ", true).map((d) => d.id)).toEqual(["RO-2"]);
  });

  it("excludes SOLD devices unless Show sold is on", () => {
    expect(filterDevices(devices, "iphone", false).map((d) => d.id)).toEqual(["RO-1"]);
    expect(filterDevices(devices, "iphone", true).map((d) => d.id)).toEqual(["RO-1", "RO-3"]);
    expect(filterDevices(devices, "", false).map((d) => d.id)).toEqual(["RO-1", "RO-2"]);
  });

  it("the exported CSV contains exactly the filtered rows", () => {
    const csv = toCsv(DEVICE_COLUMNS, devicesToRows(filterDevices(devices, "iphone", false), at(6)));
    const body = lines(csv).slice(1);
    expect(body).toHaveLength(1);
    expect(body[0].startsWith("RO-1,")).toBe(true);
  });
});

describe("exportFileName", () => {
  it("uses the local calendar date", () => {
    expect(exportFileName("devices", new Date(2026, 10, 6, 0, 30))).toBe("refurbops-devices-2026-11-06.csv");
    expect(exportFileName("sales", new Date(2026, 0, 9, 23, 59))).toBe("refurbops-sales-2026-01-09.csv");
  });
});
