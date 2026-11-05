import type { AppState, Category, MarketplaceId, NewDeviceInput, OrderEvent, Stage } from "@/domain/types";
import type { DashboardStats } from "@/domain/stats";
import type { OrderOutcome } from "@/domain/marketplace";
import type { AssistantContext } from "@/domain/assistant";
import type { GradingSuggestion } from "@/domain/vision";

/** AI calls report failures as values, not exceptions, so the UI can show each state calmly. */
export type AiFailure = {
  ok: false;
  reason: "not-configured" | "offline-demo" | "rate-limited" | "invalid" | "unavailable";
  message: string;
};
export type AskResult = { ok: true; answer: string } | AiFailure;
export type GradePhotoResult = { ok: true; suggestion: GradingSuggestion } | AiFailure;

export interface Snapshot {
  state: AppState;
  stats: DashboardStats;
  outcome?: OrderOutcome;
  warning?: string;
  createdId?: string;
}

/**
 * The UI only talks to this interface. Two implementations:
 *  - httpApi  → the real Next.js API routes (src/app/api)
 *  - demoApi  → runs the same domain/service functions in the browser (static demo)
 */
export interface Api {
  mode: "server" | "demo";
  getState(): Promise<Snapshot>;
  reset(): Promise<Snapshot>;
  addDevice(input: Partial<NewDeviceInput>): Promise<Snapshot>;
  move(id: string, to: Stage, note?: string): Promise<Snapshot>;
  grade(
    id: string,
    input: { cosmeticScore: number; batteryHealth: number; needsRepair: boolean; aiSuggestion?: { cosmeticScore: number; confidence: number } },
  ): Promise<Snapshot>;
  repair(id: string, input: { cost: number; note: string }): Promise<Snapshot>;
  qc(id: string, checkId: string, passed: boolean): Promise<Snapshot>;
  list(id: string, marketplaces: MarketplaceId[], price?: number): Promise<Snapshot>;
  generateListing(id: string): Promise<Snapshot>;
  sendOrder(order: OrderEvent): Promise<Snapshot>;
  /** AI Ops Assistant. Both implementations call the server, which holds the API key. */
  ask(question: string, context: AssistantContext): Promise<AskResult>;
  /** AI photo grading suggestion. Server-side in both modes; photos are not stored. */
  gradePhoto(images: string[], category: Category, model: string): Promise<GradePhotoResult>;
}

async function call(path: string, method: "GET" | "POST", payload?: unknown): Promise<Snapshot> {
  const res = await fetch(path, {
    method,
    headers: payload ? { "content-type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  // A 409 from the order webhook still returns the new state (oversell was blocked).
  if (!res.ok && !data.state) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as Snapshot;
}

const post = (path: string, payload: unknown = {}) => call(path, "POST", payload);

/** The single-file demo (npm run build:demo) has no server, so there is no /api/ai/ask to call. */
const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

/** POST to an AI route and map every outcome to a value. The static single-file demo has no server. */
async function postAi<T>(path: string, payload: unknown, pick: (data: Record<string, unknown>) => T | undefined): Promise<{ ok: true; value: T } | AiFailure> {
  if (STATIC_DEMO) {
    return { ok: false, reason: "offline-demo", message: "This AI feature needs the server version – it is not available in the offline single-file demo." };
  }
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
  } catch {
    return { ok: false, reason: "unavailable", message: "Could not reach the server – check your connection and try again." };
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const value = res.ok ? pick(data) : undefined;
  if (value !== undefined) return { ok: true, value };
  const message = typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
  if (res.status === 503) return { ok: false, reason: "not-configured", message };
  if (res.status === 429) return { ok: false, reason: "rate-limited", message };
  if (res.status === 400 || res.status === 413) return { ok: false, reason: "invalid", message };
  return { ok: false, reason: "unavailable", message: res.ok ? "The AI returned no answer – try again." : message };
}

export async function askServer(question: string, context: AssistantContext): Promise<AskResult> {
  const r = await postAi("/api/ai/ask", { question, context }, (d) => (typeof d.answer === "string" ? d.answer : undefined));
  return r.ok ? { ok: true, answer: r.value } : r;
}

export async function gradePhotoServer(images: string[], category: Category, model: string): Promise<GradePhotoResult> {
  // The server already validated the suggestion strictly; this only checks it is present.
  const r = await postAi("/api/ai/grade-photo", { images, category, model }, (d) =>
    d.suggestion && typeof d.suggestion === "object" ? (d.suggestion as GradingSuggestion) : undefined,
  );
  return r.ok ? { ok: true, suggestion: r.value } : r;
}

const dev = (id: string, action: string) => `/api/devices/${encodeURIComponent(id)}/${action}`;

export const httpApi: Api = {
  mode: "server",
  getState: () => call("/api/state", "GET"),
  reset: () => post("/api/reset"),
  addDevice: (input) => post("/api/devices", input),
  move: (id, to, note) => post(dev(id, "move"), { to, note }),
  grade: (id, input) => post(dev(id, "grade"), input),
  repair: (id, input) => post(dev(id, "repair"), input),
  qc: (id, checkId, passed) => post(dev(id, "qc"), { checkId, passed }),
  list: (id, marketplaces, price) => post(dev(id, "list"), { marketplaces, price }),
  generateListing: (id) => post(dev(id, "listing")),
  sendOrder: (order) => post("/api/webhooks/orders", order),
  ask: askServer,
  gradePhoto: gradePhotoServer,
};
