import { html, LitElement, type TemplateResult } from "lit";
import type { AuthoringMode } from "./workspace-ui-route";
import type { ProjectMapWorkspace } from "./project-map-workspace";

export const authoringModeChangeEvent = "kirjolab-authoring-mode-change";

export class AuthoringModeTabs extends LitElement {
  static override properties = { mode: { state: true } };

  declare mode: AuthoringMode;

  constructor() {
    super();
    this.mode = "write";
  }

  setMode(mode: AuthoringMode): void {
    this.mode = mode;
    if (typeof document === "undefined") return;
    const writing = mode === "write";
    const editor = document.getElementById("source-editor-shell");
    const actions = document.getElementById("editor-write-actions");
    if (editor) editor.hidden = !writing;
    if (actions) actions.hidden = !writing;
    document.querySelector<ProjectMapWorkspace>("#project-map")?.setVisible(!writing);
  }

  protected select(event: Event): void {
    const mode = (event.currentTarget as HTMLButtonElement).dataset.authoringMode as AuthoringMode | undefined;
    if (!mode || mode === this.mode) return;
    this.dispatchEvent(new CustomEvent<AuthoringMode>(authoringModeChangeEvent, { bubbles: true, composed: true, detail: mode }));
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
        class="authoring-mode"
        id="show-write-mode"
        type="button"
        aria-pressed=${String(this.mode === "write")}
        data-authoring-mode="write"
        @click=${this.select}
      >
        Write
      </button>
      <button
        class="authoring-mode"
        id="show-map-mode"
        type="button"
        aria-pressed=${String(this.mode === "map")}
        data-authoring-mode="map"
        @click=${this.select}
      >
        Map
      </button>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("authoring-mode-tabs")) {
  customElements.define("authoring-mode-tabs", AuthoringModeTabs);
}

declare global {
  interface HTMLElementTagNameMap {
    "authoring-mode-tabs": AuthoringModeTabs;
  }
}
