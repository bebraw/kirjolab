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

export interface WorkspaceRouteOwners {
  readonly contextResourcePresenter: {
    readonly activeContextTab: ResearchContextState["tabs"][number] | undefined;
    readonly activeKey: ResearchContextKey;
    readonly ensurePdfResource: () => Promise<void>;
    readonly restoreContext: (key: ResearchContextKey, page?: number, annotationId?: string) => Promise<void>;
  };
  readonly workspaceLayout: {
    readonly value: WorkspaceLayout;
    readonly bindChange: (changeLayout: (layout: WorkspaceLayout) => void | Promise<void>) => void;
    readonly navigate: (layout: string, persist?: boolean) => Promise<WorkspaceLayout>;
    readonly restore: () => Promise<WorkspaceLayout>;
  };
  readonly authoringModeTabs: {
    readonly mode: AuthoringMode;
    readonly bindNavigation: (navigate: (mode: AuthoringMode) => void) => void;
    readonly navigate: (mode: AuthoringMode) => void;
  };
  readonly workspaceRailTabs: {
    readonly mode: WorkspaceRail;
    readonly bindNavigation: (navigate: (rail: WorkspaceRail) => void) => void;
    readonly navigate: (rail: WorkspaceRail) => void;
  };
  readonly projectFileDialog: {
    readonly activeFileId: string | null;
    readonly project: { readonly entryFileId: string } | null;
    readonly selectFile: (fileId: string) => boolean;
  };
  readonly source: Pick<HTMLElement, "focus">;
}

export class WorkspaceSurfaceSwitcher extends LitElement {
  static override properties = { surface: { state: true } };

  declare private surface: WorkspaceSurface;
  private navigation: ((surface: WorkspaceSurface) => void) | null = null;
  private routeBinding: WorkspaceRouteOwners | null = null;
  private routeEnabled = false;
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

  bindWorkspaceRoute(enabled: boolean, binding: WorkspaceRouteOwners): void {
    this.routeEnabled = enabled;
    this.routeBinding = binding;
    this.bindNavigation(() => this.syncRoute("replace"));
    binding.authoringModeTabs.bindNavigation((mode) => {
      if (mode === "write") {
        this.navigate("authoring", false);
        binding.source.focus();
      }
      this.syncRoute("replace");
    });
    binding.workspaceLayout.bindChange(async (layout) => {
      if (layout === "pdf") await binding.contextResourcePresenter.ensurePdfResource();
      this.syncRoute("replace");
    });
    binding.workspaceRailTabs.bindNavigation(() => this.syncRoute("replace"));
    this.bindHistory();
  }

  async restoreRoute(url = new URL(location.href)): Promise<void> {
    const binding = this.routeBinding;
    if (!binding || !this.routeEnabled) return;
    this.routeReady = false;
    await binding.workspaceLayout.restore();
    const route = readWorkspaceUiRoute(url);
    if (url.searchParams.has("rail")) binding.workspaceRailTabs.navigate(route.rail);
    if (url.searchParams.has("mode")) binding.authoringModeTabs.navigate(route.mode);
    if (route.fileId) binding.projectFileDialog.selectFile(route.fileId);
    if (url.searchParams.has("context"))
      await binding.contextResourcePresenter.restoreContext(route.contextKey, route.page, route.annotationId);
    if (route.layout) await binding.workspaceLayout.navigate(route.layout, false);
    if (url.searchParams.has("surface")) this.navigate(route.surface);
    this.routeReady = true;
    this.syncRoute("replace");
  }

  syncRoute(mode: "push" | "replace"): void {
    const binding = this.routeBinding;
    if (!binding || !this.routeEnabled || !this.routeReady) return;
    const current = new URL(location.href);
    const next = workspaceUiRouteUrl(current, {
      ...workspaceUiRouteSelection(
        binding.projectFileDialog.activeFileId,
        binding.projectFileDialog.project?.entryFileId,
        binding.contextResourcePresenter.activeContextTab,
      ),
      rail: binding.workspaceRailTabs.mode,
      mode: binding.authoringModeTabs.mode,
      surface: this.surface,
      layout: binding.workspaceLayout.value,
      contextKey: binding.contextResourcePresenter.activeKey,
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
    if (this.routeEnabled && this.routeBinding && typeof window !== "undefined") window.addEventListener("popstate", this.handlePopState);
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
