import { NextResponse } from "next/server";
import { body, handle } from "@/server/http";
import { aiConfigured, askAssistant } from "@/server/ai";
import { clientIp, createRateLimiter } from "@/server/rateLimit";
import { validateAskInput } from "@/domain/assistant";

export const dynamic = "force-dynamic";
// The Claude call times out after 20 s; give the function headroom so Vercel doesn't cut it off first.
export const maxDuration = 30;

const allow = createRateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * POST /api/ai/ask { question, context } → { answer }
 * Stateless: the browser sends the pre-computed context (live and demo mode alike); nothing is stored.
 *   503 no ANTHROPIC_API_KEY · 429 rate limited · 400 invalid input · 502 Claude failed/timed out
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!aiConfigured()) return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    if (!allow(clientIp(req), Date.now())) {
      return NextResponse.json({ error: "Too many questions – wait a minute and try again" }, { status: 429 });
    }
    const { question, context } = validateAskInput(await body<unknown>(req));
    try {
      return NextResponse.json({ answer: await askAssistant(question, context) });
    } catch (err) {
      console.error("AI assistant failed:", (err as Error).message);
      return NextResponse.json({ error: "AI is unavailable right now – try again" }, { status: 502 });
    }
  });
}
