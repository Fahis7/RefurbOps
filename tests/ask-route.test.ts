import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAssistantContext } from "@/domain/assistant";
import { emptyState } from "@/domain/seed";

vi.mock("server-only", () => ({}));

const KEY = "sk-ant-test-secret-key";
const context = buildAssistantContext(emptyState(), "2026-11-06T09:00:00.000Z");

/** Fresh route module per test: the rate limiter keeps its counters in module scope. */
async function loadRoute() {
  vi.resetModules();
  return (await import("@/app/api/ai/ask/route")) as { POST: (req: Request) => Promise<Response>; maxDuration: number };
}

const req = (body: unknown, ip = "203.0.113.7") =>
  new Request("http://localhost/api/ai/ask", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const claudeReply = (text: string, stop_reason = "end_turn") =>
  new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason }), { status: 200, headers: { "content-type": "application/json" } });

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

describe("POST /api/ai/ask", () => {
  it("gives Vercel enough time for the 20 s AI timeout", async () => {
    expect((await loadRoute()).maxDuration).toBe(30);
  });

  it("rejects an empty question with 400", async () => {
    const res = await (await loadRoute()).POST(req({ question: "  ", context }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/question/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a question over 500 characters with 400", async () => {
    const res = await (await loadRoute()).POST(req({ question: "x".repeat(501), context }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await (await loadRoute()).POST(req("{not json"));
    expect(res.status).toBe(400);
  });

  it("returns 503 'AI not configured' without a key, and never calls Claude", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await (await loadRoute()).POST(req({ question: "Which devices are stuck?", context }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the answer and never leaks the key", async () => {
    fetchMock.mockResolvedValueOnce(claudeReply("  Nothing is stuck right now.  "));
    const res = await (await loadRoute()).POST(req({ question: "Which devices are stuck?", context }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ answer: "Nothing is stuck right now." });
    expect(text).not.toContain(KEY);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const sent = JSON.parse(String(init.body));
    expect(sent.system).toMatch(/ONLY the JSON data/);
    expect(sent.messages[0].content).toContain("<question>Which devices are stuck?</question>");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns a clean 502 when Claude fails or times out", async () => {
    const route = await loadRoute();
    fetchMock.mockResolvedValueOnce(new Response("overloaded", { status: 529 }));
    const r1 = await route.POST(req({ question: "Q?", context }));
    expect(r1.status).toBe(502);
    expect((await r1.json()).error).toBe("AI is unavailable right now – try again");

    fetchMock.mockRejectedValueOnce(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    expect((await route.POST(req({ question: "Q?", context }))).status).toBe(502);
  });

  it("returns 502 instead of a cut-off answer when the model hits max_tokens", async () => {
    fetchMock.mockResolvedValueOnce(claudeReply("Profit is lowest on refurbed, where the", "max_tokens"));
    const res = await (await loadRoute()).POST(req({ question: "Where is profit lowest?", context }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("refurbed, where the");
  });

  it("returns 502 when the model refuses", async () => {
    fetchMock.mockResolvedValueOnce(claudeReply("", "refusal"));
    expect((await (await loadRoute()).POST(req({ question: "Q?", context }))).status).toBe(502);
  });

  it("asks for low effort with room to finish (thinking tokens count against max_tokens)", async () => {
    fetchMock.mockResolvedValueOnce(claudeReply("ok"));
    await (await loadRoute()).POST(req({ question: "Q?", context }));
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(sent.output_config).toEqual({ effort: "low" });
    expect(sent.max_tokens).toBeGreaterThanOrEqual(2000);
  });

  it("returns 502 when the model answers with nothing", async () => {
    fetchMock.mockResolvedValueOnce(claudeReply("   "));
    expect((await (await loadRoute()).POST(req({ question: "Q?", context }))).status).toBe(502);
  });

  it("rate-limits to 10 requests per minute per IP", async () => {
    const route = await loadRoute();
    fetchMock.mockImplementation(async () => claudeReply("ok"));
    for (let i = 0; i < 10; i++) expect((await route.POST(req({ question: "Q?", context }))).status).toBe(200);
    const limited = await route.POST(req({ question: "Q?", context }));
    expect(limited.status).toBe(429);
    expect((await route.POST(req({ question: "Q?", context }, "198.51.100.1"))).status).toBe(200); // other IP unaffected
  });
});
