import { NextResponse } from "next/server";
import { handle } from "@/server/http";
import { AiOutputError, aiConfigured, suggestGrade } from "@/server/ai";
import { clientIp, createRateLimiter } from "@/server/rateLimit";
import { MAX_GRADE_BODY_BYTES, validateGradeRequest } from "@/domain/vision";

export const dynamic = "force-dynamic";
// The Claude call times out after 20 s; give the function headroom so Vercel doesn't cut it off first.
export const maxDuration = 30;

const allow = createRateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * POST /api/ai/grade-photo { images: base64 JPEG[1..3], category, model } → { suggestion }
 * Stateless: photos are forwarded to Claude for this request only – never stored or logged.
 *   503 no key · 429 rate limited · 413 body too large · 400 invalid input
 *   502 "AI answer could not be used" (invalid output) / "AI is unavailable right now – try again"
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!aiConfigured()) return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    if (!allow(clientIp(req), Date.now())) {
      return NextResponse.json({ error: "Too many requests – wait a minute and try again" }, { status: 429 });
    }
    const tooLarge = () => NextResponse.json({ error: "Photos too large" }, { status: 413 });
    if (Number(req.headers.get("content-length") ?? 0) > MAX_GRADE_BODY_BYTES) return tooLarge();
    const raw = await req.text();
    if (raw.length > MAX_GRADE_BODY_BYTES) return tooLarge();
    const { images, category, model } = validateGradeRequest(JSON.parse(raw));
    try {
      return NextResponse.json({ suggestion: await suggestGrade(images, category, model) });
    } catch (err) {
      console.error("AI photo grading failed:", (err as Error).message); // message only – never the photos
      const unusable = err instanceof AiOutputError;
      return NextResponse.json(
        { error: unusable ? "AI answer could not be used" : "AI is unavailable right now – try again" },
        { status: 502 },
      );
    }
  });
}
