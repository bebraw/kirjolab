import { describe, expect, it, vi } from "vitest";
import { ThemePreferenceControl, parseThemePreference, themeStorageKey } from "./theme";

class TestThemePreferenceControl extends ThemePreferenceControl {
  renderForTest() {
    return this.render();
  }

  changeForTest(value: string): void {
    const event = new Event("change");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    this.change(event);
  }
}

function themeHarness(stored: string | null, throws = false) {
  const dataset: Record<string, string> = {};
  const style = { colorScheme: "" };
  const control = new TestThemePreferenceControl();
  const storage = {
    getItem: vi.fn(() => {
      if (throws) throw new Error("blocked");
      return stored;
    }),
    setItem: vi.fn(() => {
      if (throws) throw new Error("blocked");
    }),
  };

  control.configure({ dataset, style }, storage);
  return { control, dataset, storage, style };
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
    expect(harness.control.renderForTest()).toBeDefined();

    harness.control.changeForTest("light");
    expect(harness.dataset.theme).toBe("light");
    expect(harness.storage.setItem).toHaveBeenCalledWith(themeStorageKey, "light");
  });

  it("uses the system scheme and tolerates unavailable storage", () => {
    const harness = themeHarness("dark", true);
    harness.dataset.theme = "dark";
    harness.control.changeForTest("unexpected");
    expect(harness.dataset.theme).toBeUndefined();
    expect(harness.style.colorScheme).toBe("light dark");
    expect(harness.control.navigate("unexpected", false)).toBe("system");
  });
});
