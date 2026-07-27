import { html, LitElement, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { Diagnostic } from "../domain/markdown";
import {
  composeProject,
  previewProjectFile,
  resolveProjectPath,
  type CompositionSourceSpan,
  type ProjectComposition,
  type ProjectFile,
  type ProjectFilePreview,
} from "../domain/project-files";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { sourceSpanAt } from "./composition-source-map";
import { parseCitationKeys, type CitationContext } from "./citations";
import { loadMarkdownRuntime, type MarkdownRuntime } from "./markdown-runtime";
import {
  previewDiagnosticSelectEvent,
  PreviewContextStatus,
  PreviewDiagnosticsPanel,
  type PreviewDiagnosticSelection,
} from "./preview-presentation";
import { PreviewSyncControls } from "./preview-sync-controls";

export const workspacePreviewActionEvent = "workspace-preview-action";

export type WorkspacePreviewAction =
  | { readonly action: "citation"; readonly citation: CitationContext }
  | { readonly action: "source"; readonly offset: number };

export interface WorkspacePreviewRequest {
  readonly apiBase: string;
  readonly bibliography: string;
  readonly filePreview: ProjectFilePreview | null;
  readonly hiddenAssetIds: ReadonlySet<string>;
  readonly publicationComposition: ProjectComposition | null;
  readonly renderedSource: string;
  readonly snapshot: WorkspaceSnapshot | null;
}

export type WorkspacePreviewOutcome =
  | { readonly available: false }
  | { readonly available: true; readonly diagnostics: readonly Diagnostic[] };

export interface ProjectPreviewRequest {
  readonly activeFileId: string | null;
  readonly apiBase: string;
  readonly bibliography: string;
  readonly fallbackSource: string;
  readonly files: readonly ProjectFile[];
  readonly hiddenAssetIds: ReadonlySet<string>;
  readonly snapshot: WorkspaceSnapshot | null;
}

export interface ProjectPreviewOutcome {
  readonly available: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly filePreview: ProjectFilePreview | null;
  readonly publicationComposition: ProjectComposition | null;
  readonly renderedSource: string;
}

export interface WorkspacePreviewNavigationCallbacks {
  readonly openCitation: (citation: CitationContext) => void;
  readonly selectDiagnostic: (selection: PreviewDiagnosticSelection) => void;
  readonly showSource: (offset: number) => void;
}

const emptyNavigation: WorkspacePreviewNavigationCallbacks = {
  openCitation: () => undefined,
  selectDiagnostic: () => undefined,
  showSource: () => undefined,
};

type PreviewContent = { readonly kind: "html" | "source"; readonly value: string };

export interface ProjectPreviewImageContext {
  readonly apiBase: string;
  readonly hiddenAssetIds: ReadonlySet<string>;
  readonly snapshot: WorkspaceSnapshot;
  readonly source: string;
  readonly sourceMap: readonly CompositionSourceSpan[];
}

export class WorkspacePreview extends LitElement {
  static override properties = { content: { state: true } };

  declare private content: PreviewContent;
  private navigation = emptyNavigation;
  private renderVersion = 0;
  private syncHighlightTimer: number | undefined;

  constructor() {
    super();
    this.content = { kind: "html", value: "" };
    this.addEventListener(workspacePreviewActionEvent, (event) => {
      const detail = (event as CustomEvent<WorkspacePreviewAction>).detail;
      if (detail.action === "source") this.navigation.showSource(detail.offset);
      else this.navigation.openCitation(detail.citation);
    });
    this.addEventListener(previewDiagnosticSelectEvent, (event) => {
      this.navigation.selectDiagnostic((event as CustomEvent<PreviewDiagnosticSelection>).detail);
    });
  }

  bindNavigation(callbacks: WorkspacePreviewNavigationCallbacks): void {
    this.navigation = callbacks;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
    void this.loadRuntime().catch(() => undefined);
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <article class="prose-preview" id="preview" aria-live="polite" @click=${this.handleClick}>
        ${this.content.kind === "html" ? unsafeHTML(this.content.value) : this.content.value}
      </article>
      <preview-diagnostics-panel
        class="mx-auto mt-8 max-w-[44rem] border-t border-app-line pt-4"
        id="diagnostics"
      ></preview-diagnostics-panel>
    `;
  }

  async renderDocument(request: WorkspacePreviewRequest): Promise<WorkspacePreviewOutcome | null> {
    const version = ++this.renderVersion;
    let runtime: MarkdownRuntime;
    try {
      runtime = await this.loadRuntime();
    } catch (error) {
      if (version !== this.renderVersion) return null;
      this.content = { kind: "source", value: request.renderedSource };
      await this.updateComplete;
      this.diagnostics.showUnavailable(error instanceof Error ? error.message : "The Markdown renderer could not be loaded");
      return { available: false };
    }
    if (version !== this.renderVersion) return null;
    const rendered = runtime.renderWorkspaceMarkdown(
      request.renderedSource,
      request.bibliography,
      request.snapshot?.publicationProfile.citationStyle,
      { headingNumbers: previewHeadingNumbers(runtime, request.filePreview, request.publicationComposition) },
    );
    this.content = { kind: "html", value: rendered.html };
    await this.updateComplete;
    if (version !== this.renderVersion) return null;
    if (request.snapshot) {
      this.resolveProjectImages({
        apiBase: request.apiBase,
        hiddenAssetIds: request.hiddenAssetIds,
        snapshot: request.snapshot,
        source: request.renderedSource,
        sourceMap: request.filePreview?.sourceMap ?? [],
      });
    }
    this.diagnostics.setDiagnostics(rendered.diagnostics, request.filePreview);
    return { available: true, diagnostics: rendered.diagnostics };
  }

  async renderProject(request: ProjectPreviewRequest): Promise<ProjectPreviewOutcome | null> {
    const snapshot = request.snapshot;
    const publicationComposition = snapshot ? composeProject(request.files, snapshot.entryFileId, {}, snapshot.reviewArtifactPins) : null;
    const filePreview = snapshot
      ? previewProjectFile(request.files, snapshot.entryFileId, request.activeFileId, snapshot.reviewArtifactPins)
      : null;
    const renderedSource = filePreview?.content ?? request.fallbackSource;
    const outcome = await this.renderDocument({
      apiBase: request.apiBase,
      bibliography: request.bibliography,
      filePreview,
      hiddenAssetIds: request.hiddenAssetIds,
      publicationComposition,
      renderedSource,
      snapshot,
    });
    const projectOutcome: ProjectPreviewOutcome | null = outcome
      ? {
          available: outcome.available,
          diagnostics: outcome.available ? outcome.diagnostics : [],
          filePreview,
          publicationComposition,
          renderedSource,
        }
      : null;
    if (projectOutcome) this.presentProjectOutcome(projectOutcome);
    return projectOutcome;
  }

  protected presentProjectOutcome(outcome: ProjectPreviewOutcome): void {
    const status = this.ownerDocument?.getElementById("preview-context-controls");
    if (status instanceof PreviewContextStatus) {
      status.setFile(outcome.filePreview);
      if (outcome.available) status.setDiagnostics(outcome.diagnostics, outcome.filePreview);
      else status.showUnavailable();
    }
    if (outcome.available) {
      const sync = this.ownerDocument?.getElementById("preview-sync-controls");
      if (sync instanceof PreviewSyncControls) sync.setSourceMap(outcome.filePreview?.sourceMap ?? []);
    }
  }

  centeredSourceOffset(): number | null {
    const bounds = this.viewport.getBoundingClientRect();
    const centered = document
      .elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      ?.closest<HTMLElement>("[data-source-from][data-source-to]");
    const target = centered && this.article.contains(centered) ? centered : this.nearestSourceElement();
    if (!target) return null;
    const offset = sourceOffset(target);
    if (offset === null) return null;
    this.markSyncTarget(target);
    return offset;
  }

  revealNearestSource(offsets: readonly number[]): boolean {
    const target = this.nearestSourceElement(offsets);
    if (!target) return false;
    this.center(target);
    this.markSyncTarget(target);
    return true;
  }

  protected nearestSourceElement(offsets: readonly number[] = []): HTMLElement | null {
    const viewportCenter = this.viewport.getBoundingClientRect().top + this.viewport.clientHeight / 2;
    const candidates = [...this.article.querySelectorAll<HTMLElement>("[data-source-from][data-source-to]")]
      .filter((element) => offsets.length === 0 || previewElementContainsOffset(element, offsets))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          element,
          distance: Math.abs(bounds.top + bounds.height / 2 - viewportCenter),
          rangeLength: previewSourceRangeLength(element),
        };
      });
    candidates.sort((left, right) => left.distance - right.distance || left.rangeLength - right.rangeLength);
    return candidates[0]?.element ?? null;
  }

  protected center(target: HTMLElement): void {
    const viewportBounds = this.viewport.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    this.viewport.scrollTop += targetBounds.top + targetBounds.height / 2 - (viewportBounds.top + viewportBounds.height / 2);
  }

  protected handleClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const citation = event.target.closest<HTMLButtonElement>("button.semantic-citation[data-citation]");
    if (citation) {
      const key = parseCitationKeys(citation.dataset.citation ?? "")[0];
      this.emitAction({
        action: "citation",
        citation: { keys: key ? [key] : [], ...(citation.dataset.locator ? { locator: citation.dataset.locator } : {}) },
      });
      return;
    }
    if (event.target.closest("a, button, input, select, textarea")) return;
    const target = event.target.closest<HTMLElement>("[data-source-from][data-source-to]");
    if (!target) return;
    const offset = sourceOffset(target);
    if (offset === null) return;
    this.markSyncTarget(target);
    this.emitAction({ action: "source", offset });
  }

  private emitAction(detail: WorkspacePreviewAction): void {
    this.dispatchEvent(new CustomEvent<WorkspacePreviewAction>(workspacePreviewActionEvent, { bubbles: true, detail }));
  }

  markSyncTarget(target: HTMLElement): void {
    if (this.syncHighlightTimer !== undefined) window.clearTimeout(this.syncHighlightTimer);
    this.article.querySelector<HTMLElement>('[data-preview-sync-active="true"]')?.removeAttribute("data-preview-sync-active");
    target.dataset.previewSyncActive = "true";
    this.syncHighlightTimer = window.setTimeout(() => {
      target.removeAttribute("data-preview-sync-active");
      this.syncHighlightTimer = undefined;
    }, 900);
  }

  resetScroll(): void {
    this.viewport.scrollTop = 0;
  }

  scrollToAnchor(id: string): void {
    this.article.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  protected loadRuntime(): Promise<MarkdownRuntime> {
    return loadMarkdownRuntime();
  }

  protected resolveProjectImages(context: ProjectPreviewImageContext): void {
    if (context.snapshot.assets.length === 0) return;
    const matches = [
      ...context.source.matchAll(/!\[[^\]\r\n]*\]\((?<path><[^>\r\n]+>|[^\s)\r\n]+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/gu),
    ];
    this.article.querySelectorAll<HTMLImageElement>("img").forEach((image, index) => {
      const match = matches[index];
      const requested = match?.groups?.path?.replace(/^<|>$/gu, "");
      if (!match || !requested || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/iu.test(requested)) return;
      const span = context.sourceMap.length > 0 && match.index !== undefined ? sourceSpanAt(context.sourceMap, match.index) : undefined;
      const fromPath = span?.path ?? context.snapshot.files.find((file) => file.id === context.snapshot.entryFileId)?.path ?? "";
      const path = resolveProjectPath(fromPath, requested);
      const asset = context.snapshot.assets.find((candidate) => candidate.path === path && !context.hiddenAssetIds.has(candidate.id));
      if (asset) image.src = `${context.apiBase}/assets/${encodeURIComponent(asset.id)}`;
    });
  }

  protected get article(): HTMLElement {
    const article = this.querySelector<HTMLElement>("#preview");
    if (!article) throw new Error("Workspace preview article is unavailable");
    return article;
  }

  protected get viewport(): HTMLElement {
    const viewport = this.parentElement;
    if (!(viewport instanceof HTMLElement)) throw new Error("Workspace preview requires a viewport parent");
    return viewport;
  }

  protected get diagnostics(): PreviewDiagnosticsPanel {
    const diagnostics = this.querySelector<PreviewDiagnosticsPanel>("#diagnostics");
    if (!diagnostics) throw new Error("Workspace preview diagnostics are unavailable");
    return diagnostics;
  }
}

function previewElementContainsOffset(element: HTMLElement, offsets: readonly number[]): boolean {
  const from = Number.parseInt(element.dataset.sourceFrom ?? "", 10);
  const to = Number.parseInt(element.dataset.sourceTo ?? "", 10);
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && offsets.some((offset) => offset >= from && offset < to);
}

function sourceOffset(element: HTMLElement): number | null {
  const offset = Number.parseInt(element.dataset.sourceFrom ?? "", 10);
  return Number.isSafeInteger(offset) ? offset : null;
}

function previewSourceRangeLength(element: HTMLElement): number {
  const from = Number.parseInt(element.dataset.sourceFrom ?? "", 10);
  const to = Number.parseInt(element.dataset.sourceTo ?? "", 10);
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) ? Math.max(0, to - from) : Number.POSITIVE_INFINITY;
}

export function previewHeadingNumbers(
  runtime: MarkdownRuntime,
  filePreview: ProjectFilePreview | null,
  publicationComposition: ProjectComposition | null,
): Record<number, string> {
  const headingNumbers: Record<number, string> = {};
  if (filePreview?.mode !== "isolated" || !publicationComposition) return headingNumbers;
  for (const [outputOffset, number] of Object.entries(runtime.headingNumbersByOffset(publicationComposition.content))) {
    const span = sourceSpanAt(publicationComposition.sourceMap, Number(outputOffset));
    if (!span || span.fileId !== filePreview.fileId) continue;
    const sourceOffset = span.sourceStart + Number(outputOffset) - span.outputStart;
    headingNumbers[sourceOffset] ??= number;
  }
  return headingNumbers;
}

if (typeof customElements !== "undefined" && !customElements.get("workspace-preview")) {
  customElements.define("workspace-preview", WorkspacePreview);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-preview": WorkspacePreview;
  }
}
