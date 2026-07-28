import { html, type TemplateResult } from "lit";
import type { ContextResourcePresenter } from "./context-resource-presenter";
import { LightDomElement } from "./light-dom-controller";
import type { WorkspaceLayout } from "./workspace-ui-route";

type WorkspaceLayoutMode = "library" | "workspace";
type WorkspaceLayoutChange = (layout: WorkspaceLayout) => void | Promise<void>;

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
  readonly contextResourcePresenter: Pick<ContextResourcePresenter, "activeTab" | "layoutPdfViewer">;
  readonly workspaceSurfaces: WorkspaceLayoutRoot;
}

export class WorkspaceLayoutControl extends LightDomElement {
  static override properties = {
    layout: { state: true },
    mode: { type: String },
  };

  declare private layout: WorkspaceLayout;
  declare private mode: WorkspaceLayoutMode;
  private workspaceId = "";
  private elements: WorkspaceLayoutElements | null = null;
  private contextResourcePresenter: WorkspaceLayoutOwners["contextResourcePresenter"] | null = null;
  private resizePdf: () => void = () => undefined;
  private changeLayout: WorkspaceLayoutChange | null = null;

  constructor() {
    super();
    this.layout = "split";
    this.mode = "workspace";
  }

  get value(): WorkspaceLayout {
    return this.layout;
  }

  bindWorkspace(workspaceId: string, owners: WorkspaceLayoutOwners): void {
    const workspace = owners.workspaceSurfaces;
    this.workspaceId = workspaceId;
    this.contextResourcePresenter = owners.contextResourcePresenter;
    this.resizePdf = () => void owners.contextResourcePresenter.layoutPdfViewer?.resize();
    this.elements = {
      authoringContextResizer: requiredLayoutElement(workspace, "#authoring-context-resizer"),
      collapseSourceRail: requiredLayoutElement(workspace, "#collapse-source-rail"),
      expandSourceRail: requiredLayoutElement(workspace, "#expand-source-rail"),
      sourceRailResizer: requiredLayoutElement(workspace, "#source-rail-resizer"),
      workspaceSurfaces: workspace,
    };
    this.bindRailCollapse();
    this.bindRailResize();
    this.bindPaneResize();
  }

  bindChange(changeLayout: WorkspaceLayoutChange): void {
    this.changeLayout = changeLayout;
  }

  restore(): Promise<WorkspaceLayout> {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(this.storageKey);
    } catch {
      // Layout selection remains usable when browser storage is unavailable.
    }
    return this.navigate(stored ?? "split", false);
  }

  async navigate(value: string, persist = true): Promise<WorkspaceLayout> {
    const layout = normalizeWorkspaceLayout(value);
    this.layout = layout;
    if (persist) {
      try {
        localStorage.setItem(this.storageKey, layout);
      } catch {
        // Layout selection remains usable when browser storage is unavailable.
      }
    }
    if (this.elements) this.elements.workspaceSurfaces.dataset.layout = layout;
    if (typeof window !== "undefined") window.dispatchEvent(new Event("resize"));
    await this.changeLayout?.(layout);
    return layout;
  }

  setRailCollapsed(collapsed: boolean, persist = true): void {
    this.boundElements.workspaceSurfaces.dataset.sourceRail = collapsed ? "collapsed" : "expanded";
    if (!persist) return;
    try {
      if (collapsed) localStorage.setItem(railCollapsedKey, "true");
      else localStorage.removeItem(railCollapsedKey);
    } catch {
      // Rail collapsing remains usable when browser storage is unavailable.
    }
  }

  restorePaneWidth(): void {
    const stored = this.readStorage(this.paneStorageKey);
    const width = stored ? Number.parseInt(stored, 10) : Number.NaN;
    if (Number.isFinite(width)) this.setPaneWidth(width);
    else {
      this.boundElements.workspaceSurfaces.style.removeProperty("--authoring-pane-width");
      this.boundElements.authoringContextResizer.setAttribute("aria-valuenow", "48");
    }
  }

  private bindRailCollapse(): void {
    const elements = this.boundElements;
    elements.collapseSourceRail.addEventListener("click", () => {
      this.setRailCollapsed(true);
      elements.expandSourceRail.focus();
    });
    elements.expandSourceRail.addEventListener("click", () => {
      this.setRailCollapsed(false);
      elements.collapseSourceRail.focus();
    });
    this.setRailCollapsed(this.readStorage(railCollapsedKey) === "true", false);
  }

  private bindRailResize(): void {
    const elements = this.boundElements;
    const resizer = elements.sourceRailResizer;
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
      this.resizePdf();
    });
    window.addEventListener("resize", () => this.restoreRailWidth());
    this.restoreRailWidth();
  }

  private railMaximumWidth(): number {
    const workspace = this.boundElements.workspaceSurfaces;
    const reservedWidth = workspace.dataset.layout === "editor" ? 424 : 880;
    return Math.min(maximumRailWidth, Math.max(minimumRailWidth, workspace.getBoundingClientRect().width - reservedWidth));
  }

  private setRailWidth(width: number, maximum = this.railMaximumWidth()): void {
    const elements = this.boundElements;
    const bounded = Math.min(maximum, Math.max(minimumRailWidth, width));
    elements.workspaceSurfaces.style.setProperty("--source-rail-width", `${Math.round(bounded)}px`);
    elements.sourceRailResizer.setAttribute("aria-valuemax", String(Math.round(maximum)));
    elements.sourceRailResizer.setAttribute("aria-valuenow", String(Math.round(bounded)));
  }

  private resetRailWidth(removeStored: boolean): void {
    const elements = this.boundElements;
    elements.workspaceSurfaces.style.removeProperty("--source-rail-width");
    if (removeStored) this.removeStorage(railWidthKey);
    const maximum = this.railMaximumWidth();
    elements.sourceRailResizer.setAttribute("aria-valuenow", String(Math.min(defaultRailWidth, maximum)));
    elements.sourceRailResizer.setAttribute("aria-valuemax", String(maximum));
  }

  private restoreRailWidth(): void {
    const stored = this.readStorage(railWidthKey);
    const width = stored ? Number.parseInt(stored, 10) : Number.NaN;
    if (Number.isFinite(width)) this.setRailWidth(width);
    else this.resetRailWidth(false);
  }

  private bindPaneResize(): void {
    const elements = this.boundElements;
    const resizer = elements.authoringContextResizer;
    const resize = (clientX: number, persist: boolean): void => {
      const authoring = resizer.previousElementSibling;
      const context = resizer.nextElementSibling;
      if (!isLayoutElement(authoring) || !isLayoutElement(context)) return;
      const authoringLeft = authoring.getBoundingClientRect().left;
      const available = context.getBoundingClientRect().right - authoringLeft - resizer.getBoundingClientRect().width;
      const maximum = Math.max(416, available - 448);
      const width = Math.min(maximum, Math.max(416, clientX - authoringLeft));
      this.setPaneWidth(width);
      if (persist) this.writeStorage(this.paneStorageKey, width);
    };
    this.bindHorizontalDrag(resizer, resize);
    resizer.addEventListener("keydown", (event) => {
      const keyboard = event as KeyboardEvent;
      if (!isResizeKey(keyboard.key)) return;
      event.preventDefault();
      if (keyboard.key === "Home") {
        elements.workspaceSurfaces.style.removeProperty("--authoring-pane-width");
        this.removeStorage(this.paneStorageKey);
        resizer.setAttribute("aria-valuenow", "48");
      } else {
        const authoring = resizer.previousElementSibling;
        if (!isLayoutElement(authoring)) return;
        resize(authoring.getBoundingClientRect().right + (keyboard.key === "ArrowLeft" ? -24 : 24), true);
      }
      this.resizePdf();
    });
  }

  private setPaneWidth(width: number): void {
    const elements = this.boundElements;
    elements.workspaceSurfaces.style.setProperty("--authoring-pane-width", `${Math.round(width)}px`);
    const resizer = elements.authoringContextResizer;
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
      this.resizePdf();
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

  protected override render(): TemplateResult {
    const select = html`<select
      class=${this.mode === "workspace" ? "workspace-switcher" : ""}
      id="workspace-layout"
      aria-label=${this.mode === "workspace" ? "Project view" : ""}
      aria-hidden=${this.mode === "library" ? "true" : "false"}
      tabindex=${this.mode === "library" ? "-1" : "0"}
      ?hidden=${this.mode === "library"}
      .value=${this.layout}
      @change=${this.change}
    >
      <option value="split">Split</option>
      <option value="editor">Editor only</option>
      <option value="context">Context only</option>
      <option value="pdf">PDF only</option>
    </select>`;
    return this.mode === "library"
      ? select
      : html`<label class="project-view-control hidden items-center gap-2 font-sans text-xs text-app-text-soft min-[72rem]:flex"
          >View ${select}</label
        >`;
  }

  protected change(event: Event): void {
    void this.navigate((event.currentTarget as HTMLSelectElement).value);
  }

  private get storageKey(): string {
    return `kirjolab:layout:${this.workspaceId}`;
  }

  private get paneStorageKey(): string {
    return `kirjolab:authoring-pane:${this.workspaceId}:${this.contextResourcePresenter?.activeTab?.kind ?? "preview"}`;
  }

  private get boundElements(): WorkspaceLayoutElements {
    if (!this.elements) throw new Error("Workspace layout is not bound");
    return this.elements;
  }
}

function normalizeWorkspaceLayout(value: string): WorkspaceLayout {
  if (value === "editor" || value === "context" || value === "pdf") return value;
  return "split";
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

if (typeof customElements !== "undefined" && !customElements.get("workspace-layout-control")) {
  customElements.define("workspace-layout-control", WorkspaceLayoutControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-layout-control": WorkspaceLayoutControl;
  }
}
