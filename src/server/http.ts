import "server-only";
import { NextResponse } from "next/server";
import { DomainError, type AppState } from "@/domain/types";
import { computeStats } from "@/domain/stats";

/** Every response carries the fresh state + stats, so the UI just re-renders. */
export function snapshot(state: AppState, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ state, stats: computeStats(state, new Date().toISOString()), ...extra });
}

/** Wrap a route: business-rule errors → 400 with a message, anything else → 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DomainError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function body<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}
