import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderIcon, type IconName } from "../../ui/icons";
import { LightDomElement } from "../platform/light-dom-controller";
import type { WorkspaceRail } from "./workspace-ui-route";

const tabs: readonly { readonly icon: IconName; readonly label: string; readonly mode: WorkspaceRail }[] = [
  { icon: "files", label: "Files", mode: "files" },
  { icon: "research", label: "Research", mode: "research" },
  { icon: "comments", label: "Comments", mode: "comments" },
  { icon: "guide", label: "Writing guide", mode: "guide" },
];

export class WorkspaceRailTabs extends LightDomElement {
  static override properties = {
    commentCount: { state: true },
    mode: { state: true },
  };

  declare private commentCount: number;
  declare mode: WorkspaceRail;
  private navigation: ((mode: WorkspaceRail) => void) | null = null;

  constructor() {
    super();
    this.commentCount = 0;
    this.mode = "files";
  }

  setCommentCount(count: number): void {
    this.commentCount = count;
  }

  bindNavigation(navigate: (mode: WorkspaceRail) => void): void {
    this.navigation = navigate;
  }

  setMode(mode: WorkspaceRail): void {
    this.mode = mode;
    for (const { mode: panelMode } of tabs) {
      this.setPanelHidden(panelMode, panelMode !== mode);
    }
  }

  navigate(mode: WorkspaceRail): void {
    this.setMode(mode);
    this.navigation?.(mode);
  }

  protected setPanelHidden(mode: WorkspaceRail, hidden: boolean): void {
    const panel = this.ownerDocument.getElementById(`${mode}-rail-panel`);
    if (panel instanceof HTMLElement) panel.hidden = hidden;
  }

  protected select(event: Event): void {
    const mode = (event.currentTarget as HTMLButtonElement).dataset.railMode as WorkspaceRail | undefined;
    if (!mode || mode === this.mode) return;
    this.navigate(mode);
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
            ${
              mode === "comments"
                ? html`<span class="count-badge rail-mode-count" id="manuscript-comment-count">${this.commentCount}</span>`
                : ""
            }
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
