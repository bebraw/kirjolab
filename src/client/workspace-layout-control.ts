import { html, LitElement, type TemplateResult } from "lit";
import type { WorkspaceLayout } from "./workspace-ui-route";

type WorkspaceLayoutMode = "library" | "workspace";
type WorkspaceLayoutChange = (layout: WorkspaceLayout) => void | Promise<void>;

export class WorkspaceLayoutControl extends LitElement {
  static override properties = {
    layout: { state: true },
    mode: { type: String },
  };

  declare private layout: WorkspaceLayout;
  declare private mode: WorkspaceLayoutMode;
  private workspaceId = "";
  private workspace: HTMLElement | null = null;
  private changeLayout: WorkspaceLayoutChange | null = null;

  constructor() {
    super();
    this.layout = "split";
    this.mode = "workspace";
  }

  get value(): WorkspaceLayout {
    return this.layout;
  }

  configure(workspaceId: string, workspace: HTMLElement): void {
    this.workspaceId = workspaceId;
    this.workspace = workspace;
  }

  bindChange(changeLayout: WorkspaceLayoutChange): void {
    this.changeLayout = changeLayout;
  }

  restore(): Promise<WorkspaceLayout> {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(this.storageKey);
    } catch {
      // Layout selection remains usable when browser storage is unavailable.
    }
    return this.navigate(stored ?? "split", false);
  }

  async navigate(value: string, persist = true): Promise<WorkspaceLayout> {
    const layout = normalizeWorkspaceLayout(value);
    this.layout = layout;
    if (persist) {
      try {
        localStorage.setItem(this.storageKey, layout);
      } catch {
        // Layout selection remains usable when browser storage is unavailable.
      }
    }
    if (this.workspace) this.workspace.dataset.layout = layout;
    if (typeof window !== "undefined") window.dispatchEvent(new Event("resize"));
    await this.changeLayout?.(layout);
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
    void this.navigate((event.currentTarget as HTMLSelectElement).value);
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
