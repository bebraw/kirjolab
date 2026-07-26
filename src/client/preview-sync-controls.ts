import { html, LitElement, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { CompositionSourceSpan } from "../domain/project-files";
import { renderIcon } from "../ui/icons";
import { previewOffsetsForSourceLocation, sourceLocationForPreviewOffset, type PreviewSourceLocation } from "./source-preview-sync";

export const previewSyncActionEvent = "preview-sync-action";
export type PreviewSyncAction = "preview-to-source" | "source-to-preview";

export class PreviewSyncControls extends LitElement {
  #sourceMap: readonly CompositionSourceSpan[] = [];

  setSourceMap(sourceMap: readonly CompositionSourceSpan[]): void {
    this.#sourceMap = sourceMap;
  }

  sourceLocation(previewOffset: number): PreviewSourceLocation | null {
    return sourceLocationForPreviewOffset(this.#sourceMap, previewOffset);
  }

  previewOffsets(fileId: string, sourceOffset: number): readonly number[] {
    return previewOffsetsForSourceLocation(this.#sourceMap, fileId, sourceOffset);
  }

  setVisible(visible: boolean): void {
    this.hidden = !visible;
  }

  protected sync(event: Event): void {
    const action = (event.currentTarget as HTMLButtonElement).dataset.syncAction as PreviewSyncAction | undefined;
    if (!action) return;
    this.dispatchEvent(new CustomEvent<PreviewSyncAction>(previewSyncActionEvent, { bubbles: true, composed: true, detail: action }));
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
}

if (typeof customElements !== "undefined" && !customElements.get("preview-sync-controls")) {
  customElements.define("preview-sync-controls", PreviewSyncControls);
}

declare global {
  interface HTMLElementTagNameMap {
    "preview-sync-controls": PreviewSyncControls;
  }
}
