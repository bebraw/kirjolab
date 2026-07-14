export type ThemePreference = "system" | "light" | "dark";

interface ThemeRoot {
  readonly dataset: DOMStringMap;
  readonly style: Pick<CSSStyleDeclaration, "colorScheme">;
}

interface ThemeControl {
  value: string;
  addEventListener(type: "change", listener: () => void): void;
}

interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const themeStorageKey = "kirjolab:theme";

export function parseThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function bindThemePreference(root: ThemeRoot, control: ThemeControl, storage: ThemeStorage): void {
  const apply = (preference: ThemePreference): void => {
    if (preference === "system") delete root.dataset.theme;
    else root.dataset.theme = preference;
    root.style.colorScheme = preference === "system" ? "light dark" : preference;
    control.value = preference;
  };

  let stored: string | null = null;
  try {
    stored = storage.getItem(themeStorageKey);
  } catch {
    // A blocked storage API should not prevent the workspace from loading.
  }
  apply(parseThemePreference(stored));

  control.addEventListener("change", () => {
    const preference = parseThemePreference(control.value);
    apply(preference);
    try {
      storage.setItem(themeStorageKey, preference);
    } catch {
      // The selected appearance still applies for the current page.
    }
  });
}
