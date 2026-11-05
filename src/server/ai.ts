import "server-only";
import type { Device } from "@/domain/types";
import { buildListingPrompt, parseListingResponse, templateListing } from "@/domain/listing";

/**
 * Generate a marketplace listing with Claude.
 * - No API key → deterministic template (app still works offline).
 * - Bad/unsafe model output → rejected by parseListingResponse, fall back to template.
 * The AI is a helper here, never a single point of failure.
 */
export async function generateListing(
  device: Device,
): Promise<{ title: string; description: string; source: "ai" | "template"; warning?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ...templateListing(device), source: "template", warning: "ANTHROPIC_API_KEY not set – used template" };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
        max_tokens: 500,
        messages: [{ role: "user", content: buildListingPrompt(device) }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const parsed = parseListingResponse(text);
    if (!parsed) throw new Error("Model output failed validation");
    return { ...parsed, source: "ai" };
  } catch (err) {
    return { ...templateListing(device), source: "template", warning: `AI unavailable (${(err as Error).message}) – used template` };
  }
}
