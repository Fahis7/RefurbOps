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
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, DB_PATH); // atomic replace – no half-written file on crash
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
