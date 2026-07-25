import { html, LitElement, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderIcon, type IconName } from "../ui/icons";
import type { WorkspaceRail } from "./workspace-ui-route";

export const workspaceRailChangeEvent = "kirjolab-workspace-rail-change";

const tabs: readonly { readonly icon: IconName; readonly label: string; readonly mode: WorkspaceRail }[] = [
  { icon: "files", label: "Files", mode: "files" },
  { icon: "research", label: "Research", mode: "research" },
  { icon: "comments", label: "Comments", mode: "comments" },
  { icon: "guide", label: "Writing guide", mode: "guide" },
];

export class WorkspaceRailTabs extends LitElement {
  static override properties = {
    commentCount: { state: true },
    mode: { state: true },
  };

  declare private commentCount: number;
  declare mode: WorkspaceRail;

  constructor() {
    super();
    this.commentCount = 0;
    this.mode = "files";
  }

  setCommentCount(count: number): void {
    this.commentCount = count;
  }

  setMode(mode: WorkspaceRail): void {
    this.mode = mode;
  }

  protected select(event: Event): void {
    const mode = (event.currentTarget as HTMLButtonElement).dataset.railMode as WorkspaceRail | undefined;
    if (!mode || mode === this.mode) return;
    this.dispatchEvent(new CustomEvent<WorkspaceRail>(workspaceRailChangeEvent, { bubbles: true, composed: true, detail: mode }));
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`<div class="rail-mode-tabs" role="tablist" aria-label="Project navigation">
      ${tabs.map(
        ({ icon, label, mode }) => html`
          <button
            class="rail-mode"
            id=${`show-${mode}-rail`}
            type="button"
            role="tab"
            aria-label=${label}
            aria-describedby=${mode === "comments" ? "manuscript-comment-count" : undefined}
            aria-controls=${`${mode}-rail-panel`}
            aria-selected=${String(this.mode === mode)}
            title=${mode === "guide" ? "Writing guide" : label}
            data-rail-mode=${mode}
            @click=${this.select}
          >
            ${unsafeHTML(renderIcon(icon, "rail-mode-icon"))}<span class="rail-mode-label">${mode === "guide" ? "Guide" : label}</span>
            ${mode === "comments"
              ? html`<span class="count-badge rail-mode-count" id="manuscript-comment-count">${this.commentCount}</span>`
              : ""}
          </button>
        `,
      )}
    </div>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("workspace-rail-tabs")) {
  customElements.define("workspace-rail-tabs", WorkspaceRailTabs);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-rail-tabs": WorkspaceRailTabs;
  }
}
