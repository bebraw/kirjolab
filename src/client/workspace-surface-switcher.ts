import { html, LitElement, type TemplateResult } from "lit";
import type { ResearchContextKey, ResearchContextState } from "./research-context";
import {
  readWorkspaceUiRoute,
  workspaceUiRouteSelection,
  workspaceUiRouteUrl,
  type AuthoringMode,
  type WorkspaceLayout,
  type WorkspaceRail,
  type WorkspaceSurface,
} from "./workspace-ui-route";

export interface WorkspaceRouteBinding {
  readonly activeFileId: () => string | null;
  readonly activeTab: () => ResearchContextState["tabs"][number] | undefined;
  readonly contextKey: () => ResearchContextKey;
  readonly enabled: boolean;
  readonly ensurePdfResource: () => Promise<void>;
  readonly entryFileId: () => string | undefined;
  readonly focusAuthoring: () => void;
  readonly layout: {
    readonly value: WorkspaceLayout;
    readonly bindChange: (changeLayout: (layout: WorkspaceLayout) => void | Promise<void>) => void;
    readonly navigate: (layout: string, persist?: boolean) => Promise<WorkspaceLayout>;
  };
  readonly mode: {
    readonly mode: AuthoringMode;
    readonly bindNavigation: (navigate: (mode: AuthoringMode) => void) => void;
    readonly navigate: (mode: AuthoringMode) => void;
  };
  readonly rail: {
    readonly mode: WorkspaceRail;
    readonly bindNavigation: (navigate: (rail: WorkspaceRail) => void) => void;
    readonly navigate: (rail: WorkspaceRail) => void;
  };
  readonly restoreContext: (key: ResearchContextKey, page?: number, annotationId?: string) => Promise<void>;
  readonly selectFile: (fileId: string) => void;
}

export class WorkspaceSurfaceSwitcher extends LitElement {
  static override properties = { surface: { state: true } };

  declare private surface: WorkspaceSurface;
  private navigation: ((surface: WorkspaceSurface) => void) | null = null;
  private routeBinding: WorkspaceRouteBinding | null = null;
  private routeReady = false;

  constructor() {
    super();
    this.surface = "authoring";
  }

  navigate(surface: WorkspaceSurface, notify = true): void {
    this.surface = surface;
    if (this.parentElement) this.parentElement.dataset.activeSurface = surface;
    if (notify) this.navigation?.(surface);
  }

  bindNavigation(navigate: (surface: WorkspaceSurface) => void): void {
    this.navigation = navigate;
  }

  bindWorkspaceRoute(binding: WorkspaceRouteBinding): void {
    this.routeBinding = binding;
    this.bindNavigation(() => this.syncRoute("replace"));
    binding.mode.bindNavigation((mode) => {
      if (mode === "write") {
        this.navigate("authoring", false);
        binding.focusAuthoring();
      }
      this.syncRoute("replace");
    });
    binding.layout.bindChange(async (layout) => {
      if (layout === "pdf") await binding.ensurePdfResource();
      this.syncRoute("replace");
    });
    binding.rail.bindNavigation(() => this.syncRoute("replace"));
    this.bindHistory();
  }

  async restoreRoute(url = new URL(location.href)): Promise<void> {
    const binding = this.routeBinding;
    if (!binding?.enabled) return;
    this.routeReady = false;
    const route = readWorkspaceUiRoute(url);
    if (url.searchParams.has("rail")) binding.rail.navigate(route.rail);
    if (url.searchParams.has("mode")) binding.mode.navigate(route.mode);
    if (route.fileId) binding.selectFile(route.fileId);
    if (url.searchParams.has("context")) await binding.restoreContext(route.contextKey, route.page, route.annotationId);
    if (route.layout) await binding.layout.navigate(route.layout, false);
    if (url.searchParams.has("surface")) this.navigate(route.surface);
    this.routeReady = true;
    this.syncRoute("replace");
  }

  syncRoute(mode: "push" | "replace"): void {
    const binding = this.routeBinding;
    if (!binding?.enabled || !this.routeReady) return;
    const current = new URL(location.href);
    const next = workspaceUiRouteUrl(current, {
      ...workspaceUiRouteSelection(binding.activeFileId(), binding.entryFileId(), binding.activeTab()),
      rail: binding.rail.mode,
      mode: binding.mode.mode,
      surface: this.surface,
      layout: binding.layout.value,
      contextKey: binding.contextKey(),
    });
    const currentRelative = `${current.pathname}${current.search}${current.hash}`;
    if (next === currentRelative) return;
    if (mode === "push") history.pushState({ view: "workspace" }, "", next);
    else history.replaceState(history.state, "", next);
  }

  protected select(event: Event): void {
    const surface = (event.currentTarget as HTMLButtonElement).dataset.surface as WorkspaceSurface | undefined;
    if (!surface || surface === this.surface) return;
    this.navigate(surface);
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
    this.bindHistory();
  }

  override disconnectedCallback(): void {
    this.unbindHistory();
    super.disconnectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <button
        class="surface-switch"
        id="show-authoring-surface"
        type="button"
        aria-controls="authoring-surface"
        aria-pressed=${String(this.surface === "authoring")}
        data-surface="authoring"
        @click=${this.select}
      >
        Authoring
      </button>
      <button
        class="surface-switch"
        id="show-context-surface"
        type="button"
        aria-controls="context-surface"
        aria-pressed=${String(this.surface === "context")}
        data-surface="context"
        @click=${this.select}
      >
        Context
      </button>
    `;
  }

  private bindHistory(): void {
    this.unbindHistory();
    if (this.routeBinding?.enabled && typeof window !== "undefined") window.addEventListener("popstate", this.handlePopState);
  }

  private unbindHistory(): void {
    if (typeof window !== "undefined") window.removeEventListener("popstate", this.handlePopState);
  }

  private readonly handlePopState = (): void => void this.restoreRoute();
}

if (typeof customElements !== "undefined" && !customElements.get("workspace-surface-switcher")) {
  customElements.define("workspace-surface-switcher", WorkspaceSurfaceSwitcher);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-surface-switcher": WorkspaceSurfaceSwitcher;
  }
}
