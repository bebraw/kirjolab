import { html, nothing, type TemplateResult } from "lit";
import { contextTabAction } from "./context-tab-action";
import type { ResearchContextKey, ResearchContextTab } from "./research-context";
import { LightDomElement } from "../platform/light-dom-controller";

export const contextTabOverviewActionEvent = "context-tab-overview-action";

export interface ContextTabOverviewItem {
  readonly tab: ResearchContextTab;
  readonly title: string;
}

export interface ContextTabOverviewData {
  readonly activeKey: ResearchContextKey;
  readonly items: readonly ContextTabOverviewItem[];
  readonly standaloneLibrary: boolean;
}

export class ContextTabOverview extends LightDomElement {
  static override properties = {
    data: { state: true },
  };

  declare private data: ContextTabOverviewData;

  constructor() {
    super();
    this.data = { activeKey: "preview", items: [], standaloneLibrary: false };
  }

  setTabs(data: ContextTabOverviewData): void {
    this.data = data;
  }

  protected override render(): TemplateResult {
    const hidden = this.data.standaloneLibrary || this.data.items.length <= 3;
    return html`
      <details class="context-tab-overview action-menu ui-menu" id="context-tab-overview" data-action-menu ?hidden=${hidden}>
        <summary class="context-tab-overview-trigger" aria-label="Open context list" title="Open context list">
          Tabs <span class="count-badge" id="context-tab-overview-count">${this.data.items.length}</span>
        </summary>
        <div class="editor-command-menu context-tab-overview-menu ui-menu-panel" id="context-tab-overview-list" aria-label="Open contexts">
          ${hidden ? nothing : this.data.items.map((item) => this.renderItem(item))}
        </div>
      </details>
    `;
  }

  protected act(event: Event): void {
    const action = contextTabAction(event);
    if (!action) return;
    (event.currentTarget as HTMLButtonElement).closest("details")?.removeAttribute("open");
    this.dispatchEvent(
      new CustomEvent(contextTabOverviewActionEvent, {
        bubbles: true,
        composed: true,
        detail: action,
      }),
    );
  }

  private renderItem({ tab, title }: ContextTabOverviewItem): TemplateResult {
    const permanent = tab.kind === "preview" || tab.kind === "library" || tab.kind === "assistant";
    return html`
      <div class="context-tab-overview-row">
        <button
          type="button"
          class="context-tab-overview-activate"
          data-context-key=${tab.key}
          data-context-action="activate"
          aria-current=${this.data.activeKey === tab.key ? "page" : "false"}
          @click=${this.act}
        >
          <strong>${title}</strong>
          <span>${tab.kind === "library-pdf" ? "Library PDF" : tab.kind.replace("-", " ")}</span>
        </button>
        ${permanent
          ? nothing
          : html`<button
              type="button"
              class="context-tab-overview-close"
              data-context-key=${tab.key}
              data-context-action="close"
              aria-label=${`Close ${title} from context list`}
              title=${`Close ${title}`}
              @click=${this.act}
            >
              ×
            </button>`}
      </div>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("context-tab-overview-panel")) {
  customElements.define("context-tab-overview-panel", ContextTabOverview);
}

declare global {
  interface HTMLElementTagNameMap {
    "context-tab-overview-panel": ContextTabOverview;
  }
}
