import { escapeHtml } from "../html";
import { renderIcon } from "../ui/icons";

export type HomeAppMode = "workspace" | "library";
export type HomeRoute = { path: string; purpose: string };

const workspaceLayoutOptions = `<option value="split">Split</option><option value="editor">Editor only</option>
              <option value="context">Context only</option><option value="pdf">PDF only</option>`;

export function renderWorkspaceLayoutControl(appMode: HomeAppMode): string {
  return appMode === "library"
    ? `<select id="workspace-layout" hidden aria-hidden="true" tabindex="-1">${workspaceLayoutOptions}</select>`
    : `<label class="project-view-control hidden items-center gap-2 font-sans text-xs text-app-text-soft min-[72rem]:flex">View
            <select class="workspace-switcher" id="workspace-layout" aria-label="Project view">
              ${workspaceLayoutOptions}
            </select>
          </label>`;
}

export function renderContextTabs(): string {
  return `<div class="context-tabs" id="context-tabs">
          <div class="context-tab-list ui-tab-list" id="context-tab-list" role="tablist" aria-label="Research context">
            <button class="context-tab ui-tab" id="context-preview-tab" type="button" role="tab" aria-controls="context-preview-panel" aria-selected="true" tabindex="0">Preview</button>
            <button class="context-tab ui-tab" id="context-library-tab" type="button" role="tab" aria-controls="context-library-panel" aria-selected="false" tabindex="-1">Library</button>
            <button class="context-tab ui-tab" id="context-assistant-tab" type="button" role="tab" aria-controls="context-assistant-panel" aria-selected="false" tabindex="-1">Writing assistant</button>
            <div class="context-resource-tabs" id="context-resource-tabs" role="presentation"></div>
          </div>
          <details class="context-tab-overview action-menu ui-menu" id="context-tab-overview" data-action-menu hidden>
            <summary class="context-tab-overview-trigger" aria-label="Open context list" title="Open context list">Tabs <span class="count-badge" id="context-tab-overview-count">3</span></summary>
            <div class="editor-command-menu context-tab-overview-menu ui-menu-panel" id="context-tab-overview-list" aria-label="Open contexts"></div>
          </details>
          <div class="context-tab-controls" aria-label="Active context actions">
            <div class="context-mode-controls" id="preview-context-controls">
              <span class="preview-file-context" id="preview-file-context" title="main.md · composed paper">main.md · composed paper</span>
              <span id="diagnostic-summary">Validating…</span>
            </div>
            <div class="context-mode-controls" id="pdf-context-controls" hidden>
              <span class="context-status" id="paper-status">Loading PDF…</span>
              <button id="previous-paper-page" type="button" aria-label="Previous PDF page">←</button>
              <span class="context-page-indicator" id="paper-page-indicator">– / –</span>
              <button id="next-paper-page" type="button" aria-label="Next PDF page">→</button>
            </div>
          </div>
        </div>`;
}

export function renderPreviewSyncControls(): string {
  return `<div class="preview-sync-controls" id="preview-sync-controls" role="group" aria-label="Synchronize source and preview">
          <button id="sync-preview-from-source" type="button" aria-label="Reveal centered source passage in Preview" title="Source to Preview">
            ${renderIcon("arrowRight")}
          </button>
          <button id="sync-source-from-preview" type="button" aria-label="Reveal centered Preview passage in source" title="Preview to source">
            ${renderIcon("arrowLeft")}
          </button>
        </div>`;
}

export function renderRouteSummary(routes: HomeRoute[]): string {
  return routes.map((route) => `${escapeHtml(route.path)} ${escapeHtml(route.purpose)}`).join(" · ");
}
