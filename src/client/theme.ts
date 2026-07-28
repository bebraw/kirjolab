import { html, LitElement, type TemplateResult } from "lit";

export type ThemePreference = "system" | "light" | "dark";

interface ThemeRoot {
  readonly dataset: DOMStringMap;
  readonly style: Pick<CSSStyleDeclaration, "colorScheme">;
}

interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const themeStorageKey = "kirjolab:theme";

export function parseThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export class ThemePreferenceControl extends LitElement {
  static override properties = { preference: { state: true } };

  declare private preference: ThemePreference;
  private root: ThemeRoot | null = null;
  private storage: ThemeStorage | null = null;

  constructor() {
    super();
    this.preference = "system";
  }

  configure(root: ThemeRoot, storage: ThemeStorage): void {
    this.root = root;
    this.storage = storage;
    let stored: string | null = null;
    try {
      stored = storage.getItem(themeStorageKey);
    } catch {
      // A blocked storage API should not prevent the workspace from loading.
    }
    this.apply(parseThemePreference(stored));
  }

  navigate(value: string, persist = true): ThemePreference {
    const preference = parseThemePreference(value);
    this.apply(preference);
    if (persist && this.storage) {
      try {
        this.storage.setItem(themeStorageKey, preference);
      } catch {
        // The selected appearance still applies for the current page.
      }
    }
    return preference;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
    if (!this.root && typeof document !== "undefined" && typeof localStorage !== "undefined") {
      this.configure(document.documentElement, localStorage);
    }
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`<select class="field" id="theme-preference" aria-label="Appearance" .value=${this.preference} @change=${this.change}>
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>`;
  }

  protected change(event: Event): void {
    this.navigate((event.currentTarget as HTMLSelectElement).value);
  }

  private apply(preference: ThemePreference): void {
    const root = this.root;
    if (!root) return;
    if (preference === "system") delete root.dataset.theme;
    else root.dataset.theme = preference;
    root.style.colorScheme = preference === "system" ? "light dark" : preference;
    this.preference = preference;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("theme-preference-control")) {
  customElements.define("theme-preference-control", ThemePreferenceControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "theme-preference-control": ThemePreferenceControl;
  }
}
