import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppState } from "@/domain/types";
import { seedState } from "@/domain/seed";

/**
 * Persistence. For the demo this is a JSON file (data/db.json) so the project
 * runs with zero setup. All access goes through `read()` and `transact()`, so
 * swapping in PostgreSQL (see db/schema.sql) only changes this file.
 */

const DB_PATH = path.join(process.cwd(), "data", "db.json");

let cache: AppState | null = null;
let queue: Promise<unknown> = Promise.resolve(); // serialises writes (one at a time)
// Set once a write fails on Vercel (read-only filesystem): state then lives only in `cache`,
// per server instance, and resets on cold start. Fine for a demo – production needs Postgres.
let memoryOnly = false;

async function load(): Promise<AppState> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(DB_PATH, "utf8")) as AppState;
  } catch {
    cache = seedState(new Date().toISOString());
    await save(cache);
  }
  return cache;
}

async function save(state: AppState) {
  if (memoryOnly) return;
  try {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    const tmp = `${DB_PATH}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2));
    await fs.rename(tmp, DB_PATH); // atomic replace – no half-written file on crash
  } catch (err) {
    // On Vercel the error code varies (ENOENT on mkdir, EROFS, …), so any write failure counts.
    // Everywhere else a failed write is a real error and must surface.
    if (!process.env.VERCEL) throw err;
    memoryOnly = true;
    const code = (err as NodeJS.ErrnoException).code ?? String(err);
    console.warn(`[store] Cannot write ${DB_PATH} (${code}) – memory-only mode, data resets on cold start`);
  }
}

export async function read(): Promise<AppState> {
  await queue;
  return load();
}

/** Run `fn` against the current state and persist the result, one transaction at a time. */
export function transact<T>(fn: (state: AppState) => { state: AppState; result?: T }): Promise<{ state: AppState; result?: T }> {
  const run = queue.then(async () => {
    const out = fn(await load());
    await save(out.state);
    cache = out.state;
    return out;
  });
  queue = run.catch(() => undefined); // a failed transaction must not block the next one
  return run;
}

export async function reset(): Promise<AppState> {
  return (await transact(() => ({ state: seedState(new Date().toISOString()) }))).state;
}
