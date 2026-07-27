import { html, LitElement, type TemplateResult } from "lit";
import type { WorkspaceSurface } from "./workspace-ui-route";

export class WorkspaceSurfaceSwitcher extends LitElement {
  static override properties = { surface: { state: true } };

  declare private surface: WorkspaceSurface;
  private navigation: ((surface: WorkspaceSurface) => void) | null = null;

  constructor() {
    super();
    this.surface = "authoring";
  }

  navigate(surface: WorkspaceSurface, notify = true): void {
    this.surface = surface;
    if (this.parentElement) this.parentElement.dataset.activeSurface = surface;
    if (notify) this.navigation?.(surface);
  }

  bindNavigation(navigate: (surface: WorkspaceSurface) => void): void {
    this.navigation = navigate;
  }

  protected select(event: Event): void {
    const surface = (event.currentTarget as HTMLButtonElement).dataset.surface as WorkspaceSurface | undefined;
    if (!surface || surface === this.surface) return;
    this.navigate(surface);
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <button
        class="surface-switch"
        id="show-authoring-surface"
        type="button"
        aria-controls="authoring-surface"
        aria-pressed=${String(this.surface === "authoring")}
        data-surface="authoring"
        @click=${this.select}
      >
        Authoring
      </button>
      <button
        class="surface-switch"
        id="show-context-surface"
        type="button"
        aria-controls="context-surface"
        aria-pressed=${String(this.surface === "context")}
        data-surface="context"
        @click=${this.select}
      >
        Context
      </button>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("workspace-surface-switcher")) {
  customElements.define("workspace-surface-switcher", WorkspaceSurfaceSwitcher);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-surface-switcher": WorkspaceSurfaceSwitcher;
  }
}
