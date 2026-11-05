import { describe, expect, it } from "vitest";
import {
  CATALOG,
  isValidImei,
  looksLikeImei,
  lookupByImei,
  suggestModels,
  withCheckDigit,
  type CatalogEntry,
} from "@/domain/catalog";
import { STORAGE_OPTIONS_GB } from "@/domain/types";

const names = (entries: CatalogEntry[]) => entries.map((e) => `${e.brand} ${e.model}`);

describe("device catalog", () => {
  it("every storage option is an allowed size", () => {
    for (const e of CATALOG) {
      expect(e.storageOptions.length, e.model).toBeGreaterThan(0);
      for (const gb of e.storageOptions) expect(STORAGE_OPTIONS_GB, e.model).toContain(gb);
    }
  });

  it("phones have TAC prefixes, laptops have none", () => {
    for (const e of CATALOG) {
      if (e.category === "Smartphone") expect(e.tacPrefixes.length, e.model).toBeGreaterThan(0);
      if (e.category === "Laptop") expect(e.tacPrefixes, e.model).toEqual([]);
    }
  });
});

describe("suggestModels", () => {
  it("matches words in any order", () => {
    expect(names(suggestModels("pro 14"))).toContain("Apple iPhone 14 Pro");
  });

  it("is case-insensitive and respects the limit", () => {
    expect(names(suggestModels("GALAXY"))).toEqual(["Samsung Galaxy S22", "Samsung Galaxy S23"]);
    expect(suggestModels("apple", 2)).toHaveLength(2);
  });

  it("puts prefix matches first, then keeps catalog order", () => {
    const entry = (model: string): CatalogEntry => ({
      brand: "Acme",
      model,
      category: "Smartphone",
      storageOptions: [128],
      colors: ["Black"],
      typicalCost: 100,
      tacPrefixes: [],
    });
    const fixture = [entry("Mini Pro"), entry("Pro Max"), entry("Ultra Pro"), entry("Pro")];
    expect(suggestModels("pro", 6, fixture).map((e) => e.model)).toEqual(["Pro Max", "Pro", "Mini Pro", "Ultra Pro"]);
  });

  it("returns nothing for an empty query", () => {
    expect(suggestModels("")).toEqual([]);
    expect(suggestModels("   ")).toEqual([]);
  });
});

describe("IMEI", () => {
  it("accepts a known valid IMEI", () => {
    expect(isValidImei("490154203237518")).toBe(true);
  });

  it("rejects a wrong check digit, wrong length and non-digits", () => {
    expect(isValidImei("490154203237517")).toBe(false);
    expect(looksLikeImei("490154203237517")).toBe(true); // right shape, wrong checksum → the form warns
    expect(isValidImei("49015420323751")).toBe(false);
    expect(isValidImei("49015420323751X")).toBe(false);
    expect(looksLikeImei("SN38873066429")).toBe(false); // laptop serial → no IMEI warning
  });

  it("withCheckDigit always produces a valid IMEI", () => {
    for (const body of ["35000101000000", "35000401123456", "99999999999999"]) {
      expect(isValidImei(withCheckDigit(body)), body).toBe(true);
    }
  });

  it("looks up the model from the TAC", () => {
    expect(lookupByImei(withCheckDigit("35000101123456"))?.model).toBe("iPhone 13");
  });

  it("returns null for an unknown TAC or a too-short input", () => {
    expect(lookupByImei("490154203237518")).toBeNull();
    expect(lookupByImei("3500010")).toBeNull();
  });
});
