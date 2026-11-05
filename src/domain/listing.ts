import { formatStorage, type Device } from "./types";
import { checksFor } from "./qc";

const GRADE_TEXT = {
  A: "Excellent – like new, no visible signs of use",
  B: "Very good – light micro-scratches, invisible at arm's length",
  C: "Good – visible signs of use, fully functional",
} as const;

/** Facts the listing is allowed to mention. The AI only sees these. */
export function listingFacts(device: Device) {
  return {
    brand: device.brand,
    model: device.model,
    category: device.category,
    storage: formatStorage(device.storageGb),
    color: device.color,
    grade: device.grade ?? "B",
    gradeMeaning: GRADE_TEXT[device.grade ?? "B"],
    batteryHealth: `${device.batteryHealth}%`,
    qcChecksPassed: checksFor(device.category).map((c) => c.label),
    warranty: "12-month",
  };
}

/** Prompt for the LLM. Strict about not inventing specs – a real risk with AI copy. */
export function buildListingPrompt(device: Device): string {
  return [
    "You write product listings for a refurbished electronics marketplace.",
    "Write a listing using ONLY the facts below. Do not invent specs, accessories or claims.",
    "Never say 'new' – say 'refurbished'. Be honest about the cosmetic grade.",
    'Reply with JSON only: {"title": string (max 80 chars), "description": string (60-120 words, plain text)}',
    "",
    "FACTS:",
    JSON.stringify(listingFacts(device), null, 2),
  ].join("\n");
}

/** Deterministic fallback when no AI key is configured (and in the offline demo). */
export function templateListing(device: Device): { title: string; description: string } {
  const f = listingFacts(device);
  const title = `${f.brand} ${f.model} ${f.storage} ${f.color} – Refurbished, Grade ${f.grade}`.slice(0, 80);
  const description =
    `Professionally refurbished ${f.brand} ${f.model} (${f.storage}, ${f.color}). ` +
    `Cosmetic condition: ${f.gradeMeaning}. Battery health ${f.batteryHealth}. ` +
    `Every unit passes our ${f.qcChecksPassed.length}-point quality check, including ` +
    `${f.qcChecksPassed.slice(0, 3).map((s) => s.toLowerCase()).join(", ")} and a full data wipe. ` +
    `Ships unlocked and ready to use, with a ${f.warranty} warranty. ` +
    `Choosing refurbished saves money and keeps electronics out of landfill.`;
  return { title, description };
}

/** Validate what the model returned before we trust it. */
export function parseListingResponse(text: string): { title: string; description: string } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    if (typeof obj.title !== "string" || typeof obj.description !== "string") return null;
    const title = obj.title.trim().slice(0, 80);
    const description = obj.description.trim();
    if (!title || description.length < 40) return null;
    // Guardrail: refurbished items must never be described as brand new.
    if (/\bbrand[- ]new\b/i.test(title + " " + description)) return null;
    return { title, description };
  } catch {
    return null;
  }
}
