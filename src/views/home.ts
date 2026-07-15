import { escapeHtml } from "./shared";

export function renderHomePage(
  routes: Array<{ path: string; purpose: string }>,
  workspaceId = "demo",
  identityEmail = "local@kirjolab.invalid",
  identityMode: "local" | "access" = "local",
  appMode: "workspace" | "library" = "workspace",
): string {
  const escapedWorkspaceId = escapeHtml(workspaceId);
  const escapedIdentityEmail = escapeHtml(identityEmail);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Kirjolab · Evidence becomes prose</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
    <script type="module" src="/app.js"></script>
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased" data-app-mode="${appMode}" data-workspace-id="${escapedWorkspaceId}" data-identity-email="${escapedIdentityEmail}">
    <header class="sticky top-0 z-30 border-b border-app-line bg-app-canvas/95 backdrop-blur">
      <div class="flex min-h-16 items-center justify-between gap-4 px-4 lg:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <a class="font-sans text-sm font-black tracking-[-0.04em] text-app-ink" href="/">KIRJOLAB</a>
          <span class="hidden h-4 w-px bg-app-line sm:block"></span>
          <a class="header-library-link" href="/library"${appMode === "library" ? ' aria-current="page"' : ""}>Library</a>
          <label class="sr-only" for="workspace-switcher">Current project</label>
          <select class="workspace-switcher" id="workspace-switcher"><option value="${escapedWorkspaceId}">Loading project…</option></select>
          <details class="action-menu header-action-menu" data-action-menu>
            <summary class="button-secondary shrink-0">Project</summary>
            <div class="editor-command-menu" aria-label="Project actions">
              <button id="manage-workspaces" type="button"><strong>Open projects</strong></button>
              <button id="workspace-settings" type="button"><strong>Project settings</strong></button>
              <button id="new-workspace" type="button"><strong>New project</strong></button>
            </div>
          </details>
        </div>
        <div class="flex items-center gap-3">
          <label class="sr-only" for="theme-preference">Appearance</label>
          <select class="workspace-switcher" id="theme-preference" aria-label="Appearance">
            <option value="system">Theme: System</option><option value="light">Theme: Light</option><option value="dark">Theme: Dark</option>
          </select>
          <label class="project-view-control hidden items-center gap-2 font-sans text-xs text-app-text-soft min-[72rem]:flex">View
            <select class="workspace-switcher" id="workspace-layout" aria-label="Project view">
              <option value="split">Split</option><option value="editor">Editor only</option>
              <option value="context">Context only</option><option value="pdf">PDF only</option>
            </select>
          </label>
          <details class="action-menu" id="account-menu" data-action-menu>
            <summary class="button-secondary shrink-0" aria-label="Account for ${escapedIdentityEmail}">Account</summary>
            <div class="editor-command-menu account-menu" aria-label="Account actions">
              <div class="account-menu-identity"><strong title="${escapedIdentityEmail}">${escapedIdentityEmail}</strong><span>${identityMode === "access" ? "Cloudflare Access" : "Local development"}</span></div>
              ${
                identityMode === "access"
                  ? '<a id="log-out" href="/cdn-cgi/access/logout"><strong>Log out</strong><span>All Access apps</span></a>'
                  : '<p class="account-menu-note">Local mode has no login session.</p>'
              }
            </div>
          </details>
          <div class="flex items-center gap-2 text-xs text-app-text-soft" aria-live="polite">
            <span class="h-2 w-2 rounded-full bg-app-warn" id="connection-dot"></span>
            <span id="connection-status">Connecting</span>
          </div>
          <button class="button-secondary hidden sm:inline-flex" id="share-workspace" type="button">Share</button>
          <button class="button-primary" id="open-export" type="button">Export</button>
        </div>
      </div>
      <div class="sr-only" id="collaborator-selections" aria-live="polite"></div>
    </header>

    <main class="workspace-grid min-h-[calc(100vh-4rem-1px)]" id="workspace-surfaces" data-active-surface="authoring" data-layout="split">
      <nav class="surface-switcher" aria-label="Project surface">
        <button class="surface-switch" id="show-authoring-surface" type="button" aria-controls="authoring-surface" aria-pressed="true">Authoring</button>
        <button class="surface-switch" id="show-context-surface" type="button" aria-controls="context-surface" aria-pressed="false">Context</button>
      </nav>
      <aside class="source-rail border-b border-app-line bg-app-paper min-[72rem]:border-r min-[72rem]:border-b-0">
        <div class="rail-mode-switcher" role="tablist" aria-label="Project navigation">
          <button class="rail-mode" id="show-files-rail" type="button" role="tab" aria-label="Files" aria-controls="files-rail-panel" aria-selected="true" title="Files">
            <svg class="rail-mode-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.75h6l2 2h9v9.5h-17z"></path></svg>
          </button>
          <button class="rail-mode" id="show-research-rail" type="button" role="tab" aria-label="Research" aria-controls="research-rail-panel" aria-selected="false" title="Research">
            <svg class="rail-mode-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h5.25A2.75 2.75 0 0 1 13 8.25v10.25a3.25 3.25 0 0 0-3.25-3.25H5z"></path><path d="M19 5.5h-3.25A2.75 2.75 0 0 0 13 8.25v10.25a3.25 3.25 0 0 1 3.25-3.25H19z"></path></svg>
          </button>
          <button class="rail-mode" id="show-comments-rail" type="button" role="tab" aria-label="Comments" aria-describedby="manuscript-comment-count" aria-controls="comments-rail-panel" aria-selected="false" title="Comments">
            <svg class="rail-mode-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.25h16v11.5H9l-5 3z"></path></svg>
            <span class="count-badge rail-mode-count" id="manuscript-comment-count">0</span>
          </button>
        </div>

        <section class="rail-panel px-4 py-5 lg:px-5" id="files-rail-panel" role="tabpanel" aria-labelledby="show-files-rail">
          <div class="grid gap-3">
            <h1 class="text-xl font-semibold tracking-[-0.035em]">Files</h1>
            <div class="grid grid-cols-2 gap-1">
              <button class="button-secondary justify-center" id="new-project-file-rail" type="button">Add file</button>
              <button class="button-secondary justify-center" id="new-project-folder-rail" type="button">Add folder</button>
            </div>
          </div>
          <div class="mt-4 grid gap-1" id="project-file-list"><div class="empty-state">Loading project files…</div></div>
          <details class="rail-collection mt-4" id="derived-project-bibliography">
            <summary><span>Bibliography</span></summary>
            <div class="pb-4">
              <p class="mb-3 text-xs leading-5 text-app-text-soft">Generated BibTeX from project references. Read only.</p>
              <label class="sr-only" for="bibliography-editor">Derived project BibTeX</label>
              <textarea class="bibliography-editor rail-bibliography-editor" id="bibliography-editor" spellcheck="false" readonly></textarea>
            </div>
          </details>
        </section>

        <section class="rail-panel px-4 py-5 lg:px-5" id="research-rail-panel" role="tabpanel" aria-labelledby="show-research-rail" hidden>
          <div><p class="eyebrow">Research</p><h1 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Sources &amp; evidence</h1></div>
          <div class="research-inventory" id="research-inventory">
            <details class="rail-collection" id="project-evidence" hidden>
              <summary><span>Project evidence</span><span class="count-badge" id="project-evidence-count">0</span></summary>
              <div class="rail-collection-body" id="annotation-list">
                <div class="project-evidence-list" id="pdf-list"></div>
                <div class="project-evidence-orphans" id="unassigned-annotation-list" hidden></div>
              </div>
            </details>
            <details class="rail-collection">
              <summary><span>Claims</span><span class="count-badge" id="claim-count">0</span></summary>
              <div class="px-1 pt-3"><button class="button-secondary w-full justify-center" id="new-claim" type="button">New claim</button></div>
              <div class="rail-collection-body" id="claim-list"><div class="empty-state">No claims yet.</div></div>
            </details>
            <details class="rail-collection">
              <summary><span>References</span><span class="count-badge" id="publication-count">0</span></summary>
              <div class="rail-collection-body" id="publication-list"><div class="empty-state">No project references yet.</div></div>
            </details>
          </div>
          <input class="sr-only" id="pdf-upload" type="file" accept="application/pdf">
          <input class="sr-only" id="bibliography-upload" type="file" accept=".bib,application/x-bibtex,text/plain">
        </section>

        <section class="rail-panel px-4 py-5 lg:px-5" id="comments-rail-panel" role="tabpanel" aria-labelledby="show-comments-rail" hidden>
          <div><p class="eyebrow">Collaboration</p><h1 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Manuscript comments</h1></div>
          <p class="mt-2 text-xs leading-5 text-app-text-soft">Select manuscript text, then leave a comment that follows the passage as collaborators edit.</p>
          <form class="mt-4 grid gap-3 border-t border-app-line pt-4" id="manuscript-comment-form">
            <label class="field-label" for="manuscript-comment-body">Comment on selected text</label>
            <textarea class="field min-h-24 resize-y" id="manuscript-comment-body" maxlength="8000" required placeholder="Leave a comment on the selected passage."></textarea>
            <button class="button-secondary w-full justify-center" type="submit">Add comment</button>
            <p class="text-xs leading-5 text-app-text-soft" id="manuscript-comment-status" role="status">Comments stay outside the Markdown source.</p>
          </form>
          <div class="mt-4 grid gap-3" id="manuscript-comment-list"></div>
        </section>
      </aside>

      <section class="editor-column min-w-0 border-b border-app-line bg-app-surface min-[72rem]:border-r min-[72rem]:border-b-0" id="authoring-surface">
        <div class="editor-toolbar">
          <div class="editor-toolbar-group">
            <div class="authoring-mode-switcher" role="group" aria-label="Authoring mode">
              <button class="authoring-mode" id="show-write-mode" type="button" aria-pressed="true">Write</button>
              <button class="authoring-mode" id="show-map-mode" type="button" aria-pressed="false">Map</button>
            </div>
            <span class="count-badge" id="revision-badge">r0</span>
            <button class="count-badge" id="word-count-badge" type="button" title="Open publication statistics">… words</button>
            <button class="button-secondary" id="open-project-history" type="button">History</button>
          </div>
          <div class="editor-toolbar-group" id="editor-write-actions">
            <button class="editor-mode-toggle" id="vim-toggle" type="button" aria-pressed="false" title="Enable Vim keybindings">Vim</button>
            <span class="editor-mode-status" id="vim-mode-status" role="status" aria-live="polite" hidden>NORMAL</span>
            <details class="action-menu" id="editor-insert-menu" data-action-menu>
              <summary class="button-secondary">Insert</summary>
              <div class="editor-command-menu">
                <button type="button" data-insert-syntax="citation"><strong>Citation</strong><code>:cite[key]</code></button>
                <button type="button" data-insert-syntax="reference"><strong>Cross-reference</strong><code>:ref[target]</code></button>
                <button type="button" data-insert-syntax="anchor"><strong>Anchor</strong><code>{#label}</code></button>
                <button type="button" data-insert-syntax="footnote"><strong>Footnote</strong><code>[^note]</code></button>
                <button type="button" data-insert-syntax="link"><strong>Link</strong><code>[text](url)</code></button>
                <button type="button" data-insert-syntax="bibliography"><strong>Bibliography</strong><code>::bibliography[]</code></button>
                <div class="border-t border-app-line pt-1" id="include-project-file-list" aria-label="Include project file"></div>
              </div>
            </details>
            <details class="action-menu" data-action-menu>
              <summary class="button-secondary">File</summary>
              <div class="editor-command-menu" aria-label="File actions">
                <button id="new-project-file" type="button"><strong>Add file</strong></button>
                <button id="create-and-include-project-file" type="button"><strong>Create and include</strong><code>at the current caret</code></button>
                <button id="rename-project-file" type="button"><strong>Move or rename file</strong></button>
                <button id="delete-project-file" type="button"><strong>Delete file</strong></button>
              </div>
            </details>
            <button class="button-secondary hidden" id="open-source-citation" type="button" title="View the citation at the caret" disabled>View cited source</button>
            <p class="text-xs text-app-text-soft" id="save-status">Opening…</p>
          </div>
        </div>
        <label class="sr-only" for="source-editor">Markdown source</label>
        <div class="source-editor-shell" id="source-editor-shell" data-vim-mode="off">
          <pre class="source-editor-highlight" id="source-editor-highlight" aria-hidden="true"></pre>
          <textarea class="source-editor" id="source-editor" spellcheck="true" aria-describedby="editor-help"></textarea>
        </div>
        <section class="project-map" id="project-map" aria-labelledby="project-map-heading" hidden>
          <header class="project-map-header">
            <div>
              <p class="eyebrow">Project structure</p>
              <h2 class="project-map-title" id="project-map-heading">Evidence map</h2>
              <p class="project-map-description">Follow the typed links between the manuscript, evidence, claims, and references.</p>
            </div>
            <span class="project-map-total" id="project-map-total">0 resources</span>
          </header>
          <form class="project-map-search" id="knowledge-search-form" role="search">
            <label class="sr-only" for="knowledge-search-input">Find a project resource</label>
            <input class="field min-w-0" id="knowledge-search-input" type="search" maxlength="200" placeholder="Find a resource in this project">
            <button class="button-secondary shrink-0" type="submit">Find</button>
          </form>
          <div class="hidden space-y-2" id="knowledge-search-results" aria-live="polite"></div>
          <div id="project-map-overview">
            <div class="project-map-canvas" id="project-map-canvas">
              <svg id="project-map-graph" viewBox="0 0 1000 600" role="img" aria-label="Project evidence graph"></svg>
              <div class="project-map-nodes" id="project-map-nodes"></div>
            </div>
            <section class="project-map-connections" aria-labelledby="project-map-connections-heading">
              <div class="project-map-connections-header">
                <h3 id="project-map-connections-heading">Connections</h3>
                <span class="count-badge" id="connection-count">0</span>
              </div>
              <div class="project-map-connection-list" id="knowledge-connection-list"><div class="empty-state">No connections yet.</div></div>
            </section>
          </div>
        </section>
        <p class="sr-only" id="editor-help">Collaborative Markdown source. Select text to link it to an annotation. Undo with Command-Z or Control-Z; redo with Command-Shift-Z, Control-Shift-Z, or Control-Y.</p>
      </section>

      <div class="authoring-context-resizer" id="authoring-context-resizer" role="separator" aria-label="Resize authoring and context panes" aria-orientation="vertical" aria-valuemin="35" aria-valuemax="65" aria-valuenow="48" tabindex="0"></div>

      <section class="context-column preview-column min-w-0 bg-app-paper" id="context-surface" aria-label="Research context">
        <div class="context-tabs" id="context-tabs">
          <div class="context-tab-list" id="context-tab-list" role="tablist" aria-label="Research context">
            <button class="context-tab" id="context-preview-tab" type="button" role="tab" aria-controls="context-preview-panel" aria-selected="true" tabindex="0">Preview</button>
            <button class="context-tab" id="context-library-tab" type="button" role="tab" aria-controls="context-library-panel" aria-selected="false" tabindex="-1">Library</button>
            <button class="context-tab" id="context-assistant-tab" type="button" role="tab" aria-controls="context-assistant-panel" aria-selected="false" tabindex="-1">Writing assistant</button>
            <div class="context-resource-tabs" id="context-resource-tabs" role="presentation"></div>
          </div>
          <div class="context-tab-controls" aria-label="Active context actions">
            <div class="context-mode-controls" id="preview-context-controls">
              <span id="diagnostic-summary">Validating…</span>
            </div>
            <div class="context-mode-controls" id="pdf-context-controls" hidden>
              <span class="context-status" id="paper-status">Loading PDF…</span>
              <button id="previous-paper-page" type="button" aria-label="Previous PDF page">←</button>
              <span class="context-page-indicator" id="paper-page-indicator">– / –</span>
              <button id="next-paper-page" type="button" aria-label="Next PDF page">→</button>
            </div>
            <button id="pin-active-context" type="button" disabled hidden>Pin</button>
            <button id="close-active-context" type="button" disabled hidden>Close</button>
          </div>
        </div>

        <section class="context-panel context-preview-panel" id="context-preview-panel" role="tabpanel" aria-labelledby="context-preview-tab" tabindex="0">
          <div class="preview-scroll" id="preview-scroll">
            <article class="prose-preview" id="preview" aria-live="polite"></article>
            <div class="mx-auto mt-8 max-w-[44rem] border-t border-app-line pt-4" id="diagnostics"></div>
          </div>
        </section>

        <section class="context-panel context-library-panel" id="context-library-panel" role="tabpanel" aria-labelledby="context-library-tab" tabindex="0" hidden>
          <div class="context-library-scroll p-5" id="context-library-scroll">
            <header class="library-header">
              <h2 title="Private references and research material">Library</h2>
              <details class="action-menu library-add-menu" data-action-menu>
                <summary class="button-primary">Add reference</summary>
                <div class="library-menu library-add-reference-menu">
                  <label class="library-menu-action" id="library-pdf-dropzone" for="library-pdf-upload" title="Choose or drop up to 20 PDF files">
                    <span><strong>PDF files</strong><small id="library-pdf-upload-help">Upload up to 20</small></span><span aria-hidden="true">↑</span>
                    <input class="sr-only" id="library-pdf-upload" type="file" accept="application/pdf" multiple aria-describedby="library-pdf-upload-help">
                  </label>
                  <form class="library-url-form" id="web-source-form">
                    <label class="sr-only" for="web-source-url">Website URL</label>
                    <input class="field" id="web-source-url" type="url" maxlength="4096" required placeholder="https://…" title="Add a website by URL">
                    <button class="button-primary justify-center" type="submit">Add URL</button>
                  </form>
                  <div class="library-menu-divider"></div>
                  <label class="library-menu-action" title="Import references from a BibTeX file"><span>Import BibTeX</span><input class="sr-only" id="library-bibliography-upload" type="file" accept=".bib,application/x-bibtex,text/plain"></label>
                  <label class="library-menu-action" title="Import references from a CSL JSON file"><span>Import CSL JSON</span><input class="sr-only" id="library-csl-upload" type="file" accept=".json,application/json"></label>
                </div>
              </details>
            </header>
            <section class="hidden library-upload-status" id="library-pdf-upload-status" aria-live="polite"></section>
            <div class="library-toolbar">
              <div class="library-search">
                <label class="sr-only" for="reference-filter-query">Search library</label>
                <input class="field" id="reference-filter-query" type="search" maxlength="200" placeholder="Search references…" title="Search title, author, reference ID, DOI, or URL">
                <span id="reference-filter-count" aria-live="polite">0 references</span>
              </div>
              <details class="action-menu library-filter-menu" data-action-menu>
                <summary class="button-secondary" title="Filter and sort references">Filter</summary>
                <section class="library-menu library-filter-fields" aria-label="Filter reference library">
                  <label class="field-label">Type<select class="field" id="reference-filter-type"><option value="">All types</option></select></label>
                  <label class="field-label">Reading<select class="field" id="reference-filter-reading"><option value="all">Any status</option><option value="unread">Unread</option><option value="reading">Reading</option><option value="read">Read</option></select></label>
                  <label class="field-label">Tag or collection<input class="field" id="reference-filter-organization" maxlength="80" placeholder="Any label"></label>
                  <label class="field-label">Project<select class="field" id="reference-filter-linkage"><option value="all">Linked or unlinked</option><option value="linked">Linked</option><option value="unlinked">Not linked</option></select></label>
                  <label class="field-label">Metadata<select class="field" id="reference-filter-completeness"><option value="all">Any completeness</option><option value="complete">Complete</option><option value="incomplete">Needs metadata</option></select></label>
                  <label class="field-label">Sort<select class="field" id="reference-filter-sort"><option value="updated">Recently updated</option><option value="title">Title</option><option value="year">Year</option><option value="priority">Reading priority</option></select></label>
                </section>
              </details>
              <details class="action-menu library-tools-menu" data-action-menu>
                <summary class="button-secondary library-more-button" aria-label="Library tools" title="Library tools">•••</summary>
                <div class="library-menu library-tools-list">
                  <label class="library-menu-action" title="Restore a Kirjolab library archive"><span>Restore archive</span><input class="sr-only" id="library-archive-upload" type="file" accept=".zip,application/zip"></label>
                  <a href="/api/library/export/csl.json">Export CSL JSON</a>
                  <a href="/api/library/export/library.zip">Export library</a>
                  <button id="open-citation-network" type="button">Citation network</button>
                  <button id="show-archived-references" type="button" aria-pressed="false">Show archived</button>
                </div>
              </details>
            </div>
            <div class="reference-library-list" id="reference-library-list"><div class="empty-state">Loading library…</div></div>
            <section class="mt-6 hidden border-t border-app-line pt-5" id="web-snapshot-comparison" aria-live="polite"></section>
            <section class="mt-6 hidden border-t border-app-line pt-5" id="citation-network" aria-labelledby="citation-network-heading">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div><p class="eyebrow">Shared literature map</p><h3 class="mt-1 text-lg font-semibold" id="citation-network-heading">Citation assertions</h3><p class="mt-2 max-w-2xl text-xs leading-5 text-app-text-soft">Review how sources cite one another. Conflicting relationships remain visible.</p></div>
                <div class="flex gap-2"><button class="button-secondary" id="filter-project-citations" type="button" aria-pressed="false">Current project</button><button class="button-secondary" id="close-citation-network" type="button">Close network</button></div>
              </div>
              <form class="mt-4 grid gap-3 border-y border-app-line py-4 md:grid-cols-[1fr_auto_1fr_auto]" id="citation-assertion-form">
                <label class="field-label">Citing source<select class="field" id="citation-assertion-citing" required></select></label>
                <label class="field-label">Relationship<select class="field" id="citation-assertion-polarity"><option value="cites">Cites</option><option value="does-not-cite">Does not cite</option></select></label>
                <label class="field-label">Cited source<select class="field" id="citation-assertion-cited" required></select></label>
                <div class="flex items-end"><button class="button-primary w-full justify-center" type="submit">Record assertion</button></div>
              </form>
              <div class="mt-4 overflow-hidden border border-app-line bg-app-paper"><svg class="block min-h-72 w-full" id="citation-network-graph" viewBox="0 0 800 360" role="img" aria-label="Citation network graph"></svg></div>
              <div class="mt-4 space-y-3" id="citation-network-list" aria-live="polite"><div class="empty-state">Loading citation assertions…</div></div>
            </section>
            <section class="mt-6 border-t border-app-line pt-5" id="unidentified-pdf-section">
              <div class="flex items-center justify-between gap-3"><p class="eyebrow">PDFs awaiting identification</p><span class="count-badge" id="unidentified-pdf-count">0</span></div>
              <div class="mt-3 grid gap-3" id="unidentified-pdf-list"><div class="empty-state">No unidentified PDFs.</div></div>
            </section>
          </div>
        </section>

        <section class="context-panel context-assistant-panel" id="context-assistant-panel" role="tabpanel" aria-labelledby="context-assistant-tab" tabindex="0" hidden>
          <div class="context-assistant-scroll p-5" id="context-assistant-scroll">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p class="eyebrow" id="assistant-operation-eyebrow">Selected passage</p>
                <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]" id="assistant-operation-title">Draft a reviewable revision</h2>
              </div>
              <p class="max-w-lg text-xs leading-5 text-app-text-soft" id="assistant-operation-description">Uses only the selected passage and chosen evidence. Review the draft in Context before applying it.</p>
            </div>
            <div class="assistant-workflow">
              <label class="field-label">Task
                <select class="field" id="model-operation">
                  <option value="revise-selection">Revise selected passage</option>
                  <option value="draft-claim">Draft evidence-backed claim</option>
                </select>
              </label>
              <label class="field-label" id="model-claim-relation-field" hidden>Evidence relation
                <select class="field" id="model-claim-relation">
                  <option value="supports">Supports</option>
                  <option value="contradicts">Contradicts</option>
                  <option value="extends">Extends</option>
                </select>
              </label>
              <label class="field-label model-instruction-field" for="model-instruction"><span id="model-instruction-label">Revision instruction</span>
                <textarea class="field model-instruction" id="model-instruction" maxlength="4000" rows="2">Improve clarity while preserving the claim and citation syntax.</textarea>
              </label>
              <button class="button-primary model-generate-action justify-center" id="generate-candidate" type="button">Draft revision</button>
            </div>
            <details class="assistant-settings" id="assistant-model-settings">
              <summary>Model connection</summary>
              <div class="assistant-settings-grid">
                <label class="field-label">Connection
                  <select class="field" id="llm-connection">
                    <option value="direct">Direct browser connection</option>
                    <option value="companion">Local companion</option>
                  </select>
                </label>
                <label class="field-label">Endpoint
                  <input class="field" id="llm-endpoint" type="url" value="http://127.0.0.1:1234/v1/chat/completions">
                </label>
                <label class="field-label">Model
                  <input class="field" id="llm-model" type="text" value="local-model">
                </label>
              </div>
            </details>
            <p class="mt-3 text-sm text-app-text-soft" id="model-status" role="status" aria-live="polite">Select manuscript text and at least one annotation or claim to ground the request.</p>
            <div class="mt-4" id="candidate-list">
              <div class="empty-state">Drafts open in Context and do not change the manuscript until applied.</div>
            </div>
          </div>
        </section>

        <section class="context-panel context-publication-panel" id="context-publication-panel" role="tabpanel" aria-label="Publication context" tabindex="0" hidden>
          <header class="context-resource-header">
            <div class="min-w-0">
              <p class="eyebrow">Reference</p>
              <h2 class="context-resource-title" id="context-publication-title">No reference selected</h2>
              <p class="context-resource-meta" id="context-publication-meta">Choose a citation or reference to inspect its scholarly record.</p>
            </div>
            <button class="button-secondary shrink-0" id="close-publication-context" type="button">Close</button>
          </header>
          <div class="context-publication-body" id="context-publication-body">
            <div class="context-resource-copy" id="context-publication-details">
              <div class="empty-state">Publication metadata and linked papers appear here.</div>
            </div>
            <div class="context-resource-actions">
              <button class="button-primary justify-center" id="insert-context-citation" type="button" disabled>Insert citation</button>
              <button class="button-secondary justify-center" id="open-paper" type="button" disabled>Open linked paper</button>
            </div>
            <form class="context-link-form" id="publication-pdf-link-form">
              <label class="field-label" for="publication-pdf-link">Linked paper
                <select class="field" id="publication-pdf-link" disabled><option value="">Import a PDF first</option></select>
              </label>
              <button class="button-secondary justify-center" type="submit" disabled>Connect paper</button>
            </form>
            <div class="context-linked-resources" id="context-publication-pdfs">
              <p class="empty-state">No paper connected to this reference yet.</p>
            </div>
          </div>
        </section>

        <section class="context-panel context-pdf-panel" id="context-pdf-panel" role="tabpanel" aria-label="PDF context" tabindex="0" hidden>
          <div class="context-pdf-body">
            <div class="pdf-reader" id="paper-reader">
              <div class="pdf-page" id="paper-page">
                <canvas class="block" id="paper-canvas"></canvas>
                <div class="pdf-highlights" id="paper-highlights"></div>
                <div class="textLayer" id="paper-text-layer"></div>
                <div class="pdf-markups" id="paper-markups" data-tool="text" aria-label="Private PDF annotations"></div>
              </div>
            </div>
            <aside class="annotation-composer" id="annotation-composer" aria-labelledby="annotation-composer-title">
              <details class="publication-intake" id="publication-intake">
                <summary><span id="publication-intake-heading">Identify reference</span><span class="count-badge">Optional</span></summary>
                <div class="publication-intake-body">
                <p class="mt-2 text-xs leading-5 text-app-text-soft">Review DOI metadata before adding the reference and connecting this PDF.</p>
                <form class="publication-intake-form" id="publication-intake-form">
                  <label class="field-label" for="publication-intake-doi">DOI</label>
                  <div class="publication-intake-lookup-row">
                    <input class="field" id="publication-intake-doi" type="text" inputmode="url" maxlength="500" required autocomplete="off" placeholder="10.1234/example or doi.org URL">
                    <button class="button-secondary justify-center" type="submit">Look up DOI</button>
                  </div>
                </form>
                <p class="publication-intake-status" id="publication-intake-status" role="status" aria-live="polite">Looking up a DOI does not change the library.</p>
                <div class="publication-intake-review" id="publication-intake-review" hidden>
                  <p class="eyebrow">Review metadata</p>
                  <h3 class="publication-intake-title" id="publication-intake-title">Publication title</h3>
                  <p class="publication-intake-meta" id="publication-intake-meta">Authors, year, and venue appear here.</p>
                  <label class="field-label mt-3" for="publication-intake-key">Citation key
                    <input class="field" id="publication-intake-key" type="text" maxlength="200" required autocomplete="off">
                  </label>
                  <div class="publication-intake-actions">
                    <button class="button-primary justify-center" id="publication-intake-accept" type="button">Add to library &amp; connect</button>
                    <button class="button-secondary justify-center" id="publication-intake-cancel" type="button">Cancel</button>
                  </div>
                </div>
                <div class="publication-intake-linked" id="publication-intake-linked" hidden>
                  <p class="eyebrow">Linked reference</p>
                  <div class="publication-intake-linked-list" id="publication-intake-linked-list"></div>
                </div>
                </div>
              </details>
              <div class="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p class="eyebrow">Evidence capture</p>
                  <h2 class="mt-1 text-lg font-semibold tracking-[-0.035em]" id="annotation-composer-title">Annotate this paper</h2>
                </div>
                <button class="button-secondary" id="cite-active-pdf" type="button" disabled>Cite linked reference</button>
              </div>
              <div class="highlight-tools" role="group" aria-label="PDF highlight tool">
                <button class="button-secondary" id="highlight-paint-tool" type="button" aria-pressed="true">Paint</button>
                <button class="button-secondary" id="highlight-eraser-tool" type="button" aria-pressed="false">Eraser</button>
                <button class="button-secondary" id="undo-highlight" type="button" disabled>Undo last stroke</button>
              </div>
              <p class="mt-2 text-xs leading-5 text-app-text-soft" id="annotation-selection-status">Select text in the paper to capture its quotation, context, page, and geometry.</p>
              <form class="mt-3 grid gap-3 sm:grid-cols-2" id="annotation-form">
                <label class="field-label sm:col-span-2">Paper
                  <select class="field" id="annotation-pdf" required disabled><option value="">Import a PDF first</option></select>
                </label>
                <label class="field-label">Page
                  <input class="field" id="annotation-page" type="number" min="1" value="1" required>
                </label>
                <label class="field-label">Your note
                  <input class="field" id="annotation-comment" type="text" placeholder="Why this matters">
                </label>
                <label class="field-label sm:col-span-2">Exact quotation
                  <textarea class="field min-h-20" id="annotation-quote" required readonly placeholder="Select a passage in the paper"></textarea>
                </label>
                <label class="field-label">Text before
                  <input class="field" id="annotation-prefix" type="text" placeholder="Context before selection">
                </label>
                <label class="field-label">Text after
                  <input class="field" id="annotation-suffix" type="text" placeholder="Context after selection">
                </label>
                <div class="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                  <button class="button-primary justify-center" type="submit">Save note</button>
                  <button class="button-secondary justify-center" id="save-and-link-annotation" type="submit">Link highlight to selection</button>
                </div>
              </form>
            </aside>
            <aside class="annotation-composer library-pdf-tools" id="library-highlight-composer" aria-label="Private PDF tools" hidden>
              <div class="library-pdf-toolbar" role="toolbar" aria-label="PDF annotation tool">
                <div class="library-pdf-tool-group">
                  <button class="button-secondary" id="library-text-tool" type="button" aria-pressed="true" title="Select text and save a quotation">Text</button>
                  <button class="button-secondary" id="library-note-tool" type="button" aria-pressed="false" title="Tap the page to attach a private note">Note</button>
                  <button class="button-secondary" id="library-draw-tool" type="button" aria-pressed="false" title="Draw directly on the page with a mouse, pen, or touch">Draw</button>
                </div>
                <div class="library-ink-options" id="library-ink-options" hidden>
                  <label title="Ink color"><span class="sr-only">Ink color</span><input id="library-draw-color" type="color" value="#d33f49"></label>
                  <label class="library-width-control" title="Ink width"><span class="sr-only">Ink width</span><input id="library-draw-width" type="range" min="1" max="24" value="4"><output id="library-draw-width-value">4</output></label>
                  <button class="button-secondary" id="undo-library-drawing" type="button" disabled title="Remove the latest drawing on this page">Undo</button>
                </div>
                <button class="button-secondary" id="export-library-annotated-pdf" type="button" disabled title="Download a copy with private notes and ink">Export annotated</button>
                <p class="library-pdf-status" id="library-highlight-status" role="status" aria-live="polite">Select text to highlight.</p>
              </div>
              <form class="library-context-composer" id="library-highlight-form" hidden>
                <input id="library-highlight-page" type="hidden" value="1">
                <textarea id="library-highlight-quote" hidden maxlength="20000" required></textarea>
                <blockquote class="library-selection-excerpt" id="library-highlight-excerpt"></blockquote>
                <input class="field" id="library-highlight-comment" type="text" maxlength="8000" aria-label="Private comment" placeholder="Add a note (optional)">
                <button class="button-primary" id="save-library-highlight" type="submit" disabled>Save</button>
                <button class="button-secondary" id="cancel-library-highlight" type="button" disabled>Cancel</button>
              </form>
              <form class="library-context-composer" id="library-note-form" hidden>
                <textarea class="field" id="library-note-body" maxlength="8000" required aria-label="Private PDF note" placeholder="Write a private note…"></textarea>
                <button class="button-primary" type="submit">Save note</button>
                <button class="button-secondary" id="cancel-library-note" type="button">Cancel</button>
              </form>
              <details class="library-annotation-details">
                <summary><span>Annotations</span><span class="count-badge" id="library-highlight-count">0</span></summary>
                <div class="library-annotation-details-body">
                  <div class="space-y-2" id="library-highlight-list"><p class="empty-state">No private annotations yet.</p></div>
                  <details class="library-project-details">
                    <summary>Project sharing</summary>
                    <div class="mt-2" id="library-project-use"><p class="empty-state">Project-use options appear for the active private PDF.</p></div>
                  </details>
                </div>
              </details>
            </aside>
          </div>
        </section>

        <section class="context-panel context-candidate-panel" id="context-candidate-panel" role="tabpanel" aria-label="Model revision context" tabindex="0" hidden>
          <header class="context-resource-header">
            <div class="min-w-0">
              <p class="eyebrow" id="context-candidate-eyebrow">Grounded revision</p>
              <h2 class="context-resource-title" id="context-candidate-title">No revision selected</h2>
              <p class="context-resource-meta" id="context-candidate-meta">Provider, model, and source revision appear here.</p>
            </div>
            <button class="button-secondary shrink-0" id="close-candidate-context" type="button" aria-label="Close revision context">Close</button>
          </header>
          <div class="context-candidate-scroll" id="context-candidate-scroll">
            <div class="context-candidate-review">
              <p class="context-candidate-status" id="context-candidate-status" role="status" aria-live="polite">Choose a revision candidate to inspect its scoped change and evidence.</p>
              <div class="context-candidate-comparison" aria-label="Passage revision comparison">
                <section class="context-candidate-passage context-candidate-original" aria-labelledby="context-candidate-before-label">
                  <h3 class="context-candidate-passage-label" id="context-candidate-before-label">Original passage</h3>
                  <pre id="context-candidate-before" role="region" aria-labelledby="context-candidate-before-label" tabindex="0">The selected manuscript passage appears here.</pre>
                </section>
                <section class="context-candidate-passage context-candidate-proposal" aria-labelledby="context-candidate-after-label">
                  <h3 class="context-candidate-passage-label" id="context-candidate-after-label">Proposed replacement</h3>
                  <pre id="context-candidate-after" role="region" aria-labelledby="context-candidate-after-label" tabindex="0">The proposed replacement appears here.</pre>
                </section>
              </div>
              <section class="context-candidate-provenance" aria-labelledby="context-candidate-evidence-heading">
                <div>
                  <p class="eyebrow">Grounding and provenance</p>
                  <h3 class="context-candidate-section-title" id="context-candidate-evidence-heading">Evidence used for this revision</h3>
                </div>
                <div class="context-candidate-evidence" id="context-candidate-evidence">
                  <div class="empty-state">Annotation and claim snapshots appear here with links back to their sources.</div>
                </div>
              </section>
              <div class="context-candidate-actions" aria-label="Revision decision">
                <button class="button-secondary justify-center" id="context-candidate-reject" type="button" disabled>Reject revision</button>
                <button class="button-primary justify-center" id="context-candidate-apply" type="button" disabled>Apply replacement</button>
              </div>
            </div>
          </div>
        </section>
      </section>
  
    </main>

    <dialog class="reference-library-dialog" id="export-dialog">
      <div class="p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">Publication output</p>
            <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Export composed project</h2>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-app-text-soft">Choose a format for the composed project.</p>
          </div>
          <button class="button-secondary" id="close-export" type="button">Close</button>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <a class="resource-card block" href="/api/workspaces/${escapedWorkspaceId}/export/document.pdf"><span class="eyebrow">Ready to share</span><strong class="mt-2 block font-sans">PDF</strong><span class="mt-1 block text-xs leading-5 text-app-text-soft">Formatted document</span></a>
          <a class="resource-card block" href="/api/workspaces/${escapedWorkspaceId}/export/latex.zip"><span class="eyebrow">Publisher</span><strong class="mt-2 block font-sans">LaTeX project</strong><span class="mt-1 block text-xs leading-5 text-app-text-soft">Source and bibliography</span></a>
          <a class="resource-card block" href="/api/workspaces/${escapedWorkspaceId}/export/document.md"><span class="eyebrow">Plain text</span><strong class="mt-2 block font-sans">Markdown</strong><span class="mt-1 block text-xs leading-5 text-app-text-soft">Composed manuscript</span></a>
          <a class="resource-card block" href="/api/workspaces/${escapedWorkspaceId}/export/bibliography.bib"><span class="eyebrow">References</span><strong class="mt-2 block font-sans">BibTeX</strong><span class="mt-1 block text-xs leading-5 text-app-text-soft">Cited sources</span></a>
          <a class="resource-card block" href="/api/workspaces/${escapedWorkspaceId}/export/source.zip"><span class="eyebrow">Archive</span><strong class="mt-2 block font-sans">Source bundle</strong><span class="mt-1 block text-xs leading-5 text-app-text-soft">Files and evidence</span></a>
        </div>
        <section class="mt-6 border-t border-app-line pt-5">
          <div class="flex items-center justify-between gap-3"><p class="eyebrow">Publication statistics</p><a class="font-sans text-xs font-semibold text-app-accent" href="/api/workspaces/${escapedWorkspaceId}/export/statistics.json">Download JSON</a></div>
          <div class="mt-3" id="export-statistics" aria-live="polite"><div class="empty-state">Loading composed word counts…</div></div>
        </section>
      </div>
    </dialog>

    <dialog class="new-workspace-dialog" id="new-workspace-dialog">
      <form class="p-5" id="new-workspace-form">
        <p class="eyebrow">New project</p>
        <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Start another line of inquiry</h2>
        <label class="field-label mt-5">Project title
          <input class="field" id="new-workspace-title" type="text" maxlength="120" required autofocus placeholder="Working title">
        </label>
        <div class="mt-5 flex justify-end gap-2">
          <button class="button-secondary" id="cancel-new-workspace" type="button">Cancel</button>
          <button class="button-primary" type="submit">Create project</button>
        </div>
      </form>
    </dialog>

    <dialog class="new-workspace-dialog" id="workspace-settings-dialog">
      <form class="p-5" id="workspace-settings-form">
        <p class="eyebrow">Project settings</p>
        <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Manage this project</h2>
        <label class="field-label mt-5">Project title<input class="field" id="workspace-settings-title" maxlength="120" required></label>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="field-label">Citation style<select class="field" id="workspace-citation-style">
            <option value="apa">APA</option><option value="chicago-author-date">Chicago author-date</option><option value="ieee">IEEE numeric</option>
          </select></label>
          <label class="field-label">Citation locale<select class="field" id="workspace-citation-locale">
            <option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="fi-FI">Finnish</option>
          </select></label>
          <label class="field-label">Submission template<select class="field" id="workspace-submission-template">
            <option value="article">Standard article</option><option value="preprint">Preprint</option>
            <option value="anonymous-review">Anonymous review</option><option value="journal-two-column">Journal two-column</option>
          </select></label>
          <label class="field-label">Paper size<select class="field" id="workspace-paper-size"><option value="a4">A4</option><option value="letter">US Letter</option></select></label>
        </div>
        <p class="mt-2 text-xs leading-5 text-app-text-soft">These settings affect preview and exports without changing the manuscript.</p>
        <div class="mt-5 flex flex-wrap gap-2">
          <button class="button-primary" type="submit">Save title</button>
          <button class="button-secondary" id="duplicate-workspace" type="button">Duplicate</button>
          <button class="button-secondary" id="archive-workspace" type="button">Archive</button>
        </div>
        <section class="mt-6 border-t border-app-line pt-5">
          <p class="eyebrow">Danger zone</p>
          <p class="mt-2 text-sm leading-6 text-app-text-soft">Permanent deletion removes project revisions, collaborators, project PDFs, and project links. Private library references remain.</p>
          <button class="button-secondary mt-3" id="delete-workspace" type="button">Delete permanently</button>
        </section>
        <div class="mt-5 flex justify-end"><button class="button-secondary" id="close-workspace-settings" type="button">Close</button></div>
      </form>
    </dialog>

    <dialog class="reference-library-dialog" id="workspace-catalog-dialog">
      <div class="p-5">
        <div class="flex items-start justify-between gap-4">
          <div><p class="eyebrow">Project library</p><h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Open a project</h2></div>
          <button class="button-secondary" id="close-workspace-catalog" type="button">Close</button>
        </div>
        <label class="field-label mt-5" for="workspace-catalog-filter">Find by title
          <input class="field" id="workspace-catalog-filter" type="search" maxlength="120" autocomplete="off" placeholder="Filter projects">
        </label>
        <div class="mt-4 grid gap-2" id="workspace-catalog-list" aria-live="polite"><div class="empty-state">Loading projects…</div></div>
      </div>
    </dialog>

    <dialog class="new-workspace-dialog" id="share-workspace-dialog">
      <div class="p-5">
        <p class="eyebrow">Project access</p>
        <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Collaborators</h2>
        <section class="mt-4 border-y border-app-line py-4" aria-labelledby="read-only-share-heading">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="font-sans text-xs font-bold" id="read-only-share-heading">Read-only link</h3>
              <p class="mt-1 font-sans text-xs leading-5 text-app-text-soft" id="read-only-share-status">Checking link access…</p>
            </div>
            <button class="button-secondary shrink-0" id="create-read-only-share" type="button">Create link</button>
          </div>
          <div class="mt-3 hidden gap-2 sm:grid-cols-[1fr_auto]" id="read-only-share-link-row">
            <label class="sr-only" for="read-only-share-link">Read-only share link</label>
            <input class="field" id="read-only-share-link" type="text" readonly>
            <button class="button-secondary" id="copy-read-only-share" type="button">Copy link</button>
          </div>
          <button class="mt-3 hidden font-sans text-xs font-bold text-app-error" id="revoke-read-only-share" type="button">Revoke read-only link</button>
        </section>
        <section class="border-b border-app-line py-4" aria-labelledby="edit-share-heading">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="font-sans text-xs font-bold" id="edit-share-heading">Edit link</h3>
              <p class="mt-1 font-sans text-xs leading-5 text-app-text-soft" id="edit-share-status">Checking link access…</p>
            </div>
            <button class="button-secondary shrink-0" id="create-edit-share" type="button">Create link</button>
          </div>
          <div class="mt-3 hidden gap-2 sm:grid-cols-[1fr_auto]" id="edit-share-link-row">
            <label class="sr-only" for="edit-share-link">Editable share link</label>
            <input class="field" id="edit-share-link" type="text" readonly>
            <button class="button-secondary" id="copy-edit-share" type="button">Copy link</button>
          </div>
          <button class="mt-3 hidden font-sans text-xs font-bold text-app-error" id="revoke-edit-share" type="button">Revoke edit link</button>
        </section>
        <div class="mt-4 space-y-2" id="workspace-member-list"><div class="empty-state">Loading members…</div></div>
        <form class="mt-5 border-t border-app-line pt-5" id="invite-member-form">
          <label class="field-label">Invite by email
            <input class="field" id="invite-member-email" type="email" maxlength="320" required placeholder="researcher@example.org">
          </label>
          <div class="mt-4 flex justify-end gap-2">
            <button class="button-secondary" id="close-share-workspace" type="button">Close</button>
            <button class="button-primary" type="submit">Invite collaborator</button>
          </div>
        </form>
      </div>
    </dialog>

    <dialog class="new-workspace-dialog" id="project-file-dialog">
      <form class="p-5" id="project-file-form">
        <p class="eyebrow">Project structure</p>
        <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]" id="project-file-dialog-title">Add Markdown file</h2>
        <label class="field-label mt-5">Relative path
          <input class="field" id="project-file-path" type="text" maxlength="1024" required placeholder="chapters/01_introduction.md">
        </label>
        <p class="mt-2 text-xs leading-5 text-app-text-soft" id="project-file-dialog-help">Compose this file from main.md with <code>::include[path]</code>.</p>
        <div class="mt-5 flex justify-end gap-2">
          <button class="button-secondary" id="cancel-project-file" type="button">Cancel</button>
          <button class="button-primary" id="save-project-file" type="submit">Save file</button>
        </div>
      </form>
    </dialog>

    <dialog class="reference-library-dialog" id="project-history-dialog">
      <div class="p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">Project record</p>
            <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Revision history</h2>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-app-text-soft">Browse, compare, restore, or branch from saved versions.</p>
          </div>
          <button class="button-secondary" id="close-project-history" type="button">Close</button>
        </div>
        <form class="mt-5 grid gap-3 border-y border-app-line py-4 sm:grid-cols-[1fr_1fr_auto]" id="project-history-compare-form">
          <label class="field-label">From<select class="field" id="project-history-from"></select></label>
          <label class="field-label">To<select class="field" id="project-history-to"></select></label>
          <div class="flex items-end"><button class="button-primary w-full justify-center" type="submit">Compare</button></div>
        </form>
        <section class="mt-5 hidden border border-app-line bg-app-paper p-4" id="project-history-inspector" aria-live="polite"></section>
        <div class="mt-5 space-y-3" id="project-history-list"><div class="empty-state">Loading revision history…</div></div>
      </div>
    </dialog>

    <dialog class="new-workspace-dialog" id="claim-dialog">
      <form class="p-5" id="claim-form">
        <p class="eyebrow">Evidence synthesis</p>
        <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]" id="claim-dialog-title">Create claim</h2>
        <label class="field-label mt-5">Proposition
          <textarea class="field min-h-24" id="claim-text" maxlength="2000" required placeholder="State one concise, defensible claim"></textarea>
        </label>
        <label class="field-label mt-3">Working note
          <textarea class="field min-h-20" id="claim-note" maxlength="8000" placeholder="Interpretation, caveats, or next questions"></textarea>
        </label>
        <label class="field-label mt-3">Evidence relationship
          <select class="field" id="claim-relation">
            <option value="supports">Supports</option>
            <option value="contradicts">Contradicts</option>
            <option value="extends">Extends</option>
          </select>
        </label>
        <fieldset class="mt-4">
          <legend class="field-label">Source annotations</legend>
          <div class="mt-2 max-h-48 space-y-2 overflow-auto" id="claim-evidence-options"></div>
        </fieldset>
        <div class="mt-5 flex justify-end gap-2">
          <button class="button-secondary" id="cancel-claim" type="button">Cancel</button>
          <button class="button-primary" type="submit">Save claim</button>
        </div>
      </form>
    </dialog>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <footer class="sr-only">${routes.map((route) => `${escapeHtml(route.path)} ${escapeHtml(route.purpose)}`).join(" · ")}</footer>
  </body>
</html>`;
}
