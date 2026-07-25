import { html, LitElement, type PropertyValues, type TemplateResult } from "lit";
import "./context-resource-tabs";
import "./context-tab-overview";
import { type ContextResourceTabs } from "./context-resource-tabs";
import { type ContextTabOverview } from "./context-tab-overview";
import type { ResearchContextKey, ResearchContextTab, ResearchResourceTab } from "./research-context";

export const contextPrimaryTabActionEvent = "context-primary-tab-action";

export type ContextPrimaryTabAction = "preview" | "library" | "assistant";

export interface ContextTabStripItem {
  readonly tab: ResearchContextTab;
  readonly title: string;
}

export interface ContextTabStripData {
  readonly activeKey: ResearchContextKey;
  readonly items: readonly ContextTabStripItem[];
  readonly standaloneLibrary: boolean;
}

export function contextTabFocusIndex(key: string, currentIndex: number, tabCount: number): number | null {
  if (key === "ArrowRight") return (currentIndex + 1) % tabCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + tabCount) % tabCount;
  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  return null;
}

export class ContextTabStrip extends LitElement {
  static override properties = {
    data: { state: true },
  };

  declare private data: ContextTabStripData;

  constructor() {
    super();
    this.data = { activeKey: "preview", items: [], standaloneLibrary: false };
  }

  setTabs(data: ContextTabStripData): void {
    this.data = data;
  }

  focusTab(key: ResearchContextKey): void {
    const id =
      key === "preview" || key === "library" || key === "assistant" ? `context-${key}-tab` : `context-tab-${key.replace(":", "-")}`;
    queueMicrotask(() =>
      Array.from(this.querySelectorAll<HTMLButtonElement>("[role=tab]"))
        .find((tab) => tab.id === id)
        ?.focus(),
    );
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
      <div
        class="context-tab-list ui-tab-list"
        id="context-tab-list"
        role="tablist"
        aria-label="Research context"
        @keydown=${this.moveFocus}
      >
        ${this.renderPrimaryTab("preview", "Preview", "context-preview-panel")}
        ${this.renderPrimaryTab("library", "Library", "context-library-panel")}
        ${this.renderPrimaryTab("assistant", "Writing assistant", "context-assistant-panel")}
        <context-resource-tabs-panel id="context-resource-tabs-panel"></context-resource-tabs-panel>
      </div>
      <context-tab-overview-panel id="context-tab-overview-panel"></context-tab-overview-panel>
    `;
  }

  protected override updated(_changedProperties: PropertyValues): void {
    this.querySelector<ContextResourceTabs>("context-resource-tabs-panel")?.setTabs({
      activeKey: this.data.activeKey,
      items: this.data.items.filter(
        (item): item is { readonly tab: ResearchResourceTab; readonly title: string } =>
          item.tab.kind !== "preview" && item.tab.kind !== "library" && item.tab.kind !== "assistant",
      ),
    });
    this.querySelector<ContextTabOverview>("context-tab-overview-panel")?.setTabs(this.data);
  }

  protected activatePrimaryTab(event: Event): void {
    const action = (event.currentTarget as HTMLButtonElement).dataset.contextAction as ContextPrimaryTabAction | undefined;
    if (!action) return;
    this.dispatchEvent(
      new CustomEvent(contextPrimaryTabActionEvent, {
        bubbles: true,
        composed: true,
        detail: action,
      }),
    );
  }

  protected moveFocus(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const tabs = Array.from(this.querySelectorAll<HTMLButtonElement>("[role=tab]"));
    const currentIndex = tabs.indexOf(event.target as HTMLButtonElement);
    if (currentIndex < 0 || tabs.length === 0) return;
    const targetIndex = contextTabFocusIndex(event.key, currentIndex, tabs.length);
    if (targetIndex === null) return;
    event.preventDefault();
    for (const tab of tabs) tab.tabIndex = tab === tabs[targetIndex] ? 0 : -1;
    tabs[targetIndex]?.focus();
  }

  private renderPrimaryTab(action: ContextPrimaryTabAction, label: string, panelId: string): TemplateResult {
    const selected = this.data.activeKey === action;
    return html`<button
      class="context-tab ui-tab"
      id=${`context-${action}-tab`}
      type="button"
      role="tab"
      aria-controls=${panelId}
      aria-selected=${String(selected)}
      tabindex=${selected ? 0 : -1}
      data-context-action=${action}
      @click=${this.activatePrimaryTab}
    >
      ${label}
    </button>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("context-tab-strip")) {
  customElements.define("context-tab-strip", ContextTabStrip);
}

declare global {
  interface HTMLElementTagNameMap {
    "context-tab-strip": ContextTabStrip;
  }
}
