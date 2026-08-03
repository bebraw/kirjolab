import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

import { LightDomElement } from "../platform/light-dom-controller";
import { loadMarkdownRuntime, type MarkdownRuntime } from "../preview/markdown-runtime";

export const chapterNotesPanelActionEvent = "chapter-notes-panel-action";

export interface ChapterNotesFile {
  readonly content: string;
  readonly id: string;
  readonly path: string;
}

export interface ChapterNotesRequest {
  readonly chapterPath: string;
  readonly notes: ChapterNotesFile | null;
}

export interface ChapterNotesPanelAction {
  readonly action: "open-in-editor";
  readonly chapterPath: string;
  readonly fileId: string;
  readonly path: string;
}

export type ChapterNotesPanelOutcome = { readonly available: false } | { readonly available: true };

type ChapterNotesView =
  | { readonly kind: "empty" }
  | { readonly kind: "html"; readonly value: string }
  | { readonly kind: "loading" }
  | { readonly kind: "source"; readonly value: string }
  | { readonly kind: "unavailable" };

export class ChapterNotesPanel extends LightDomElement {
  static override properties = {
    request: { state: true },
    view: { state: true },
  };

  declare protected request: ChapterNotesRequest | null;
  declare protected view: ChapterNotesView;
  private renderVersion = 0;

  constructor() {
    super();
    this.request = null;
    this.view = { kind: "unavailable" };
  }

  async presentNotes(request: ChapterNotesRequest): Promise<ChapterNotesPanelOutcome | null> {
    const version = ++this.renderVersion;
    this.request = request;
    const notes = request.notes;
    if (!notes) {
      this.view = { kind: "unavailable" };
      return { available: false };
    }
    if (!notes.content.trim()) {
      this.view = { kind: "empty" };
      return { available: true };
    }
    this.view = { kind: "loading" };
    try {
      const runtime = await this.loadRuntime();
      if (version !== this.renderVersion) return null;
      const rendered = runtime.renderWorkspaceMarkdown(notes.content, "");
      this.view = { kind: "html", value: rendered.html };
      await this.updateComplete;
      return version === this.renderVersion ? { available: true } : null;
    } catch {
      if (version !== this.renderVersion) return null;
      this.view = { kind: "source", value: notes.content };
      return { available: false };
    }
  }

  protected override render(): TemplateResult {
    const notes = this.request?.notes;
    const path = notes?.path;
    return html`
      <header class="context-resource-header">
        <div class="min-w-0">
          <p class="eyebrow">Companion document</p>
          <h2 class="context-resource-title" id="chapter-notes-title">Chapter notes</h2>
          <p class="context-resource-meta" id="chapter-notes-path" title=${path ?? ""}>${path ?? this.unavailablePathDescription()}</p>
        </div>
        <button
          class="button-secondary justify-center"
          id="open-chapter-notes"
          type="button"
          ?disabled=${!notes}
          @click=${this.openInEditor}
        >
          Open in editor
        </button>
      </header>
      <div class="context-publication-body" id="context-chapter-notes-scroll">
        <article class="prose-preview" id="chapter-notes-document" aria-labelledby="chapter-notes-title" aria-live="polite">
          ${this.renderView()}
        </article>
      </div>
    `;
  }

  protected openInEditor(): void {
    const notes = this.request?.notes;
    const chapterPath = this.request?.chapterPath;
    if (!notes || !chapterPath) return;
    this.dispatchEvent(
      new CustomEvent<ChapterNotesPanelAction>(chapterNotesPanelActionEvent, {
        bubbles: true,
        composed: true,
        detail: { action: "open-in-editor", chapterPath, fileId: notes.id, path: notes.path },
      }),
    );
  }

  protected loadRuntime(): Promise<MarkdownRuntime> {
    return loadMarkdownRuntime();
  }

  private renderView(): TemplateResult {
    switch (this.view.kind) {
      case "html":
        return html`${unsafeHTML(this.view.value)}`;
      case "loading":
        return html`<p class="empty-state" role="status">Rendering chapter notes…</p>`;
      case "empty":
        return html`<p class="empty-state">This notes file is empty. Open it in the editor to start capturing ideas.</p>`;
      case "source":
        return html`
          <p class="empty-state" role="status">Rich notes preview is unavailable. Showing Markdown source.</p>
          <pre>${this.view.value}</pre>
        `;
      case "unavailable":
        return html`<p class="empty-state">This chapter has no available companion notes.</p>`;
    }
  }

  private unavailablePathDescription(): string {
    return this.request?.chapterPath
      ? `No companion notes are available for ${this.request.chapterPath}.`
      : "Open a chapter to read its companion notes.";
  }
}

if (typeof customElements !== "undefined" && !customElements.get("chapter-notes-panel")) {
  customElements.define("chapter-notes-panel", ChapterNotesPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "chapter-notes-panel": ChapterNotesPanel;
  }
}
