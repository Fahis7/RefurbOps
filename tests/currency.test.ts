import { describe, expect, it } from "vitest";
import { DEMO_RATES, formatMoney, fromBase, toBase, type Rates } from "@/domain/currency";
import type { AppState } from "@/domain/types";
import { addDevice, receiveOrder } from "@/domain/service";
import { emptyState } from "@/domain/seed";
import { profit } from "@/domain/pricing";
import { T0, at, listedDevice, withDevice } from "./helpers";

const device = (state: AppState, id: string) => state.devices.find((d) => d.id === id)!;

describe("currency conversion (EUR base)", () => {
  it("converts AED to EUR, rounded to 2 decimals", () => {
    expect(toBase(1650, "AED", DEMO_RATES)).toBe(410.45); // 1650 / 4.02 = 410.4477…
  });

  it("converts INR to EUR, rounded to 2 decimals", () => {
    expect(toBase(35000, "INR", DEMO_RATES)).toBe(374.33); // 35000 / 93.5 = 374.3315…
  });

  it("leaves EUR unchanged and rounds other currencies to cents", () => {
    expect(toBase(410, "EUR", DEMO_RATES)).toBe(410);
    expect(toBase(100, "USD", DEMO_RATES)).toBe(91.74); // 100 / 1.09 = 91.7431…
  });

  it("converts EUR into another currency for display hints", () => {
    expect(fromBase(410, "AED", DEMO_RATES)).toBe(1648.2);
  });

  it("formats money per currency", () => {
    expect(formatMoney(1650, "AED")).toBe("AED 1,650.00"); // non-breaking space: "AED" never wraps alone
    expect(formatMoney(35000, "INR")).toBe("₹35,000");
    expect(formatMoney(410, "EUR")).toBe("€410.00");
  });
});

describe("multi-currency intake", () => {
  it("accepts INR 35,000 (the €10,000 limit applies after conversion)", () => {
    const { state, id } = withDevice({ costPrice: 35000, currency: "INR" });
    expect(device(state, id)).toMatchObject({ costPrice: 374.33, purchase: { amount: 35000, currency: "INR" } });
  });

  it("rejects a purchase worth more than €10,000 after conversion", () => {
    expect(() => withDevice({ costPrice: 11000, currency: "USD" })).toThrow(
      "costPrice must be at most €10,000 after conversion to EUR (got €10,091.74)",
    );
  });

  it("rejects an unsupported currency", () => {
    expect(() => withDevice({ currency: "JPY" })).toThrow("currency must be one of EUR, AED, INR, USD, GBP");
  });

  it("defaults to EUR when no currency is sent (old API callers)", () => {
    const { state, id } = withDevice({ costPrice: 280 });
    expect(device(state, id)).toMatchObject({
      costPrice: 280,
      purchase: { amount: 280, currency: "EUR", rate: 1, rateAsOf: DEMO_RATES.asOf },
    });
  });

  it("rejects an amount of 0", () => {
    expect(() => withDevice({ costPrice: 0 })).toThrow("costPrice must be greater than 0");
  });

  it("stores the rate snapshot, so later rate changes don't rewrite history", () => {
    const base = { brand: "Apple", model: "iPhone 13", category: "Smartphone", storageGb: 128, color: "Blue", supplier: "Gulf", batteryHealth: 90 } as const;
    const ratesLater: Rates = { asOf: "2026-12-01", perEur: { ...DEMO_RATES.perEur, AED: 3.9 } };
    let state = addDevice(emptyState(), { ...base, serial: "A-1", costPrice: 1650, currency: "AED" }, T0, DEMO_RATES);
    const first = state.devices[0].id;
    state = addDevice(state, { ...base, serial: "A-2", costPrice: 1650, currency: "AED" }, T0, ratesLater);

    expect(device(state, first)).toMatchObject({ costPrice: 410.45, purchase: { amount: 1650, currency: "AED", rate: 4.02, rateAsOf: "2026-11-05" } });
    expect(state.devices[0]).toMatchObject({ costPrice: 423.08, purchase: { rate: 3.9, rateAsOf: "2026-12-01" } });
  });

  it("computes profit in EUR for a device bought in AED", () => {
    const { state, id } = listedDevice({ costPrice: 1650, currency: "AED" });
    const sold = receiveOrder(state, { marketplace: "backmarket", orderId: "BM-1", deviceId: id, price: 700 }, at(5)).state;
    // 700 sale − 70 fee (10 %) − 410.45 EUR cost − 0 repairs
    expect(profit(device(sold, id))).toBe(219.55);
  });
});
