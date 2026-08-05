import { escapeHtml } from "../html";
import { renderIcon } from "../ui/icons";
import { renderPdfPageIndicator } from "./home-pdf-components";

export type HomeAppMode = "workspace" | "library";
export type HomeRoute = { path: string; purpose: string };

const workspaceLayoutOptions = `<option value="split">Split</option><option value="editor">Editor + navigation</option>
              <option value="context">Context only</option><option value="pdf">PDF only</option>`;

export function renderWorkspaceLayoutControl(appMode: HomeAppMode): string {
  return appMode === "library"
    ? `<workspace-layout-control id="workspace-layout-control" mode="library"><select id="workspace-layout" hidden aria-hidden="true" tabindex="-1">${workspaceLayoutOptions}</select></workspace-layout-control>`
    : `<workspace-layout-control id="workspace-layout-control" mode="workspace"><label class="project-view-control hidden items-center gap-2 font-sans text-xs text-app-text-soft min-[70rem]:flex"><span>View</span>
            <select class="workspace-switcher" id="workspace-layout" aria-label="Project view">
              ${workspaceLayoutOptions}
            </select>
          </label></workspace-layout-control>`;
}

export function renderContextTabs(): string {
  return `<div class="context-tabs" id="context-tabs">
          <context-tab-strip id="context-tab-strip">
          <div class="context-tab-list ui-tab-list" id="context-tab-list" role="tablist" aria-label="Research context">
            <button class="context-tab ui-tab" id="context-preview-tab" type="button" role="tab" aria-controls="context-preview-panel" aria-selected="true" tabindex="0">Preview</button>
            <button class="context-tab ui-tab" id="context-library-tab" type="button" role="tab" aria-controls="context-library-panel" aria-selected="false" tabindex="-1">Library</button>
            <button class="context-tab ui-tab" id="context-assistant-tab" type="button" role="tab" aria-controls="context-assistant-panel" aria-selected="false" tabindex="-1">Writing assistant</button>
            <context-resource-tabs-panel id="context-resource-tabs-panel">
              <div class="context-resource-tabs" id="context-resource-tabs" role="presentation"></div>
            </context-resource-tabs-panel>
          </div>
          <context-tab-overview-panel id="context-tab-overview-panel">
            <details class="context-tab-overview action-menu ui-menu" id="context-tab-overview" data-action-menu hidden>
              <summary class="context-tab-overview-trigger" aria-label="Open context list" title="Open context list">Tabs <span class="count-badge" id="context-tab-overview-count">3</span></summary>
              <div class="editor-command-menu context-tab-overview-menu ui-menu-panel" id="context-tab-overview-list" aria-label="Open contexts"></div>
            </details>
          </context-tab-overview-panel>
          </context-tab-strip>
          <div class="context-tab-controls" aria-label="Active context actions">
            <preview-context-status class="context-mode-controls" id="preview-context-controls">
              <span class="preview-file-context" id="preview-file-context" title="main.md · composed paper">main.md · composed paper</span>
              <span id="diagnostic-summary">Validating…</span>
            </preview-context-status>
            <div class="context-mode-controls" id="pdf-context-controls" hidden>
              <button id="previous-paper-page" type="button" aria-label="Previous PDF page">←</button>
              ${renderPdfPageIndicator("paper-page-indicator")}
              <button id="next-paper-page" type="button" aria-label="Next PDF page">→</button>
              <button id="toggle-paper-continuous" type="button" aria-pressed="false" title="Use continuous scrolling">
                ${renderIcon("continuousPages")}<span class="sr-only" data-pdf-display-label>Continuous scroll</span>
              </button>
              <button id="open-paper-search" type="button" aria-label="Search this PDF" title="Search this PDF">
                ${renderIcon("search")}<span class="sr-only">Search PDF</span>
              </button>
              <button id="open-paper-navigation" type="button" aria-label="Open PDF contents and thumbnails" title="Contents and thumbnails">
                ${renderIcon("pages")}<span class="sr-only">PDF navigation</span>
              </button>
              <button id="pdf-zoom-out" type="button" aria-label="Zoom PDF out" title="Zoom out">${renderIcon("zoomOut")}</button>
              <button id="pdf-fit-mode" type="button" aria-label="Change PDF fit mode" title="Fit width">${renderIcon("fit")}<span class="sr-only" data-pdf-fit-label>Fit width</span></button>
              <button id="pdf-zoom-in" type="button" aria-label="Zoom PDF in" title="Zoom in">${renderIcon("zoomIn")}</button>
              <button id="pdf-rotate" type="button" aria-label="Rotate PDF clockwise" title="Rotate clockwise">${renderIcon("rotate")}</button>
              <button id="pdf-spread" type="button" aria-pressed="false" aria-label="Use two-page PDF view" title="Two-page view">${renderIcon("spread")}</button>
            </div>
            <button class="preview-navigation-toggle" id="toggle-preview-navigation" type="button" aria-controls="app-header" aria-pressed="false" aria-label="Hide top navigation" title="Hide top navigation">
              ${renderIcon("chevronUp")}
              <span id="preview-navigation-toggle-label">Hide nav</span>
            </button>
          </div>
        </div>`;
}

export function renderPreviewSyncControls(): string {
  return `<preview-sync-controls class="preview-sync-controls" id="preview-sync-controls" role="group" aria-label="Synchronize source and preview">
          <button id="sync-preview-from-source" type="button" aria-label="Reveal centered source passage in Preview" title="Source to Preview">
            ${renderIcon("arrowRight")}
          </button>
          <button id="toggle-preview-scroll-sync" type="button" aria-label="Source and Preview scroll lock" aria-pressed="false" title="Lock scrolling">
            ${renderIcon("unlock")}
          </button>
          <button id="sync-source-from-preview" type="button" aria-label="Reveal centered Preview passage in source" title="Preview to source">
            ${renderIcon("arrowLeft")}
          </button>
        </preview-sync-controls>`;
}

export function renderRouteSummary(routes: HomeRoute[]): string {
  return routes.map((route) => `${escapeHtml(route.path)} ${escapeHtml(route.purpose)}`).join(" · ");
}
