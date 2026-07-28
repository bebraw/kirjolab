import { html, type TemplateResult } from "lit";

import { LightDomElement } from "./light-dom-controller";
import type { ResearchContextKey, ResearchResourceTab } from "./research-context";

export const contextResourceTabActionEvent = "context-resource-tab-action";

export type ContextResourceTabAction =
  | { readonly action: "activate"; readonly key: ResearchContextKey }
  | { readonly action: "close"; readonly key: ResearchContextKey };

export interface ContextResourceTabItem {
  readonly tab: ResearchResourceTab;
  readonly title: string;
}

export interface ContextResourceTabsData {
  readonly activeKey: ResearchContextKey;
  readonly items: readonly ContextResourceTabItem[];
}

export function contextResourceTabId(tab: ResearchResourceTab): string {
  return `context-tab-${tab.kind}-${tab.id}`;
}

export class ContextResourceTabs extends LightDomElement {
  static override properties = {
    data: { state: true },
  };

  declare private data: ContextResourceTabsData;

  constructor() {
    super();
    this.data = { activeKey: "preview", items: [] };
  }

  setTabs(data: ContextResourceTabsData): void {
    this.data = data;
  }

  protected override render(): TemplateResult {
    return html`<div class="context-resource-tabs" id="context-resource-tabs" role="presentation">
      ${this.data.items.map((item) => this.renderTab(item))}
    </div>`;
  }

  protected act(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const key = button.dataset.contextKey as ResearchContextKey | undefined;
    const action = button.dataset.contextAction;
    if (!key || (action !== "activate" && action !== "close")) return;
    this.dispatchEvent(
      new CustomEvent(contextResourceTabActionEvent, {
        bubbles: true,
        composed: true,
        detail: { action, key } satisfies ContextResourceTabAction,
      }),
    );
  }

  private renderTab({ tab, title }: ContextResourceTabItem): TemplateResult {
    const panelId =
      tab.kind === "publication" ? "context-publication-panel" : tab.kind === "candidate" ? "context-candidate-panel" : "context-pdf-panel";
    const selected = this.data.activeKey === tab.key;
    return html`
      <div class="context-resource-tab" role="presentation">
        <button
          type="button"
          class="context-tab"
          id=${contextResourceTabId(tab)}
          role="tab"
          aria-controls=${panelId}
          aria-selected=${String(selected)}
          tabindex=${selected ? 0 : -1}
          title=${title}
          data-context-key=${tab.key}
          data-context-action="activate"
          @click=${this.act}
        >
          ${title}
        </button>
        <button
          type="button"
          class="context-tab-close"
          aria-label=${`Close ${title}`}
          title=${`Close ${title}`}
          data-context-key=${tab.key}
          data-context-action="close"
          @click=${this.act}
        >
          <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17"></path>
          </svg>
        </button>
      </div>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("context-resource-tabs-panel")) {
  customElements.define("context-resource-tabs-panel", ContextResourceTabs);
}

declare global {
  interface HTMLElementTagNameMap {
    "context-resource-tabs-panel": ContextResourceTabs;
  }
}
