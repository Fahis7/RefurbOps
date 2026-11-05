import "server-only";
import type { Device } from "@/domain/types";
import { buildListingPrompt, parseListingResponse, templateListing } from "@/domain/listing";
import { buildAssistantPrompt, parseAssistantAnswer, type AssistantContext } from "@/domain/assistant";
import { buildGradingPrompt, parseGradingResponse, type GradingSuggestion } from "@/domain/vision";
import type { Category } from "@/domain/types";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } };

/** The model answered, but its output failed validation (route: 502 "AI answer could not be used"). */
export class AiOutputError extends Error {}

const TIMEOUT_MS = 20_000;

/** True when a key is configured. The key itself never leaves the server. */
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

/**
 * One Claude Messages call: model from ANTHROPIC_MODEL, 20 s timeout, throws on any failure.
 * Current models think by default and thinking tokens count against max_tokens, so short answers use
 * low effort plus a budget with headroom. Anything but a normal finish (max_tokens = cut off, refusal)
 * is a failure – a half answer must never reach the user.
 */
async function callClaude({
  system,
  user,
  maxTokens = 2000,
  effort = "low",
}: {
  system?: string;
  user: string | ContentBlock[];
  maxTokens?: number;
  effort?: "low" | "medium";
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: maxTokens,
      output_config: { effort },
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
  if (data.stop_reason !== "end_turn") throw new Error(`Model stopped early (${data.stop_reason ?? "unknown"})`);
  return (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

/**
 * Generate a marketplace listing with Claude.
 * - No API key → deterministic template (app still works offline).
 * - Bad/unsafe model output → rejected by parseListingResponse, fall back to template.
 * The AI is a helper here, never a single point of failure.
 */
export async function generateListing(
  device: Device,
): Promise<{ title: string; description: string; source: "ai" | "template"; warning?: string }> {
  if (!aiConfigured()) return { ...templateListing(device), source: "template", warning: "ANTHROPIC_API_KEY not set – used template" };

  try {
    const parsed = parseListingResponse(await callClaude({ user: buildListingPrompt(device) }));
    if (!parsed) throw new Error("Model output failed validation");
    return { ...parsed, source: "ai" };
  } catch (err) {
    return { ...templateListing(device), source: "template", warning: `AI unavailable (${(err as Error).message}) – used template` };
  }
}

/** Answer an ops question from the pre-computed context. Throws if Claude fails or returns nothing usable. */
export async function askAssistant(question: string, context: AssistantContext): Promise<string> {
  const { system, user } = buildAssistantPrompt(question, context);
  // Low effort: medium sometimes thought past the 20 s timeout. Accuracy comes from the pre-computed data and prompt rules.
  const answer = parseAssistantAnswer(await callClaude({ system, user, effort: "low" }));
  if (!answer) throw new Error("Model returned an empty answer");
  return answer;
}

/**
 * Suggest a cosmetic score from 1–3 JPEG photos. The photos are only forwarded to Claude for this request –
 * never stored or logged. Throws AiOutputError if the answer fails strict validation.
 */
export async function suggestGrade(images: string[], category: Category, model: string): Promise<GradingSuggestion> {
  const { system, text } = buildGradingPrompt(category, model);
  const content: ContentBlock[] = [
    ...images.map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
    { type: "text", text },
  ];
  const suggestion = parseGradingResponse(await callClaude({ system, user: content }));
  if (!suggestion) throw new AiOutputError("Grading output failed validation");
  return suggestion;
}

