import { html, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

import { LightDomElement } from "../platform/light-dom-controller";
import type { CompositionSourceSpan } from "../../domain/project/project-files";
import { renderIcon } from "../../ui/icons";
import { lowerBound } from "./lower-bound";
import { previewOffsetsForSourceLocation, sourceLocationForPreviewOffset, type PreviewSourceLocation } from "./source-preview-sync";

export type PreviewSyncAction = "preview-to-source" | "source-to-preview" | "toggle-scroll-link";
export type PreviewScrollEdge = "end" | "start" | null;

export interface PreviewScrollBinding {
  readonly onIntent: (event: Event) => void;
  readonly onScroll: () => void;
}

export interface PreviewSyncOwners {
  readonly projectFileDialog: {
    readonly activeFileId: string | null;
    readonly project: { readonly entryFileId: string } | null;
    focusRange(fileId: string, start: number, end: number): void;
  };
  readonly source: HTMLTextAreaElement;
  readonly sourceHighlight: HTMLElement;
  readonly workspacePreview: {
    bindScrollSync(binding: PreviewScrollBinding, signal: AbortSignal): void;
    centeredPreviewScrollOffset(): number | null;
    centeredSourceOffset(markTarget?: boolean): number | null;
    centerPreviewScrollOffsets(offsets: readonly number[], edge?: PreviewScrollEdge): boolean;
    previewScrollEdge(): PreviewScrollEdge;
    syncFromSource(explicit: boolean, markTarget?: boolean): void;
  };
  readonly workspaceSurfaces: HTMLElement;
}

const sourceNavigationKeys = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);
const previewScrollKeys = new Set([" ", "ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);
type ScrollLeader = "preview" | "source";
type SourceLineCollection = { readonly [index: number]: HTMLElement | undefined; readonly length: number };
interface SourceLineOffsetContext {
  readonly boundedOffset: number;
  readonly firstOffsetAfter: number;
  readonly lineOffsets: readonly number[];
}
interface SourceViewportContext {
  readonly center: number;
  readonly lines: SourceLineCollection;
  readonly source: HTMLTextAreaElement;
}

export class PreviewSyncControls extends LightDomElement {
  static override properties = { scrollLinked: { state: true } };

  declare protected scrollLinked: boolean;
  #sourceMap: readonly CompositionSourceSpan[] = [];
  #owners: PreviewSyncOwners | null = null;
  #sourceAbort: AbortController | null = null;
  #scrollFrame: number | null = null;
  #scrollLeader: ScrollLeader | null = null;
  #pendingScrollLeader: ScrollLeader | null = null;
  #cachedSourceValue: string | null = null;
  #cachedLineOffsets: readonly number[] = [0];

  constructor() {
    super();
    this.scrollLinked = false;
  }

  bindSource(owners: PreviewSyncOwners): void {
    this.#stopScrollFollowing();
    this.#invalidateSourceLines();
    this.#owners = owners;
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
    const sourceOffset = explicit ? this.sourceOffsetAtCenter() : (this.#owners?.source.selectionEnd ?? 0);
    return this.previewOffsets(fileId, sourceOffset);
  }

  centerSourceOffset(sourceOffset: number): void {
    const source = this.#owners?.source;
    const sourceHighlight = this.#owners?.sourceHighlight;
    if (!source || !sourceHighlight) return;
    const context = this.#sourceLineOffsetContext(source, sourceOffset);
    if (!context) return;
    const lineNumber = Math.max(1, context.firstOffsetAfter);
    const line = sourceHighlight.querySelector<HTMLElement>(`.source-editor-line[data-line-number="${lineNumber}"]`);
    if (line) source.scrollTop = line.offsetTop + line.offsetHeight / 2 - source.clientHeight / 2;
  }

  centerSourceScrollOffset(sourceOffset: number, edge: PreviewScrollEdge = null): void {
    const source = this.#owners?.source;
    const sourceHighlight = this.#owners?.sourceHighlight;
    if (!source || !sourceHighlight) return;
    if (edge !== null) {
      source.scrollTop = edge === "start" ? 0 : maximumScrollTop(source);
      return;
    }
    const context = this.#sourceLineOffsetContext(source, sourceOffset);
    if (!context) return;
    const lineIndex = Math.max(0, context.firstOffsetAfter - 1);
    const line = sourceEditorLines(sourceHighlight)[lineIndex];
    if (!line) return;
    const from = context.lineOffsets[lineIndex] ?? 0;
    const to = context.lineOffsets[lineIndex + 1] ?? source.value.length;
    const progress = to > from ? (context.boundedOffset - from) / (to - from) : 0.5;
    source.scrollTop = line.offsetTop + line.offsetHeight * clampUnit(progress) - source.clientHeight / 2;
  }

  sourceOffsetAtCenter(): number {
    const context = this.#sourceViewportContext();
    if (!context) return 0;
    const nearestLine = centeredSourceLine(context.lines, context.center);
    const lineNumber = Number.parseInt(nearestLine?.dataset.lineNumber ?? "1", 10);
    if (!Number.isSafeInteger(lineNumber) || lineNumber <= 1) return 0;
    const lineOffsets = this.#sourceLineOffsets(context.source);
    return lineOffsets[lineNumber - 1] ?? context.source.value.length;
  }

  sourceScrollOffsetAtCenter(): number {
    const context = this.#sourceViewportContext();
    if (!context) return 0;
    const lineIndex = sourceLineAtPosition(context.lines, context.center);
    if (lineIndex === null) return 0;
    const line = context.lines[lineIndex];
    if (!line) return 0;
    const lineOffsets = this.#sourceLineOffsets(context.source);
    const from = lineOffsets[lineIndex] ?? 0;
    const to = lineOffsets[lineIndex + 1] ?? context.source.value.length;
    if (to <= from || line.offsetHeight <= 0) return from;
    const progress = clampUnit((context.center - line.offsetTop) / line.offsetHeight);
    return from + (to - from) * progress;
  }

  setVisible(visible: boolean): void {
    this.hidden = !visible;
    if (!visible) this.#stopScrollFollowing();
  }

  setScrollLinked(linked: boolean): void {
    if (linked === this.scrollLinked) return;
    this.scrollLinked = linked;
    this.#stopScrollFollowing();
  }

  showSource(previewOffset: number, centerEditor = false): void {
    const location = this.sourceLocation(previewOffset);
    if (!location) return;
    this.#setScrollLeader("preview");
    this.#owners?.projectFileDialog.focusRange(location.fileId, location.offset, location.offset);
    if (centerEditor) this.centerSourceOffset(location.offset);
  }

  protected sync(event: Event): void {
    const action = (event.currentTarget as HTMLButtonElement).dataset.syncAction as PreviewSyncAction | undefined;
    if (action === "toggle-scroll-link") this.setScrollLinked(!this.scrollLinked);
    else if (action === "source-to-preview") {
      this.#setScrollLeader("source");
      this.#owners?.workspacePreview.syncFromSource(true);
    } else if (action === "preview-to-source") {
      this.#setScrollLeader("preview");
      const offset = this.#owners?.workspacePreview.centeredSourceOffset() ?? null;
      if (offset !== null) this.showSource(offset, true);
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#connectSource();
  }

  override disconnectedCallback(): void {
    this.#sourceAbort?.abort();
    this.#sourceAbort = null;
    this.#cancelScrollFrame();
    super.disconnectedCallback();
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
        id="toggle-preview-scroll-sync"
        type="button"
        aria-label="Source and Preview scroll lock"
        aria-pressed=${String(this.scrollLinked)}
        title=${this.scrollLinked ? "Unlock scrolling" : "Lock scrolling"}
        data-sync-action="toggle-scroll-link"
        @click=${this.sync}
      >
        ${unsafeHTML(renderIcon(this.scrollLinked ? "lock" : "unlock"))}
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
    const source = this.#owners?.source;
    if (!source) return;
    this.#sourceAbort = new AbortController();
    const options = { signal: this.#sourceAbort.signal };
    source.addEventListener("click", this.#handleSourceSelection, options);
    source.addEventListener("input", this.#handleSourceInput, options);
    source.addEventListener("keydown", this.#handleSourceIntent, options);
    source.addEventListener("pointerdown", this.#handleSourceIntent, options);
    source.addEventListener("scroll", this.#handleSourceScroll, { ...options, passive: true });
    source.addEventListener("select", this.#handleSourceSelection, options);
    source.addEventListener("touchstart", this.#handleSourceIntent, { ...options, passive: true });
    source.addEventListener("wheel", this.#handleSourceIntent, { ...options, passive: true });
    source.addEventListener("keyup", this.#handleSourceKey, options);
    this.#owners?.workspacePreview.bindScrollSync(
      { onIntent: this.#handlePreviewIntent, onScroll: this.#handlePreviewScroll },
      this.#sourceAbort.signal,
    );
  }

  readonly #handleSourceSelection = (): void => {
    this.#owners?.workspacePreview.syncFromSource(false);
  };

  readonly #handleSourceKey = (event: KeyboardEvent): void => {
    if (sourceNavigationKeys.has(event.key) && (!this.scrollLinked || this.#scrollLeader !== "source")) {
      this.#owners?.workspacePreview.syncFromSource(false);
    }
  };

  readonly #handleSourceInput = (): void => {
    this.#invalidateSourceLines();
    this.#stopScrollFollowing();
  };

  readonly #handleSourceIntent = (event: Event): void => {
    if (event.type === "keydown" && !sourceNavigationKeys.has((event as KeyboardEvent).key)) return;
    this.#setScrollLeader("source");
    if (event.type === "keydown") this.#scheduleScrollSync("source");
  };

  readonly #handlePreviewIntent = (event: Event): void => {
    if (event.type === "keydown" && !previewScrollKeys.has((event as KeyboardEvent).key)) return;
    this.#setScrollLeader("preview");
    if (event.type === "keydown") this.#scheduleScrollSync("preview");
  };

  readonly #handleSourceScroll = (): void => {
    if (this.#scrollLeader === "source") this.#scheduleScrollSync("source");
  };

  readonly #handlePreviewScroll = (): void => {
    if (this.#scrollLeader === "preview") this.#scheduleScrollSync("preview");
  };

  #scheduleScrollSync(leader: ScrollLeader): void {
    if (!this.#canFollowScroll()) return;
    this.#pendingScrollLeader = leader;
    if (this.#scrollFrame !== null) return;
    this.#scrollFrame = window.requestAnimationFrame(() => {
      this.#scrollFrame = null;
      const pending = this.#pendingScrollLeader;
      this.#pendingScrollLeader = null;
      if (!pending || pending !== this.#scrollLeader || !this.#canFollowScroll()) return;
      if (pending === "source") this.#syncPreviewViewportFromSource();
      else this.#syncSourceViewportFromPreview();
    });
  }

  #syncPreviewViewportFromSource(): void {
    const owners = this.#owners;
    if (!owners) return;
    const activeFileId = owners.projectFileDialog.activeFileId ?? owners.projectFileDialog.project?.entryFileId;
    if (!activeFileId) return;
    owners.workspacePreview.centerPreviewScrollOffsets(
      this.previewOffsets(activeFileId, this.sourceScrollOffsetAtCenter()),
      scrollEdge(owners.source),
    );
  }

  #syncSourceViewportFromPreview(): void {
    const owners = this.#owners;
    const previewOffset = owners?.workspacePreview.centeredPreviewScrollOffset() ?? null;
    if (!owners || previewOffset === null) return;
    const location = this.sourceLocation(previewOffset);
    const activeFileId = owners.projectFileDialog.activeFileId ?? owners.projectFileDialog.project?.entryFileId;
    if (!location || location.fileId !== activeFileId) return;
    this.centerSourceScrollOffset(location.offset, owners.workspacePreview.previewScrollEdge());
  }

  #canFollowScroll(): boolean {
    return (
      this.scrollLinked &&
      !this.hidden &&
      this.#owners?.workspaceSurfaces.dataset.layout === "split" &&
      (window.matchMedia?.("(min-width: 70rem)").matches ?? false)
    );
  }

  #stopScrollFollowing(): void {
    this.#scrollLeader = null;
    this.#cancelScrollFrame();
  }

  #setScrollLeader(leader: ScrollLeader): void {
    if (leader !== this.#scrollLeader) this.#cancelScrollFrame();
    this.#scrollLeader = leader;
  }

  #sourceLineOffsets(source: HTMLTextAreaElement): readonly number[] {
    if (source.value === this.#cachedSourceValue) return this.#cachedLineOffsets;
    this.#cachedSourceValue = source.value;
    this.#cachedLineOffsets = [0, ...[...source.value.matchAll(/\r\n|\r|\n/gu)].map((match) => match.index + match[0].length)];
    return this.#cachedLineOffsets;
  }

  #sourceLineOffsetContext(source: HTMLTextAreaElement, sourceOffset: number): SourceLineOffsetContext | null {
    const lineOffsets = this.#sourceLineOffsets(source);
    const boundedOffset = Math.max(0, Math.min(source.value.length, sourceOffset));
    const firstOffsetAfter = firstSourceLineAfterOffset(lineOffsets, boundedOffset);
    return firstOffsetAfter === null ? null : { boundedOffset, firstOffsetAfter, lineOffsets };
  }

  #sourceViewportContext(): SourceViewportContext | null {
    const source = this.#owners?.source;
    const sourceHighlight = this.#owners?.sourceHighlight;
    if (!source || !sourceHighlight) return null;
    return {
      center: source.scrollTop + source.clientHeight / 2,
      lines: sourceEditorLines(sourceHighlight),
      source,
    };
  }

  #invalidateSourceLines(): void {
    this.#cachedSourceValue = null;
    this.#cachedLineOffsets = [0];
  }

  #cancelScrollFrame(): void {
    if (this.#scrollFrame !== null && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(this.#scrollFrame);
    }
    this.#scrollFrame = null;
    this.#pendingScrollLeader = null;
  }
}

function sourceEditorLines(highlight: HTMLElement): SourceLineCollection {
  return (
    (highlight.children as unknown as SourceLineCollection | undefined) ?? highlight.querySelectorAll<HTMLElement>(".source-editor-line")
  );
}

function firstSourceLineAfterOffset(lineOffsets: readonly number[], sourceOffset: number): number | null {
  return lowerBound(lineOffsets, (offset) => offset <= sourceOffset);
}

function centeredSourceLine(lines: SourceLineCollection, center: number): HTMLElement | null {
  const lower = firstSourceLineAtCenter(lines, center);
  if (lower === null) return null;
  const nearest = lines[lower] ?? null;
  const previous = lower > 0 ? (lines[lower - 1] ?? null) : null;
  if (!nearest || !previous) return nearest;
  return lineDistance(previous, center) < lineDistance(nearest, center) ? previous : nearest;
}

function sourceLineAtPosition(lines: SourceLineCollection, position: number): number | null {
  if (lines.length === 0) return null;
  const index = lowerBound(lines, (line) => line.offsetTop + line.offsetHeight < position);
  return index === null ? null : Math.min(index, lines.length - 1);
}

function firstSourceLineAtCenter(lines: SourceLineCollection, center: number): number | null {
  if (lines.length === 0) return null;
  const index = lowerBound(lines, (line) => lineCenter(line) < center);
  return index === null ? null : Math.min(index, lines.length - 1);
}

function lineDistance(line: HTMLElement, center: number): number {
  return Math.abs(lineCenter(line) - center);
}

function lineCenter(line: HTMLElement): number {
  return line.offsetTop + line.offsetHeight / 2;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function maximumScrollTop(element: Pick<HTMLElement, "clientHeight" | "scrollHeight">): number {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function scrollEdge(element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">): PreviewScrollEdge {
  if (element.scrollTop <= 1) return "start";
  const maximum = maximumScrollTop(element);
  return Number.isFinite(maximum) && maximum - element.scrollTop <= 1 ? "end" : null;
}

if (typeof customElements !== "undefined" && !customElements.get("preview-sync-controls")) {
  customElements.define("preview-sync-controls", PreviewSyncControls);
}

declare global {
  interface HTMLElementTagNameMap {
    "preview-sync-controls": PreviewSyncControls;
  }
}
