import type { AppState } from "@/domain/types";
import { DomainError } from "@/domain/types";
import { computeStats } from "@/domain/stats";
import { seedState } from "@/domain/seed";
import { templateListing } from "@/domain/listing";
import * as svc from "@/domain/service";
import { askServer, type Api, type Snapshot } from "./api";

/**
 * Offline demo backend: same service functions as the server, state kept in
 * memory and (when available) browser storage. Used for the shareable demo link.
 */
const KEY = "refurbops-demo-v1";

// Browser storage only: this module is also imported (unused) during server rendering.
const storage = () => (typeof window === "undefined" ? undefined : window.localStorage);

function loadInitial(): AppState {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* storage unavailable – fall through to fresh seed */
  }
  return seedState(new Date().toISOString());
}

// Created on first use, so importing this module (e.g. in live-API mode) costs nothing.
let current: AppState | null = null;
const getState = () => (current ??= loadInitial());

function persist() {
  try {
    storage()?.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore – demo still works in memory */
  }
}

const now = () => new Date().toISOString();
const snap = (extra: Partial<Snapshot> = {}): Snapshot => {
  const state = getState();
  return { state, stats: computeStats(state, now()), ...extra };
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a mutation; convert DomainError into a rejected promise like the HTTP API does. */
async function run(fn: (s: AppState) => AppState, extra: Partial<Snapshot> = {}): Promise<Snapshot> {
  await wait(120); // feel like a network call
  try {
    current = fn(getState());
  } catch (e) {
    if (e instanceof DomainError) throw new Error(e.message);
    throw e;
  }
  persist();
  return snap(extra);
}

export const demoApi: Api = {
  mode: "demo",
  getState: async () => snap(),
  reset: () => run(() => seedState(now())),
  addDevice: async (input) => {
    const res = await run((s) => svc.addDevice(s, input, now()));
    return { ...res, createdId: res.state.devices[0].id }; // same response shape as POST /api/devices
  },
  move: (id, to, note) => run((s) => svc.move(s, id, to, now(), note)),
  grade: (id, input) => run((s) => svc.grade(s, id, input, now())),
  repair: (id, input) => run((s) => svc.completeRepair(s, id, input, now())),
  qc: (id, checkId, passed) => run((s) => svc.recordQC(s, id, checkId, passed)),
  list: (id, mps, price) => run((s) => svc.approveAndList(s, id, mps, now(), price)),
  generateListing: async (id) => {
    await wait(700);
    const device = getState().devices.find((d) => d.id === id);
    if (!device) throw new Error(`Device ${id} not found`);
    return run((s) => svc.setListingText(s, id, { ...templateListing(device), source: "template" }), {
      warning: "Offline demo uses the template generator. The full app calls the Claude API (src/server/ai.ts).",
    });
  },
  sendOrder: async (order) => {
    let outcome: Snapshot["outcome"];
    const res = await run((s) => {
      const r = svc.receiveOrder(s, order, now());
      outcome = r.outcome;
      return r.state;
    });
    return { ...res, outcome };
  },
  // Stateless route: the browser sends the context, so the Vercel demo works too. The static file has no server.
  ask: askServer,
};
