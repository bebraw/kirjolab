import { html, LitElement, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { CompositionSourceSpan } from "../domain/project-files";
import { renderIcon } from "../ui/icons";
import { previewOffsetsForSourceLocation, sourceLocationForPreviewOffset, type PreviewSourceLocation } from "./source-preview-sync";

export type PreviewSyncAction = "preview-to-source" | "source-to-preview";

interface PreviewSyncCallbacks {
  readonly previewToSource: () => void;
  readonly sourceToPreview: (explicit: boolean) => void;
}

const sourceNavigationKeys = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);

export class PreviewSyncControls extends LitElement {
  #sourceMap: readonly CompositionSourceSpan[] = [];
  #source: HTMLTextAreaElement | null = null;
  #sourceHighlight: HTMLElement | null = null;
  #callbacks: PreviewSyncCallbacks = { previewToSource: () => undefined, sourceToPreview: () => undefined };
  #sourceAbort: AbortController | null = null;

  bindSource(source: HTMLTextAreaElement, sourceHighlight: HTMLElement, callbacks: PreviewSyncCallbacks): void {
    this.#source = source;
    this.#sourceHighlight = sourceHighlight;
    this.#callbacks = callbacks;
    this.#connectSource();
  }

  setSourceMap(sourceMap: readonly CompositionSourceSpan[]): void {
    this.#sourceMap = sourceMap;
  }

  sourceLocation(previewOffset: number): PreviewSourceLocation | null {
    return sourceLocationForPreviewOffset(this.#sourceMap, previewOffset);
  }

  previewOffsets(fileId: string, sourceOffset: number): readonly number[] {
    return previewOffsetsForSourceLocation(this.#sourceMap, fileId, sourceOffset);
  }

  activeSourcePreviewOffsets(fileId: string, explicit: boolean, previewActive: boolean, splitLayout: boolean): readonly number[] {
    if (!previewActive || (!explicit && (!splitLayout || !window.matchMedia("(min-width: 72rem)").matches))) return [];
    const sourceOffset = explicit ? this.sourceOffsetAtCenter() : (this.#source?.selectionEnd ?? 0);
    return this.previewOffsets(fileId, sourceOffset);
  }

  centerSourceOffset(sourceOffset: number): void {
    const source = this.#source;
    const sourceHighlight = this.#sourceHighlight;
    if (!source || !sourceHighlight) return;
    const beforeOffset = source.value.slice(0, Math.max(0, sourceOffset));
    const lineNumber = [...beforeOffset.matchAll(/\r\n|\r|\n/gu)].length + 1;
    const line = sourceHighlight.querySelector<HTMLElement>(`.source-editor-line[data-line-number="${lineNumber}"]`);
    if (line) source.scrollTop = line.offsetTop + line.offsetHeight / 2 - source.clientHeight / 2;
  }

  sourceOffsetAtCenter(): number {
    const source = this.#source;
    const sourceHighlight = this.#sourceHighlight;
    if (!source || !sourceHighlight) return 0;
    const center = source.scrollTop + source.clientHeight / 2;
    const lines = [...sourceHighlight.querySelectorAll<HTMLElement>(".source-editor-line")];
    let nearestLine = lines[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const distance = Math.abs(line.offsetTop + line.offsetHeight / 2 - center);
      if (distance >= nearestDistance) continue;
      nearestLine = line;
      nearestDistance = distance;
    }
    const lineNumber = Number.parseInt(nearestLine?.dataset.lineNumber ?? "1", 10);
    if (!Number.isSafeInteger(lineNumber) || lineNumber <= 1) return 0;
    const lineOffsets = [0, ...[...source.value.matchAll(/\r\n|\r|\n/gu)].map((match) => match.index + match[0].length)];
    return lineOffsets[lineNumber - 1] ?? source.value.length;
  }

  setVisible(visible: boolean): void {
    this.hidden = !visible;
  }

  protected sync(event: Event): void {
    const action = (event.currentTarget as HTMLButtonElement).dataset.syncAction as PreviewSyncAction | undefined;
    if (action === "source-to-preview") this.#callbacks.sourceToPreview(true);
    else if (action === "preview-to-source") this.#callbacks.previewToSource();
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
    this.#connectSource();
  }

  override disconnectedCallback(): void {
    this.#sourceAbort?.abort();
    this.#sourceAbort = null;
    super.disconnectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <button
        id="sync-preview-from-source"
        type="button"
        aria-label="Reveal centered source passage in Preview"
        title="Source to Preview"
        data-sync-action="source-to-preview"
        @click=${this.sync}
      >
        ${unsafeHTML(renderIcon("arrowRight"))}
      </button>
      <button
        id="sync-source-from-preview"
        type="button"
        aria-label="Reveal centered Preview passage in source"
        title="Preview to source"
        data-sync-action="preview-to-source"
        @click=${this.sync}
      >
        ${unsafeHTML(renderIcon("arrowLeft"))}
      </button>
    `;
  }

  #connectSource(): void {
    this.#sourceAbort?.abort();
    const source = this.#source;
    if (!source) return;
    this.#sourceAbort = new AbortController();
    const options = { signal: this.#sourceAbort.signal };
    source.addEventListener("click", this.#handleSourceSelection, options);
    source.addEventListener("select", this.#handleSourceSelection, options);
    source.addEventListener("keyup", this.#handleSourceKey, options);
  }

  readonly #handleSourceSelection = (): void => {
    this.#callbacks.sourceToPreview(false);
  };

  readonly #handleSourceKey = (event: KeyboardEvent): void => {
    if (sourceNavigationKeys.has(event.key)) this.#callbacks.sourceToPreview(false);
  };
}

if (typeof customElements !== "undefined" && !customElements.get("preview-sync-controls")) {
  customElements.define("preview-sync-controls", PreviewSyncControls);
}

declare global {
  interface HTMLElementTagNameMap {
    "preview-sync-controls": PreviewSyncControls;
  }
}
