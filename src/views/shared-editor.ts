import type { ProjectFile, WorkspaceSnapshot } from "../domain/workspace";
import { escapeHtml } from "./shared";

export type SharedEditorMode = "read-only" | "edit";
export type SharedEditorLayout = "split" | "pdf";

export interface SharedEditorSource {
  readonly id: string;
  readonly path: string;
  readonly content: string;
}

export interface SharedEditorPageOptions {
  readonly mode: SharedEditorMode;
  readonly path: string;
  readonly requestedFileId: string | null;
  readonly initialLayout?: SharedEditorLayout;
  readonly sourceOverride?: SharedEditorSource;
}

export function resolveSharedEditorFile(snapshot: WorkspaceSnapshot, requestedFileId: string | null): ProjectFile {
  return (
    snapshot.files.find((file) => file.id === requestedFileId) ??
    snapshot.files.find((file) => file.id === snapshot.entryFileId) ??
    snapshot.files[0]!
  );
}

export function renderSharedEditorPage(snapshot: WorkspaceSnapshot, options: SharedEditorPageOptions): string {
  const activeFile = resolveSharedEditorFile(snapshot, options.requestedFileId);
  const activeSource = options.sourceOverride ?? activeFile;
  const files = [...snapshot.files].sort((left, right) => left.path.localeCompare(right.path));
  const editable = options.mode === "edit";
  const initialLayout = options.initialLayout ?? "split";
  const ids = editable
    ? {
        source: "edit-source",
        highlight: "edit-source-highlight",
        sourceShell: "edit-source-shell",
        fileSwitcher: "edit-file-switcher",
        liveStatus: "edit-live-status",
        saveStatus: "edit-save-status",
        pdfViewer: "edit-pdf-viewer",
        collaboratorSelections: "edit-collaborator-selections",
      }
    : {
        source: "shared-source",
        highlight: "shared-source-highlight",
        sourceShell: "shared-source-shell",
        fileSwitcher: "shared-file-switcher",
        liveStatus: "shared-live-status",
        saveStatus: "shared-save-status",
        pdfViewer: "shared-pdf-viewer",
        collaboratorSelections: "shared-collaborator-selections",
      };
  const capabilityLabel = editable ? "Edit link" : "Read-only link";
  const capabilityDescription = editable ? "Anyone with this link can edit" : "Anyone with this link can view";
  const sourceAction = editable ? "Editing" : "Viewing";
  const sourceDescription = editable
    ? "Anyone with this link can edit. Changes save directly to the live project."
    : "Anyone with this link can view. Source is read-only, so selecting and copying text cannot change the project.";
  const pdfPath = `${options.path}/document.pdf`;
  const fileOptions = [
    options.sourceOverride ? `<option value="" selected>${escapeHtml(options.sourceOverride.path)}</option>` : "",
    ...files.map(
      (file) =>
        `<option value="${escapeHtml(file.id)}"${!options.sourceOverride && file.id === activeFile.id ? " selected" : ""}>${escapeHtml(file.path)}</option>`,
    ),
  ].join("");
  const fileLinks = files
    .map(
      (file) =>
        `<a class="project-file-row" data-active="${String(file.id === activeSource.id)}" href="?file=${encodeURIComponent(file.id)}"${file.id === activeSource.id ? ' aria-current="page"' : ""}><span class="min-w-0 truncate">${escapeHtml(file.path)}</span>${file.id === activeSource.id ? `<span class="project-file-kind">${sourceAction}</span>` : ""}</a>`,
    )
    .join("");
  const dataAttributes = [
    `data-shared-editor-mode="${options.mode}"`,
    `data-shared-revision="${snapshot.revision}"`,
    `data-shared-file-id="${escapeHtml(activeSource.id)}"`,
    `data-shared-socket-path="${escapeHtml(`${options.path}/socket`)}"`,
    editable ? `data-shared-save-path="${escapeHtml(`${options.path}/files/${activeFile.id}`)}"` : "",
    editable ? `data-shared-snapshot-path="${escapeHtml(`${options.path}/snapshot`)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escapeHtml(snapshot.title)} · ${capabilityLabel} · Kirjolab</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
    <script type="module" src="/shared-editor.js"></script>
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased" data-app-mode="shared-editor" ${dataAttributes}>
    <header class="shared-editor-header sticky top-0 z-30 border-b border-app-line bg-app-canvas/95 backdrop-blur">
      <div class="app-header-row">
        <div class="app-header-primary min-w-0">
          <span class="app-brand shrink-0 font-sans text-sm font-black tracking-[-0.04em] text-app-ink">KIRJOLAB</span>
          <span class="shared-editor-project-title truncate" title="${escapeHtml(snapshot.title)}">${escapeHtml(snapshot.title)}</span>
        </div>
        <div class="app-header-secondary">
          <span class="shared-editor-connection" id="${ids.liveStatus}" role="status">Connecting…</span>
          <span class="count-badge shared-editor-capability" title="${capabilityDescription}" aria-label="${capabilityDescription}">${capabilityLabel}</span>
          <label class="project-view-control hidden items-center gap-2 font-sans text-xs text-app-text-soft min-[72rem]:flex">View
            <select class="workspace-switcher" id="shared-editor-layout" aria-label="Shared project view">
              <option value="split"${initialLayout === "split" ? " selected" : ""}>Split</option>
              <option value="editor">Editor only</option>
              <option value="pdf"${initialLayout === "pdf" ? " selected" : ""}>PDF only</option>
            </select>
          </label>
        </div>
      </div>
    </header>

    <nav class="surface-switcher" aria-label="Shared project surface">
      <button class="surface-switch" id="show-shared-source" type="button" aria-pressed="true">Source</button>
      <button class="surface-switch" id="show-shared-pdf" type="button" aria-pressed="false">PDF</button>
    </nav>

    <main class="workspace-grid shared-editor-grid" id="shared-editor-surfaces" data-active-surface="authoring" data-layout="${initialLayout}">
      <aside class="source-rail min-w-0 border-b border-app-line bg-app-paper min-[72rem]:border-r min-[72rem]:border-b-0" aria-label="Project files">
        <div class="shared-editor-rail-heading">
          <div class="min-w-0">
            <p class="eyebrow">Shared project</p>
            <h1 class="mt-1 truncate text-xl font-semibold tracking-[-0.035em] text-app-ink">${escapeHtml(snapshot.title)}</h1>
          </div>
          <span class="count-badge">${files.length}</span>
        </div>
        <form class="flex gap-2 border-b border-app-line p-3 min-[72rem]:hidden" method="get">
          <label class="sr-only" for="${ids.fileSwitcher}">Project file</label>
          <select class="workspace-switcher min-w-0 flex-1" id="${ids.fileSwitcher}" name="file">${fileOptions}</select>
          <button class="button-secondary shrink-0" type="submit">Open</button>
        </form>
        <nav class="shared-editor-file-list hidden min-[72rem]:grid" aria-label="Shared project files">${fileLinks}</nav>
        <p class="shared-editor-scope-note">${sourceDescription} Private research, members, history, and project administration stay unavailable.</p>
      </aside>

      <section class="editor-column min-w-0 border-b border-app-line bg-app-surface min-[72rem]:border-r min-[72rem]:border-b-0" id="shared-authoring-surface" aria-label="Markdown source">
        <div class="editor-toolbar ui-toolbar">
          <div class="editor-toolbar-group min-w-0">
            <span class="editor-target-status" title="${escapeHtml(activeSource.path)}">${escapeHtml(activeSource.path)}</span>
          </div>
          <div class="editor-toolbar-group">
            <span class="shared-editor-mode-label">${sourceAction}</span>
            <span class="text-xs text-app-text-soft" id="${ids.saveStatus}" role="status">${editable ? `Saved · revision ${snapshot.revision}` : `Read only · revision ${snapshot.revision}`}</span>
          </div>
        </div>
        <label class="sr-only" for="${ids.source}">${escapeHtml(activeSource.path)} Markdown source</label>
        <div class="source-editor-shell" id="${ids.sourceShell}">
          <pre class="source-editor-highlight" id="${ids.highlight}" data-shared-highlight aria-hidden="true"></pre>
          <textarea class="source-editor" id="${ids.source}" data-shared-source maxlength="2000000" spellcheck="true" aria-describedby="shared-editor-help ${ids.collaboratorSelections}"${editable ? "" : " readonly"}>${escapeHtml(activeSource.content)}</textarea>
        </div>
        <div class="sr-only" id="${ids.collaboratorSelections}" data-shared-collaborator-selections aria-live="polite"></div>
        <p class="sr-only" id="shared-editor-help">${editable ? "Markdown changes save to this shared project." : "This Markdown source is read-only."}</p>
      </section>

      <section class="context-column preview-column min-w-0 bg-app-paper" id="shared-context-surface" aria-label="Rendered PDF">
        <div class="context-tabs">
          <div class="context-tab-list" role="tablist" aria-label="Shared project output">
            <span class="context-tab" role="tab" aria-selected="true">PDF preview</span>
          </div>
          <div class="context-tab-controls">
            <a class="shared-editor-open-pdf" href="${escapeHtml(pdfPath)}" target="_blank" rel="noreferrer">Open PDF</a>
          </div>
        </div>
        <section class="context-panel context-preview-panel" aria-label="Rendered PDF preview">
          <div class="shared-editor-pdf-shell">
            <iframe class="shared-editor-pdf-frame" id="${ids.pdfViewer}" data-shared-pdf-viewer src="${escapeHtml(pdfPath)}" title="Rendered PDF for ${escapeHtml(snapshot.title)}">
              <p class="p-5 font-sans text-sm">Your browser cannot display this PDF. <a class="text-app-accent-strong underline" href="${escapeHtml(pdfPath)}">Open the rendered PDF</a>.</p>
            </iframe>
          </div>
        </section>
      </section>
    </main>
  </body>
</html>`;
}
