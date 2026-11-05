import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, nextThemeMode, parseThemeMode, resolveTheme } from "@/client/theme";

describe("theme mode", () => {
  it("cycles System → Light → Dark → System", () => {
    expect(nextThemeMode("system")).toBe("light");
    expect(nextThemeMode("light")).toBe("dark");
    expect(nextThemeMode("dark")).toBe("system");
  });

  it("treats a missing or invalid saved value as system", () => {
    for (const v of [null, undefined, "", "blue", "DARK", "Light", " dark", "{}", 1]) {
      expect(parseThemeMode(v)).toBe("system");
    }
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("dark")).toBe("dark");
  });

  it("resolves system from the OS preference, explicit modes ignore it", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

/** Run the real inline <head> script against a fake browser. */
function runInitScript({ stored, osDark, storageThrows = false }: { stored?: string | null; osDark: boolean; storageThrows?: boolean }) {
  const store = new Map<string, string>();
  if (stored != null) store.set(THEME_STORAGE_KEY, stored);
  const attrs: Record<string, string> = {};
  const listeners: (() => void)[] = [];
  const mq = { matches: osDark, addEventListener: (_: string, fn: () => void) => listeners.push(fn) };
  const localStorage = {
    getItem: (k: string) => {
      if (storageThrows) throw new Error("SecurityError");
      return store.get(k) ?? null;
    },
  };
  const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
  const window = { matchMedia: () => mq };
  new Function("window", "document", "localStorage", THEME_INIT_SCRIPT)(window, document, localStorage);
  return {
    theme: () => attrs["data-theme"],
    /** What the toggle does: save the mode and apply it (here an explicit light/dark). */
    pick: (v: "light" | "dark") => {
      store.set(THEME_STORAGE_KEY, v);
      attrs["data-theme"] = v;
    },
    osChange: (dark: boolean) => {
      mq.matches = dark;
      listeners.forEach((fn) => fn());
    },
  };
}

describe("inline theme init script", () => {
  it("always sets data-theme to light or dark, following the saved mode", () => {
    expect(runInitScript({ stored: "dark", osDark: false }).theme()).toBe("dark");
    expect(runInitScript({ stored: "light", osDark: true }).theme()).toBe("light");
    expect(runInitScript({ stored: null, osDark: true }).theme()).toBe("dark");
    expect(runInitScript({ stored: null, osDark: false }).theme()).toBe("light");
  });

  it("treats an invalid saved value as system", () => {
    expect(runInitScript({ stored: "blue", osDark: true }).theme()).toBe("dark");
    expect(runInitScript({ stored: "blue", osDark: false }).theme()).toBe("light");
  });

  it("falls back to system when localStorage throws", () => {
    expect(runInitScript({ stored: "light", osDark: true, storageThrows: true }).theme()).toBe("dark");
  });

  it("follows OS changes live only while in system mode", () => {
    const page = runInitScript({ stored: "system", osDark: false });
    page.osChange(true);
    expect(page.theme()).toBe("dark");

    page.pick("light"); // user picked Light with the toggle
    page.osChange(true);
    page.osChange(false);
    page.osChange(true);
    expect(page.theme()).toBe("light");
  });
});
