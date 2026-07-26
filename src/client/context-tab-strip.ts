import { html, LitElement, type PropertyValues, type TemplateResult } from "lit";
import type { LibraryPdfArtifact, ProjectReferencePdf } from "../domain/reference-library";
import type { ModelCandidate, PdfResource, PublicationResource } from "../domain/workspace";
import "./context-resource-tabs";
import "./context-tab-overview";
import "./preview-navigation-control";
import { contextResourceTabId, type ContextResourceTabs } from "./context-resource-tabs";
import { type ContextTabOverview } from "./context-tab-overview";
import type { PreviewNavigationControl } from "./preview-navigation-control";
import type { PreviewSyncControls } from "./preview-sync-controls";
import type { ResearchContextKey, ResearchContextTab, ResearchResourceTab } from "./research-context";

export const contextPrimaryTabActionEvent = "context-primary-tab-action";

export type ContextPrimaryTabAction = "preview" | "library" | "assistant";

interface ContextTabStripItem {
  readonly tab: ResearchContextTab;
  readonly title: string;
}

interface ContextTabStripData {
  readonly activeKey: ResearchContextKey;
  readonly items: readonly ContextTabStripItem[];
  readonly standaloneLibrary: boolean;
}

export interface ContextTabStripSources {
  readonly activeKey: ResearchContextKey;
  readonly candidates: readonly ModelCandidate[];
  readonly libraryArtifacts: readonly LibraryPdfArtifact[];
  readonly pdfs: readonly PdfResource[];
  readonly publications: readonly PublicationResource[];
  readonly referencePdfs: readonly ProjectReferencePdf[];
  readonly standaloneLibrary: boolean;
  readonly tabs: readonly ResearchContextTab[];
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

  declare protected data: ContextTabStripData;

  constructor() {
    super();
    this.data = { activeKey: "preview", items: [], standaloneLibrary: false };
  }

  setTabs(sources: ContextTabStripSources): void {
    this.data = {
      activeKey: sources.activeKey,
      items: sources.tabs.map((tab) => ({ tab, title: this.tabTitle(tab, sources) })),
      standaloneLibrary: sources.standaloneLibrary,
    };
    this.syncControlledPanels(sources);
  }

  fixedScrollTop(key: ResearchContextKey): number | null {
    return this.fixedScrollElement(key)?.scrollTop ?? null;
  }

  restoreFixedScroll(key: ResearchContextKey, scrollTop: number): boolean {
    const scroll = this.fixedScrollElement(key);
    if (!scroll) return false;
    scroll.scrollTop = scrollTop;
    return true;
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

  protected controlledPanel(id: string): HTMLElement | null {
    const panel = this.ownerDocument.getElementById(id);
    return panel instanceof HTMLElement ? panel : null;
  }

  private syncControlledPanels(sources: ContextTabStripSources): void {
    const active = this.data.items.find((item) => item.tab.key === this.data.activeKey)?.tab;
    const preview = this.data.activeKey === "preview";
    const states: readonly [id: string, selected: boolean][] = [
      ["context-preview-panel", preview],
      ["context-library-panel", this.data.activeKey === "library"],
      ["context-assistant-panel", this.data.activeKey === "assistant"],
      ["context-publication-panel", active?.kind === "publication"],
      ["context-pdf-panel", active?.kind === "pdf" || active?.kind === "library-pdf"],
      ["pdf-context-controls", active?.kind === "pdf" || active?.kind === "library-pdf"],
      ["context-candidate-panel", active?.kind === "candidate"],
    ];
    for (const [id, selected] of states) {
      const panel = this.controlledPanel(id);
      if (panel) panel.hidden = !selected;
    }
    const previewStatus = this.controlledPanel("preview-context-controls");
    if (previewStatus) previewStatus.hidden = !preview;
    (this.controlledPanel("preview-sync-controls") as PreviewSyncControls | null)?.setVisible(preview);
    (this.controlledPanel("preview-navigation-control") as PreviewNavigationControl | null)?.setPreviewActive(preview);
    const pdfPanel = this.controlledPanel("context-pdf-panel");
    if (pdfPanel) {
      const libraryPdf = active?.kind === "library-pdf";
      const privatePdf = libraryPdf && sources.libraryArtifacts.some(({ id }) => id === active.id);
      const readonlyPdf = libraryPdf && !privatePdf && sources.referencePdfs.some(({ id }) => id === active.id);
      pdfPanel.dataset.libraryPdf = String(libraryPdf);
      pdfPanel.dataset.readonlyPdf = String(readonlyPdf);
    }
    if (active && active.kind !== "preview" && active.kind !== "library" && active.kind !== "assistant") {
      const panelId =
        active.kind === "publication"
          ? "context-publication-panel"
          : active.kind === "candidate"
            ? "context-candidate-panel"
            : "context-pdf-panel";
      const panel = this.controlledPanel(panelId);
      panel?.setAttribute("aria-labelledby", contextResourceTabId(active));
      panel?.removeAttribute("aria-label");
    }
  }

  private fixedScrollElement(key: ResearchContextKey): HTMLElement | null {
    const id =
      key === "preview"
        ? "preview-scroll"
        : key === "library"
          ? "context-library-scroll"
          : key === "assistant"
            ? "context-assistant-scroll"
            : null;
    return id ? this.controlledPanel(id) : null;
  }

  private tabTitle(tab: ResearchContextTab, sources: ContextTabStripSources): string {
    if (tab.kind === "preview") return "Preview";
    if (tab.kind === "library") return "Library";
    if (tab.kind === "assistant") return "Writing assistant";
    if (tab.kind === "publication") return sources.publications.find(({ id }) => id === tab.id)?.title ?? "Reference";
    if (tab.kind === "pdf") return sources.pdfs.find(({ id }) => id === tab.id)?.name ?? "Paper";
    if (tab.kind === "library-pdf") {
      return (
        sources.libraryArtifacts.find(({ id }) => id === tab.id)?.name ??
        sources.referencePdfs.find(({ id }) => id === tab.id)?.name ??
        "Reference PDF"
      );
    }
    const candidate = sources.candidates.find(({ id }) => id === tab.id);
    return candidate ? `Revision · ${candidate.model} · ${candidate.id.slice(0, 4)}` : "Revision";
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
