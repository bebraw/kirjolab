import { describe, expect, it, vi } from "vitest";
import { bindThemePreference, parseThemePreference, themeStorageKey } from "./theme";

function themeHarness(stored: string | null, throws = false) {
  const dataset: Record<string, string> = {};
  const style = { colorScheme: "" };
  let change: (() => void) | undefined;
  const control = {
    value: "system",
    addEventListener: vi.fn((_type: "change", listener: () => void) => {
      change = listener;
    }),
  };
  const storage = {
    getItem: vi.fn(() => {
      if (throws) throw new Error("blocked");
      return stored;
    }),
    setItem: vi.fn(() => {
      if (throws) throw new Error("blocked");
    }),
  };

  bindThemePreference({ dataset, style }, control, storage);
  return { change: () => change?.(), control, dataset, storage, style };
}

describe("theme preference", () => {
  it("accepts explicit themes and treats other values as system", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("sepia")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
  });

  it("restores and persists an explicit preference", () => {
    const harness = themeHarness("dark");
    expect(harness.dataset.theme).toBe("dark");
    expect(harness.style.colorScheme).toBe("dark");
    expect(harness.control.value).toBe("dark");

    harness.control.value = "light";
    harness.change();
    expect(harness.dataset.theme).toBe("light");
    expect(harness.storage.setItem).toHaveBeenCalledWith(themeStorageKey, "light");
  });

  it("uses the system scheme and tolerates unavailable storage", () => {
    const harness = themeHarness("dark", true);
    harness.dataset.theme = "dark";
    harness.control.value = "unexpected";
    harness.change();
    expect(harness.dataset.theme).toBeUndefined();
    expect(harness.style.colorScheme).toBe("light dark");
    expect(harness.control.value).toBe("system");
  });
});
