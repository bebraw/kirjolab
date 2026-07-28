import type { ContextResourcePresenter } from "./context-resource-presenter";
import type { PdfEvidenceViewer } from "./pdf-viewer";

const railWidthKey = "kirjolab:source-rail-width";
const railCollapsedKey = "kirjolab:source-rail-collapsed";
const defaultRailWidth = 272;
const minimumRailWidth = 208;
const maximumRailWidth = 384;

export interface WorkspaceLayoutElement extends EventTarget {
  readonly dataset: Record<string, string | undefined>;
  readonly nextElementSibling: Element | WorkspaceLayoutElement | null;
  readonly previousElementSibling: Element | WorkspaceLayoutElement | null;
  readonly style: {
    removeProperty(name: string): unknown;
    setProperty(name: string, value: string): unknown;
  };
  focus(): void;
  getBoundingClientRect(): Pick<DOMRect, "left" | "right" | "width">;
  hasPointerCapture(pointerId: number): boolean;
  releasePointerCapture(pointerId: number): void;
  setAttribute(name: string, value: string): void;
  setPointerCapture(pointerId: number): void;
}

export interface WorkspaceLayoutElements {
  readonly authoringContextResizer: WorkspaceLayoutElement;
  readonly collapseSourceRail: WorkspaceLayoutElement;
  readonly expandSourceRail: WorkspaceLayoutElement;
  readonly sourceRailResizer: WorkspaceLayoutElement;
  readonly workspaceSurfaces: WorkspaceLayoutElement;
}

interface WorkspaceLayoutRoot extends WorkspaceLayoutElement {
  querySelector(selectors: string): Element | WorkspaceLayoutElement | null;
}

interface WorkspaceLayoutOwners {
  readonly contextResourcePresenter: Pick<ContextResourcePresenter, "activeTab">;
  readonly workspaceSurfaces: WorkspaceLayoutRoot;
}

export interface WorkspaceLayoutHooks {
  readonly paneStorageKey: () => string;
  readonly resizePdf: () => void;
}

export class WorkspaceLayoutManager {
  readonly #elements: WorkspaceLayoutElements;
  readonly #hooks: WorkspaceLayoutHooks;

  constructor(elements: WorkspaceLayoutElements, hooks: WorkspaceLayoutHooks) {
    this.#elements = elements;
    this.#hooks = hooks;
  }

  static forWorkspace(
    workspaceId: string,
    owners: WorkspaceLayoutOwners,
    pdfViewer: Pick<PdfEvidenceViewer, "resize">,
  ): WorkspaceLayoutManager {
    const workspaceSurfaces = owners.workspaceSurfaces;
    return new WorkspaceLayoutManager(
      {
        authoringContextResizer: requiredLayoutElement(workspaceSurfaces, "#authoring-context-resizer"),
        collapseSourceRail: requiredLayoutElement(workspaceSurfaces, "#collapse-source-rail"),
        expandSourceRail: requiredLayoutElement(workspaceSurfaces, "#expand-source-rail"),
        sourceRailResizer: requiredLayoutElement(workspaceSurfaces, "#source-rail-resizer"),
        workspaceSurfaces,
      },
      {
        paneStorageKey: () => `kirjolab:authoring-pane:${workspaceId}:${owners.contextResourcePresenter.activeTab?.kind ?? "preview"}`,
        resizePdf: () => void pdfViewer.resize(),
      },
    );
  }

  bind(): void {
    this.bindRailCollapse();
    this.bindRailResize();
    this.bindPaneResize();
  }

  setRailCollapsed(collapsed: boolean, persist = true): void {
    this.#elements.workspaceSurfaces.dataset.sourceRail = collapsed ? "collapsed" : "expanded";
    if (!persist) return;
    try {
      if (collapsed) localStorage.setItem(railCollapsedKey, "true");
      else localStorage.removeItem(railCollapsedKey);
    } catch {
      // Rail collapsing remains usable when browser storage is unavailable.
    }
  }

  restorePaneWidth(): void {
    const stored = this.readStorage(this.#hooks.paneStorageKey());
    const width = stored ? Number.parseInt(stored, 10) : Number.NaN;
    if (Number.isFinite(width)) this.setPaneWidth(width);
    else {
      this.#elements.workspaceSurfaces.style.removeProperty("--authoring-pane-width");
      this.#elements.authoringContextResizer.setAttribute("aria-valuenow", "48");
    }
  }

  private bindRailCollapse(): void {
    this.#elements.collapseSourceRail.addEventListener("click", () => {
      this.setRailCollapsed(true);
      this.#elements.expandSourceRail.focus();
    });
    this.#elements.expandSourceRail.addEventListener("click", () => {
      this.setRailCollapsed(false);
      this.#elements.collapseSourceRail.focus();
    });
    this.setRailCollapsed(this.readStorage(railCollapsedKey) === "true", false);
  }

  private bindRailResize(): void {
    const resizer = this.#elements.sourceRailResizer;
    const resize = (clientX: number, persist: boolean): void => {
      const rail = resizer.previousElementSibling;
      if (!isLayoutElement(rail)) return;
      const maximum = this.railMaximumWidth();
      const width = clientX - rail.getBoundingClientRect().left - resizer.getBoundingClientRect().width / 2;
      const bounded = Math.min(maximum, Math.max(minimumRailWidth, width));
      this.setRailWidth(bounded, maximum);
      if (persist) this.writeStorage(railWidthKey, bounded);
    };
    this.bindHorizontalDrag(resizer, resize);
    resizer.addEventListener("keydown", (event) => {
      const keyboard = event as KeyboardEvent;
      if (!isResizeKey(keyboard.key)) return;
      event.preventDefault();
      if (keyboard.key === "Home") this.resetRailWidth(true);
      else {
        const rail = resizer.previousElementSibling;
        if (!isLayoutElement(rail)) return;
        const direction = keyboard.key === "ArrowLeft" ? -16 : 16;
        resize(rail.getBoundingClientRect().right + resizer.getBoundingClientRect().width / 2 + direction, true);
      }
      this.#hooks.resizePdf();
    });
    window.addEventListener("resize", () => this.restoreRailWidth());
    this.restoreRailWidth();
  }

  private railMaximumWidth(): number {
    const workspaceWidth = this.#elements.workspaceSurfaces.getBoundingClientRect().width;
    const reservedWidth = this.#elements.workspaceSurfaces.dataset.layout === "editor" ? 424 : 880;
    return Math.min(maximumRailWidth, Math.max(minimumRailWidth, workspaceWidth - reservedWidth));
  }

  private setRailWidth(width: number, maximum = this.railMaximumWidth()): void {
    const bounded = Math.min(maximum, Math.max(minimumRailWidth, width));
    this.#elements.workspaceSurfaces.style.setProperty("--source-rail-width", `${Math.round(bounded)}px`);
    this.#elements.sourceRailResizer.setAttribute("aria-valuemax", String(Math.round(maximum)));
    this.#elements.sourceRailResizer.setAttribute("aria-valuenow", String(Math.round(bounded)));
  }

  private resetRailWidth(removeStored: boolean): void {
    this.#elements.workspaceSurfaces.style.removeProperty("--source-rail-width");
    if (removeStored) this.removeStorage(railWidthKey);
    const maximum = this.railMaximumWidth();
    this.#elements.sourceRailResizer.setAttribute("aria-valuenow", String(Math.min(defaultRailWidth, maximum)));
    this.#elements.sourceRailResizer.setAttribute("aria-valuemax", String(maximum));
  }

  private restoreRailWidth(): void {
    const stored = this.readStorage(railWidthKey);
    const width = stored ? Number.parseInt(stored, 10) : Number.NaN;
    if (Number.isFinite(width)) this.setRailWidth(width);
    else this.resetRailWidth(false);
  }

  private bindPaneResize(): void {
    const resizer = this.#elements.authoringContextResizer;
    const resize = (clientX: number, persist: boolean): void => {
      const authoring = resizer.previousElementSibling;
      const context = resizer.nextElementSibling;
      if (!isLayoutElement(authoring) || !isLayoutElement(context)) return;
      const authoringLeft = authoring.getBoundingClientRect().left;
      const available = context.getBoundingClientRect().right - authoringLeft - resizer.getBoundingClientRect().width;
      const maximum = Math.max(416, available - 448);
      const width = Math.min(maximum, Math.max(416, clientX - authoringLeft));
      this.setPaneWidth(width);
      if (persist) this.writeStorage(this.#hooks.paneStorageKey(), width);
    };
    this.bindHorizontalDrag(resizer, resize);
    resizer.addEventListener("keydown", (event) => {
      const keyboard = event as KeyboardEvent;
      if (!isResizeKey(keyboard.key)) return;
      event.preventDefault();
      if (keyboard.key === "Home") {
        this.#elements.workspaceSurfaces.style.removeProperty("--authoring-pane-width");
        this.removeStorage(this.#hooks.paneStorageKey());
        resizer.setAttribute("aria-valuenow", "48");
      } else {
        const authoring = resizer.previousElementSibling;
        if (!isLayoutElement(authoring)) return;
        resize(authoring.getBoundingClientRect().right + (keyboard.key === "ArrowLeft" ? -24 : 24), true);
      }
      this.#hooks.resizePdf();
    });
  }

  private setPaneWidth(width: number): void {
    this.#elements.workspaceSurfaces.style.setProperty("--authoring-pane-width", `${Math.round(width)}px`);
    const resizer = this.#elements.authoringContextResizer;
    const authoring = resizer.previousElementSibling;
    const context = resizer.nextElementSibling;
    if (!isLayoutElement(authoring) || !isLayoutElement(context)) return;
    const total = authoring.getBoundingClientRect().width + context.getBoundingClientRect().width;
    resizer.setAttribute("aria-valuenow", String(total > 0 ? Math.round((width / total) * 100) : 48));
  }

  private bindHorizontalDrag(resizer: WorkspaceLayoutElement, resize: (clientX: number, persist: boolean) => void): void {
    resizer.addEventListener("pointerdown", (event) => {
      const pointer = event as PointerEvent;
      resizer.dataset.dragging = "true";
      resizer.setPointerCapture(pointer.pointerId);
      resize(pointer.clientX, false);
    });
    resizer.addEventListener("pointermove", (event) => {
      const pointer = event as PointerEvent;
      if (resizer.dataset.dragging === "true") resize(pointer.clientX, false);
    });
    const finish = (event: PointerEvent, persist: boolean): void => {
      if (resizer.dataset.dragging !== "true") return;
      delete resizer.dataset.dragging;
      if (persist) resize(event.clientX, true);
      if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
      this.#hooks.resizePdf();
    };
    resizer.addEventListener("pointerup", (event) => finish(event as PointerEvent, true));
    resizer.addEventListener("pointercancel", (event) => finish(event as PointerEvent, false));
  }

  private readStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, width: number): void {
    try {
      localStorage.setItem(key, String(Math.round(width)));
    } catch {
      // Resizing remains usable when browser storage is unavailable.
    }
  }

  private removeStorage(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Resizing remains usable when browser storage is unavailable.
    }
  }
}

function isLayoutElement(value: Element | WorkspaceLayoutElement | null): value is WorkspaceLayoutElement {
  return value !== null && "getBoundingClientRect" in value;
}

function requiredLayoutElement(root: WorkspaceLayoutRoot, selector: string): WorkspaceLayoutElement {
  const element = root.querySelector(selector);
  if (!isLayoutElement(element)) throw new Error(`Required workspace layout control is missing: ${selector}`);
  return element;
}

function isResizeKey(key: string): key is "ArrowLeft" | "ArrowRight" | "Home" {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "Home";
}
