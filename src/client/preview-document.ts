import { resolveProjectPath, type CompositionSourceSpan } from "../domain/project-files";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { sourceSpanAt } from "./composition-source-map";

interface ProjectPreviewImageContext {
  readonly apiBase: string;
  readonly hiddenAssetIds: ReadonlySet<string>;
  readonly snapshot: WorkspaceSnapshot;
  readonly source: string;
  readonly sourceMap: readonly CompositionSourceSpan[];
}

export class PreviewDocument {
  readonly #article: HTMLElement;
  readonly #viewport: HTMLElement;
  #syncHighlightTimer: number | undefined;

  static forDocument(root: Document): PreviewDocument {
    return new PreviewDocument(requiredPreviewElement(root, "preview"), requiredPreviewElement(root, "preview-scroll"));
  }

  constructor(article: HTMLElement, viewport: HTMLElement) {
    this.#article = article;
    this.#viewport = viewport;
  }

  onClick(listener: (event: MouseEvent) => void): void {
    this.#article.addEventListener("click", listener);
  }

  showSource(source: string): void {
    this.#article.textContent = source;
  }

  showHtml(html: string): void {
    this.#article.innerHTML = html;
  }

  centeredSourceElement(): HTMLElement | null {
    const bounds = this.#viewport.getBoundingClientRect();
    const centered = document
      .elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      ?.closest<HTMLElement>("[data-source-from][data-source-to]");
    return centered && this.#article.contains(centered) ? centered : this.nearestSourceElement();
  }

  nearestSourceElement(offsets: readonly number[] = []): HTMLElement | null {
    const viewportCenter = this.#viewport.getBoundingClientRect().top + this.#viewport.clientHeight / 2;
    const candidates = [...this.#article.querySelectorAll<HTMLElement>("[data-source-from][data-source-to]")]
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

  center(target: HTMLElement): void {
    const viewportBounds = this.#viewport.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    this.#viewport.scrollTop += targetBounds.top + targetBounds.height / 2 - (viewportBounds.top + viewportBounds.height / 2);
  }

  markSyncTarget(target: HTMLElement): void {
    if (this.#syncHighlightTimer !== undefined) window.clearTimeout(this.#syncHighlightTimer);
    this.#article.querySelector<HTMLElement>('[data-preview-sync-active="true"]')?.removeAttribute("data-preview-sync-active");
    target.dataset.previewSyncActive = "true";
    this.#syncHighlightTimer = window.setTimeout(() => {
      target.removeAttribute("data-preview-sync-active");
      this.#syncHighlightTimer = undefined;
    }, 900);
  }

  resetScroll(): void {
    this.#viewport.scrollTop = 0;
  }

  images(): NodeListOf<HTMLImageElement> {
    return this.#article.querySelectorAll<HTMLImageElement>("img");
  }

  resolveProjectImages(context: ProjectPreviewImageContext): void {
    if (context.snapshot.assets.length === 0) return;
    const matches = [
      ...context.source.matchAll(/!\[[^\]\r\n]*\]\((?<path><[^>\r\n]+>|[^\s)\r\n]+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/gu),
    ];
    this.images().forEach((image, index) => {
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

  scrollToAnchor(id: string): void {
    this.#article.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function previewElementContainsOffset(element: HTMLElement, offsets: readonly number[]): boolean {
  const from = Number.parseInt(element.dataset.sourceFrom ?? "", 10);
  const to = Number.parseInt(element.dataset.sourceTo ?? "", 10);
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && offsets.some((offset) => offset >= from && offset < to);
}

function previewSourceRangeLength(element: HTMLElement): number {
  const from = Number.parseInt(element.dataset.sourceFrom ?? "", 10);
  const to = Number.parseInt(element.dataset.sourceTo ?? "", 10);
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) ? Math.max(0, to - from) : Number.POSITIVE_INFINITY;
}

function requiredPreviewElement(root: Document, id: string): HTMLElement {
  const element = root.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing #${id}`);
  return element;
}
