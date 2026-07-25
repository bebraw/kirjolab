import { html, LitElement, type TemplateResult } from "lit";
import type { WorkspaceSurface } from "./workspace-ui-route";

export const workspaceSurfaceChangeEvent = "workspace-surface-change";

export class WorkspaceSurfaceSwitcher extends LitElement {
  static override properties = { surface: { state: true } };

  declare private surface: WorkspaceSurface;

  constructor() {
    super();
    this.surface = "authoring";
  }

  setSurface(surface: WorkspaceSurface): void {
    this.surface = surface;
  }

  protected select(event: Event): void {
    const surface = (event.currentTarget as HTMLButtonElement).dataset.surface as WorkspaceSurface | undefined;
    if (!surface || surface === this.surface) return;
    this.dispatchEvent(new CustomEvent<WorkspaceSurface>(workspaceSurfaceChangeEvent, { bubbles: true, composed: true, detail: surface }));
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
