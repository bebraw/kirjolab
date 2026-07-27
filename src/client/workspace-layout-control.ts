import { html, LitElement, type TemplateResult } from "lit";
import type { WorkspaceLayout } from "./workspace-ui-route";

type WorkspaceLayoutMode = "library" | "workspace";

export class WorkspaceLayoutControl extends LitElement {
  static override properties = {
    layout: { state: true },
    mode: { type: String },
  };

  declare private layout: WorkspaceLayout;
  declare private mode: WorkspaceLayoutMode;
  private workspaceId = "";
  private changeLayout: ((layout: WorkspaceLayout) => void) | null = null;

  constructor() {
    super();
    this.layout = "split";
    this.mode = "workspace";
  }

  get value(): WorkspaceLayout {
    return this.layout;
  }

  configure(workspaceId: string): void {
    this.workspaceId = workspaceId;
  }

  bindChange(changeLayout: (layout: WorkspaceLayout) => void): void {
    this.changeLayout = changeLayout;
  }

  restore(): WorkspaceLayout {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(this.storageKey);
    } catch {
      // Layout selection remains usable when browser storage is unavailable.
    }
    return this.setLayout(stored ?? "split", false);
  }

  setLayout(value: string, persist = true): WorkspaceLayout {
    const layout = normalizeWorkspaceLayout(value);
    this.layout = layout;
    if (persist) {
      try {
        localStorage.setItem(this.storageKey, layout);
      } catch {
        // Layout selection remains usable when browser storage is unavailable.
      }
    }
    return layout;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const select = html`<select
      class=${this.mode === "workspace" ? "workspace-switcher" : ""}
      id="workspace-layout"
      aria-label=${this.mode === "workspace" ? "Project view" : ""}
      aria-hidden=${this.mode === "library" ? "true" : "false"}
      tabindex=${this.mode === "library" ? "-1" : "0"}
      ?hidden=${this.mode === "library"}
      .value=${this.layout}
      @change=${this.change}
    >
      <option value="split">Split</option>
      <option value="editor">Editor only</option>
      <option value="context">Context only</option>
      <option value="pdf">PDF only</option>
    </select>`;
    return this.mode === "library"
      ? select
      : html`<label class="project-view-control hidden items-center gap-2 font-sans text-xs text-app-text-soft min-[72rem]:flex"
          >View ${select}</label
        >`;
  }

  protected change(event: Event): void {
    const layout = this.setLayout((event.currentTarget as HTMLSelectElement).value);
    this.changeLayout?.(layout);
  }

  private get storageKey(): string {
    return `kirjolab:layout:${this.workspaceId}`;
  }
}

function normalizeWorkspaceLayout(value: string): WorkspaceLayout {
  if (value === "editor" || value === "context" || value === "pdf") return value;
  return "split";
}

if (typeof customElements !== "undefined" && !customElements.get("workspace-layout-control")) {
  customElements.define("workspace-layout-control", WorkspaceLayoutControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-layout-control": WorkspaceLayoutControl;
  }
}
