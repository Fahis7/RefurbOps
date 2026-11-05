import { describe, expect, it } from "vitest";
import { buildListingPrompt, parseListingResponse, templateListing } from "@/domain/listing";
import { listedDevice } from "./helpers";

/** The AI output is untrusted input: these tests pin down how we validate it. */
describe("AI listing guardrails", () => {
  const good = JSON.stringify({
    title: "Apple iPhone 13 128GB Midnight – Refurbished Grade A",
    description:
      "This refurbished iPhone 13 has passed a full quality check and has a healthy battery. It is in excellent cosmetic condition and comes with a 12 month warranty.",
  });

  it("accepts valid JSON, even when wrapped in extra text", () => {
    expect(parseListingResponse(`Sure! Here it is:\n${good}`)?.title).toMatch(/iPhone 13/);
  });

  it("rejects non-JSON output", () => {
    expect(parseListingResponse("Here is a great listing for your phone")).toBeNull();
  });

  it("rejects missing fields or too-short descriptions", () => {
    expect(parseListingResponse(JSON.stringify({ title: "x" }))).toBeNull();
    expect(parseListingResponse(JSON.stringify({ title: "x", description: "too short" }))).toBeNull();
  });

  it('rejects listings that call a refurbished device "brand new"', () => {
    const bad = JSON.stringify({ title: "Brand new iPhone 13", description: "x".repeat(60) });
    expect(parseListingResponse(bad)).toBeNull();
  });

  it("caps the title at 80 characters (marketplace limit)", () => {
    const long = JSON.stringify({ title: "A".repeat(120), description: "x".repeat(60) });
    expect(parseListingResponse(long)?.title).toHaveLength(80);
  });

  it("prompt contains only known facts and the no-invention rule", () => {
    const { state } = listedDevice();
    const prompt = buildListingPrompt(state.devices[0]);
    expect(prompt).toContain("ONLY the facts");
    expect(prompt).toContain('"batteryHealth": "92%"');
  });

  it("template fallback always produces a usable listing", () => {
    const { state } = listedDevice();
    const t = templateListing(state.devices[0]);
    expect(t.title.length).toBeLessThanOrEqual(80);
    expect(parseListingResponse(JSON.stringify(t))).not.toBeNull();
  });
});
