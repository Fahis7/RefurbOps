/**
 * Purchase currencies. The base currency is EUR: marketplaces sell in EUR, so
 * pricing, profit and stats always use the EUR value (Device.costPrice). Other
 * currencies only describe what we actually paid the supplier.
 */

export const SUPPORTED_CURRENCIES = ["EUR", "AED", "INR", "USD", "GBP"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const isCurrency = (c: unknown): c is CurrencyCode => SUPPORTED_CURRENCIES.includes(c as CurrencyCode);

export interface Rates {
  asOf: string; // date the rates are valid for, e.g. "2026-11-05"
  perEur: Record<CurrencyCode, number>; // units of each currency per 1 EUR
}

/**
 * DEMO rates, approximate, NOT live. Production would load daily rates from a
 * rates feed (e.g. the ECB reference rates) and cache them.
 */
export const DEMO_RATES: Rates = {
  asOf: "2026-11-05",
  perEur: { EUR: 1, AED: 4.02, INR: 93.5, USD: 1.09, GBP: 0.85 },
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Amount in `currency` → EUR, rounded to 2 decimals. */
export function toBase(amount: number, currency: CurrencyCode, rates: Rates = DEMO_RATES): number {
  return round2(amount / rates.perEur[currency]);
}

/** EUR → `currency`, rounded to 2 decimals (for hints such as the typical cost). */
export function fromBase(eur: number, currency: CurrencyCode, rates: Rates = DEMO_RATES): number {
  return round2(eur * rates.perEur[currency]);
}

/**
 * Display only: "AED 1,650.00", "₹35,000", "€410.00". Rupees are shown without paise.
 * The space after a code like "AED" is always U+00A0 (no line break between code and
 * number); ICU versions differ in which space they emit, so it is normalised here.
 */
export function formatMoney(amount: number, currency: CurrencyCode): string {
  const digits = currency === "INR" ? 0 : 2;
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .format(amount)
    .replace(/\s/g, " ");
}
