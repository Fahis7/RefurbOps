import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// store.ts is server code: stub the "server-only" guard and make the disk unwritable,
// like Vercel's read-only deploy directory (mkdir fails with ENOENT there).
vi.mock("server-only", () => ({}));
vi.mock("node:fs", () => {
  const fail = (code: string) => async () => {
    throw Object.assign(new Error(`${code}: simulated disk error`), { code });
  };
  return { promises: { readFile: fail("ENOENT"), mkdir: fail("ENOENT"), writeFile: fail("EROFS"), rename: fail("EROFS") } };
});

// Fresh module per test: the store keeps its cache and memory-only flag in module scope.
const loadStore = async () => {
  vi.resetModules();
  return import("@/server/store");
};

describe("store fallback when the disk is not writable", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("on Vercel, any write failure switches to memory-only mode", async () => {
    vi.stubEnv("VERCEL", "1");
    const store = await loadStore();
    const { state } = await store.transact((s) => ({ state: { ...s, nextSku: 9999 } }));
    expect(state.nextSku).toBe(9999);
    expect((await store.read()).nextSku).toBe(9999); // kept in memory
    expect(console.warn).toHaveBeenCalledTimes(1); // warns once, then stops trying the disk
  });

  it("on other hosts, a write failure is still an error", async () => {
    vi.stubEnv("VERCEL", "");
    const store = await loadStore();
    await expect(store.transact((s) => ({ state: s }))).rejects.toThrow(/simulated disk error/);
  });
});
