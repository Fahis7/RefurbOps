import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const KEY = "sk-ant-test-secret-key";
const jpeg = "/9j/" + "A".repeat(96);
const body = (images: string[] = [jpeg]) => ({ images, category: "Smartphone", model: "iPhone 13" });

async function loadRoute() {
  vi.resetModules();
  return (await import("@/app/api/ai/grade-photo/route")) as { POST: (req: Request) => Promise<Response>; maxDuration: number };
}

const req = (payload: unknown) =>
  new Request("http://localhost/api/ai/grade-photo", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });

const claudeReply = (text: string, stop_reason = "end_turn") =>
  new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason }), { status: 200 });

const suggestion = { cosmeticScore: 4, damage: [{ area: "frame", issue: "scuff", severity: "minor" }], confidence: 0.82, notes: "Light wear." };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ANTHROPIC_API_KEY", KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/ai/grade-photo", () => {
  it("has maxDuration 30", async () => {
    expect((await loadRoute()).maxDuration).toBe(30);
  });

  it("rejects 0 and 4 images with 400", async () => {
    const route = await loadRoute();
    expect((await route.POST(req(body([])))).status).toBe(400);
    expect((await route.POST(req(body([jpeg, jpeg, jpeg, jpeg])))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized payload with 413 before parsing", async () => {
    const huge = JSON.stringify(body(["/9j/" + "A".repeat(4_200_000)]));
    const res = await (await loadRoute()).POST(req(huge));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 'AI not configured' without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await (await loadRoute()).POST(req(body()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the validated suggestion and sends image blocks at low effort", async () => {
    fetchMock.mockResolvedValueOnce(claudeReply(`Sure: ${JSON.stringify(suggestion)}`));
    const res = await (await loadRoute()).POST(req(body([jpeg, jpeg])));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ suggestion });
    expect(text).not.toContain(KEY);

    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(sent.output_config).toEqual({ effort: "low" });
    const content = sent.messages[0].content as { type: string; source?: { media_type: string; data: string } }[];
    expect(content.filter((c) => c.type === "image")).toHaveLength(2);
    expect(content[0].source).toEqual({ type: "base64", media_type: "image/jpeg", data: jpeg });
    expect(content.at(-1)!.type).toBe("text");
    expect(sent.system).toMatch(/COSMETIC condition/);
  });

  it("returns 502 'AI answer could not be used' for invalid model output", async () => {
    fetchMock.mockResolvedValueOnce(claudeReply(JSON.stringify({ ...suggestion, cosmeticScore: 6 })));
    const res = await (await loadRoute()).POST(req(body()));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "AI answer could not be used" });
  });

  it("returns 502 'unavailable' when Claude fails or stops early", async () => {
    const route = await loadRoute();
    fetchMock.mockResolvedValueOnce(claudeReply(JSON.stringify(suggestion), "max_tokens"));
    const r1 = await route.POST(req(body()));
    expect(r1.status).toBe(502);
    expect((await r1.json()).error).toBe("AI is unavailable right now – try again");
    fetchMock.mockResolvedValueOnce(new Response("overloaded", { status: 529 }));
    expect((await route.POST(req(body()))).status).toBe(502);
  });
});
