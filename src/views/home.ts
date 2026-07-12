import { escapeHtml } from "./shared";

export function renderHomePage(
  routes: Array<{ path: string; purpose: string }>,
  workspaceId = "demo",
  identityEmail = "local@kirjolab.invalid",
): string {
  const escapedWorkspaceId = escapeHtml(workspaceId);
  const escapedIdentityEmail = escapeHtml(identityEmail);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Kirjolab · Evidence becomes prose</title>
    <link rel="stylesheet" href="/styles.css">
    <script type="module" src="/app.js"></script>
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased" data-workspace-id="${escapedWorkspaceId}">
    <header class="sticky top-0 z-30 border-b border-app-line bg-app-canvas/95 backdrop-blur">
      <div class="flex min-h-16 items-center justify-between gap-4 px-4 lg:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <a class="font-sans text-sm font-black tracking-[-0.04em] text-app-ink" href="/">KIRJOLAB</a>
          <span class="hidden h-4 w-px bg-app-line sm:block"></span>
          <label class="sr-only" for="workspace-switcher">Current project</label>
          <select class="workspace-switcher" id="workspace-switcher"><option value="${escapedWorkspaceId}">Loading workspace…</option></select>
          <button class="button-secondary shrink-0" id="manage-workspaces" type="button">Projects</button>
          <button class="button-secondary shrink-0" id="workspace-settings" type="button">Settings</button>
          <button class="button-secondary shrink-0" id="new-workspace" type="button">New project</button>
        </div>
        <div class="flex items-center gap-3">
          <label class="hidden items-center gap-2 font-sans text-xs text-app-text-soft lg:flex">View
            <select class="workspace-switcher" id="workspace-layout" aria-label="Workspace view">
              <option value="split">Split</option><option value="editor">Editor only</option>
              <option value="context">Context only</option><option value="pdf">PDF only</option>
            </select>
          </label>
          <span class="hidden max-w-44 truncate font-sans text-xs text-app-text-soft 2xl:inline" title="${escapedIdentityEmail}">${escapedIdentityEmail}</span>
          <div class="flex items-center gap-2 text-xs text-app-text-soft" aria-live="polite">
            <span class="h-2 w-2 rounded-full bg-app-warn" id="connection-dot"></span>
            <span id="connection-status">Connecting</span>
          </div>
          <button class="button-secondary hidden sm:inline-flex" id="share-workspace" type="button">Share</button>
          <button class="button-secondary hidden sm:inline-flex" id="open-reference-library" type="button">Library</button>
          <button class="button-primary" id="open-export" type="button">Export</button>
        </div>
      </div>
      <div class="hidden border-t border-app-line px-4 py-2 font-sans text-xs text-app-text-soft lg:px-6" id="collaborator-selections" aria-live="polite"></div>
    </header>

    <main class="workspace-grid min-h-[calc(100vh-4rem)]" id="workspace-surfaces" data-active-surface="authoring" data-layout="split">
      <nav class="surface-switcher" aria-label="Workspace surface">
        <button class="surface-switch" id="show-authoring-surface" type="button" aria-controls="authoring-surface" aria-pressed="true">Authoring</button>
        <button class="surface-switch" id="show-context-surface" type="button" aria-controls="context-surface" aria-pressed="false">Context</button>
      </nav>
      <aside class="source-rail border-b border-app-line bg-app-paper lg:border-r lg:border-b-0">
        <div class="rail-mode-switcher" role="tablist" aria-label="Project navigation">
          <button class="rail-mode" id="show-files-rail" type="button" role="tab" aria-controls="files-rail-panel" aria-selected="false">Files</button>
          <button class="rail-mode" id="show-research-rail" type="button" role="tab" aria-controls="research-rail-panel" aria-selected="true">Research</button>
        </div>

        <section class="rail-panel px-4 py-5 lg:px-5" id="files-rail-panel" role="tabpanel" aria-labelledby="show-files-rail" hidden>
          <div class="flex items-end justify-between gap-3">
            <div><p class="eyebrow">Project files</p><h1 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Writing</h1></div>
            <button class="button-secondary" id="new-project-file-rail" type="button">Add file</button>
          </div>
          <p class="mt-3 text-sm leading-6 text-app-text-soft"><strong>main.md</strong> composes the project. Include supporting files with <code>::include[path]</code>.</p>
          <div class="mt-4 flex items-center justify-between gap-3"><p class="eyebrow">Lexical file order</p><span class="count-badge" id="project-file-count">1</span></div>
          <div class="mt-3 grid gap-1" id="project-file-list"><div class="empty-state">Loading project files…</div></div>
        </section>

        <section class="rail-panel px-4 py-5 lg:px-5" id="research-rail-panel" role="tabpanel" aria-labelledby="show-research-rail">
          <div class="flex items-end justify-between gap-3">
            <div><p class="eyebrow">Research</p><h1 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Sources &amp; evidence</h1></div>
            <button class="button-secondary" id="open-reference-library-shelf" type="button">Open library</button>
          </div>
          <form class="mt-4 flex gap-2" id="knowledge-search-form" role="search">
            <label class="sr-only" for="knowledge-search-input">Filter project research</label>
            <input class="field min-w-0" id="knowledge-search-input" type="search" maxlength="200" placeholder="Filter project research">
            <button class="button-secondary shrink-0" type="submit">Search</button>
          </form>
          <div class="mt-3 hidden space-y-2" id="knowledge-search-results" aria-live="polite"></div>
          <div class="research-inventory" id="research-inventory">
            <details class="rail-collection" open>
              <summary><span>Papers</span><span class="count-badge" id="pdf-count">0</span></summary>
              <div class="rail-collection-body" id="pdf-list"><div class="empty-state">No paper imported yet.</div></div>
            </details>
            <details class="rail-collection">
              <summary><span>Highlights</span><span class="count-badge" id="annotation-count">0</span></summary>
              <div class="rail-collection-body" id="annotation-list"><div class="empty-state">Highlights appear here with their source context.</div></div>
            </details>
            <details class="rail-collection">
              <summary><span>Claims</span><span class="count-badge" id="claim-count">0</span></summary>
              <div class="px-1 pt-3"><button class="button-secondary w-full justify-center" id="new-claim" type="button">New claim</button></div>
              <div class="rail-collection-body" id="claim-list"><div class="empty-state">Evidence-backed claims appear here.</div></div>
            </details>
            <details class="rail-collection">
              <summary><span>References</span><span class="count-badge" id="publication-count">0</span></summary>
              <div class="px-1 pt-3"><button class="button-secondary w-full justify-center" id="browse-reference-library" type="button">Browse private library</button></div>
              <div class="rail-collection-body" id="publication-list"><div class="empty-state">Project references appear here.</div></div>
            </details>
            <details class="rail-collection">
              <summary><span>Project graph</span><span class="count-badge" id="connection-count">0</span></summary>
              <div class="px-1 pt-3"><button class="button-secondary w-full justify-center" id="explore-research-graph" type="button">Explore citation network</button></div>
              <div class="rail-collection-body" id="knowledge-connection-list"><div class="empty-state">Typed relationships appear here.</div></div>
            </details>
          </div>
          <input class="sr-only" id="pdf-upload" type="file" accept="application/pdf">
          <input class="sr-only" id="bibliography-upload" type="file" accept=".bib,application/x-bibtex,text/plain">
        </section>
      </aside>

      <section class="editor-column min-w-0 border-b border-app-line bg-app-surface lg:border-r lg:border-b-0" id="authoring-surface">
        <div class="flex h-12 items-center justify-between border-b border-app-line px-4">
          <div class="flex items-center gap-2">
            <label class="sr-only" for="project-file-switcher">Project file</label>
            <select class="workspace-switcher" id="project-file-switcher" aria-label="Project file"><option>main.md</option></select>
            <span class="count-badge" id="revision-badge">r0</span>
            <button class="count-badge" id="word-count-badge" type="button" title="Open publication statistics">… words</button>
            <button class="button-secondary" id="open-project-history" type="button">History</button>
          </div>
          <div class="flex items-center gap-2">
            <details class="editor-insert-menu" id="editor-insert-menu">
              <summary class="button-secondary">Insert</summary>
              <div class="editor-command-menu" role="menu" aria-label="Insert scholarly syntax">
                <button type="button" role="menuitem" data-insert-syntax="citation"><strong>Citation</strong><code>:cite[key]</code></button>
                <button type="button" role="menuitem" data-insert-syntax="reference"><strong>Cross-reference</strong><code>:ref[target]</code></button>
                <button type="button" role="menuitem" data-insert-syntax="anchor"><strong>Anchor</strong><code>{#label}</code></button>
                <button type="button" role="menuitem" data-insert-syntax="footnote"><strong>Footnote</strong><code>[^note]</code></button>
                <button type="button" role="menuitem" data-insert-syntax="link"><strong>Link</strong><code>[text](url)</code></button>
                <button type="button" role="menuitem" data-insert-syntax="include"><strong>Included file</strong><code>::include[path]</code></button>
              </div>
            </details>
            <button class="button-secondary" id="new-project-file" type="button">Add file</button>
            <button class="button-secondary hidden xl:inline-flex" id="rename-project-file" type="button">Rename</button>
            <button class="button-secondary hidden xl:inline-flex" id="delete-project-file" type="button">Delete</button>
            <button class="button-secondary" id="open-source-citation" type="button" title="Place the caret inside :cite[key] to view its source" disabled>View cited source</button>
            <p class="text-xs text-app-text-soft" id="save-status">Opening…</p>
          </div>
        </div>
        <label class="sr-only" for="source-editor">Markdown source</label>
        <textarea class="source-editor" id="source-editor" spellcheck="true" aria-describedby="editor-help"></textarea>
        <p class="sr-only" id="editor-help">Collaborative Markdown source. Select text to link it to an annotation.</p>
        <details class="border-t border-app-line bg-app-paper/75" id="manuscript-comments">
          <summary class="flex cursor-pointer items-center justify-between px-4 py-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-app-text-soft">
            <span>Comments</span><span class="count-badge" id="manuscript-comment-count">0</span>
          </summary>
          <div class="border-t border-app-line px-4 py-4">
            <form class="grid gap-3" id="manuscript-comment-form">
              <label class="field-label" for="manuscript-comment-body">Comment on selected manuscript text</label>
              <textarea class="field min-h-20 resize-y" id="manuscript-comment-body" maxlength="8000" required placeholder="Select a passage above, then leave a comment."></textarea>
              <div class="flex items-center justify-between gap-3">
                <p class="text-xs leading-5 text-app-text-soft" id="manuscript-comment-status" role="status">Comments follow the passage as collaborators edit.</p>
                <button class="button-secondary shrink-0" type="submit">Add comment</button>
              </div>
            </form>
            <div class="mt-4 grid gap-3" id="manuscript-comment-list"></div>
          </div>
        </details>
        <details class="border-t border-app-line bg-app-paper/60">
          <summary class="cursor-pointer px-4 py-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-app-text-soft">Derived project bibliography</summary>
          <label class="sr-only" for="bibliography-editor">BibTeX bibliography</label>
          <textarea class="bibliography-editor" id="bibliography-editor" spellcheck="false" readonly></textarea>
        </details>
      </section>

      <div class="authoring-context-resizer" id="authoring-context-resizer" role="separator" aria-label="Resize authoring and context panes" aria-orientation="vertical" aria-valuemin="35" aria-valuemax="65" aria-valuenow="48" tabindex="0"></div>

      <section class="context-column preview-column min-w-0 bg-app-paper" id="context-surface" aria-label="Research context">
        <div class="context-tabs" id="context-tabs">
          <div class="context-tab-list" id="context-tab-list" role="tablist" aria-label="Research context">
            <button class="context-tab" id="context-preview-tab" type="button" role="tab" aria-controls="context-preview-panel" aria-selected="true" tabindex="0">Preview</button>
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
            <button id="pin-active-context" type="button" disabled>Pin</button>
            <button id="close-active-context" type="button" disabled>Close</button>
          </div>
        </div>

        <section class="context-panel context-preview-panel" id="context-preview-panel" role="tabpanel" aria-labelledby="context-preview-tab" tabindex="0">
          <div class="preview-scroll" id="preview-scroll">
            <article class="prose-preview" id="preview" aria-live="polite"></article>
            <div class="mx-auto mt-8 max-w-[44rem] border-t border-app-line pt-4" id="diagnostics"></div>
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
              </div>
            </div>
            <aside class="annotation-composer" aria-labelledby="annotation-composer-title">
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
          </div>
        </section>

        <section class="context-panel context-candidate-panel" id="context-candidate-panel" role="tabpanel" aria-label="Model revision context" tabindex="0" hidden>
          <header class="context-resource-header">
            <div class="min-w-0">
              <p class="eyebrow">Grounded revision</p>
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

      <details class="workbench assistant-drawer border-t border-app-line bg-app-canvas lg:col-span-4" id="writing-assistant">
        <summary><span>Writing assistant</span><span>Works from selected prose and evidence</span></summary>
        <div class="mx-auto max-w-5xl px-4 py-5 lg:px-6">
          <section>
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p class="eyebrow">Selected passage</p>
                <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Draft a reviewable revision</h2>
              </div>
              <p class="max-w-lg text-xs leading-5 text-app-text-soft">The selected passage, revision instruction, chosen evidence, and configured model identifier are sent from your browser to the local OpenAI-compatible endpoint. No other manuscript text is sent. The proposed replacement stays separate for review in Context.</p>
            </div>
            <div class="assistant-workflow">
              <label class="field-label model-instruction-field" for="model-instruction">Revision instruction
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
              <div class="empty-state">Grounded revisions open in Context and remain separate from the manuscript until you apply one.</div>
            </div>
          </section>
        </div>
      </details>
    </main>

    <dialog class="reference-library-dialog" id="export-dialog">
      <div class="p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">Publication output</p>
            <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Export composed project</h2>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-app-text-soft">Every target resolves the same main.md tree and cited bibliography. LaTeX includes the source map and pinned manifest used by the bounded PDF renderer.</p>
          </div>
          <button class="button-secondary" id="close-export" type="button">Close</button>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <a class="resource-card block" href="/api/workspaces/${escapedWorkspaceId}/export/document.pdf"><span class="eyebrow">Ready to read</span><strong class="mt-2 block font-sans">PDF</strong><span class="mt-1 block text-xs leading-5 text-app-text-soft">Pinned Kirjolab renderer</span></a>
          <a class="resource-card block" href="/api/workspaces/${escapedWorkspaceId}/export/latex.zip"><span class="eyebrow">Publisher workflow</span><strong class="mt-2 block font-sans">LaTeX project</strong><span class="mt-1 block text-xs leading-5 text-app-text-soft">Template, bibliography, manifest, and source map</span></a>
          <a class="resource-card block" href="/api/workspaces/${escapedWorkspaceId}/export/document.md"><span class="eyebrow">Portable source</span><strong class="mt-2 block font-sans">Markdown</strong><span class="mt-1 block text-xs leading-5 text-app-text-soft">Composed canonical prose</span></a>
          <a class="resource-card block" href="/api/workspaces/${escapedWorkspaceId}/export/bibliography.bib"><span class="eyebrow">Cited only</span><strong class="mt-2 block font-sans">BibTeX</strong><span class="mt-1 block text-xs leading-5 text-app-text-soft">References reachable from main.md</span></a>
          <a class="resource-card block" href="/api/workspaces/${escapedWorkspaceId}/export/source.zip"><span class="eyebrow">Archival</span><strong class="mt-2 block font-sans">Source bundle</strong><span class="mt-1 block text-xs leading-5 text-app-text-soft">Project tree and shared evidence metadata</span></a>
        </div>
        <section class="mt-6 border-t border-app-line pt-5">
          <div class="flex items-center justify-between gap-3"><p class="eyebrow">Publication statistics</p><a class="font-sans text-xs font-semibold text-app-accent" href="/api/workspaces/${escapedWorkspaceId}/export/statistics.json">Download JSON</a></div>
          <div class="mt-3" id="export-statistics" aria-live="polite"><div class="empty-state">Loading composed word counts…</div></div>
        </section>
      </div>
    </dialog>

    <dialog class="new-workspace-dialog" id="new-workspace-dialog">
      <form class="p-5" id="new-workspace-form">
        <p class="eyebrow">New workspace</p>
        <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Start another line of inquiry</h2>
        <label class="field-label mt-5">Workspace title
          <input class="field" id="new-workspace-title" type="text" maxlength="120" required autofocus placeholder="Working title">
        </label>
        <div class="mt-5 flex justify-end gap-2">
          <button class="button-secondary" id="cancel-new-workspace" type="button">Cancel</button>
          <button class="button-primary" type="submit">Create workspace</button>
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
        </div>
        <p class="mt-2 text-xs leading-5 text-app-text-soft">The profile changes preview and derived exports without rewriting canonical Markdown or shared references.</p>
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
        <p class="eyebrow">Workspace access</p>
        <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Collaborators</h2>
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
        <p class="mt-2 text-xs leading-5 text-app-text-soft">Compose this file from main.md with <code>::include[path]</code>.</p>
        <div class="mt-5 flex justify-end gap-2">
          <button class="button-secondary" id="cancel-project-file" type="button">Cancel</button>
          <button class="button-primary" type="submit">Save file</button>
        </div>
      </form>
    </dialog>

    <dialog class="reference-library-dialog" id="project-history-dialog">
      <div class="p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">Project record</p>
            <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Revision history</h2>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-app-text-soft">Automatic snapshots include the complete file tree, pinned sources, evidence relationships, and project settings. Milestones name one exact immutable state.</p>
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

    <dialog class="reference-library-dialog" id="reference-library-dialog">
      <div class="p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">Private research memory</p>
            <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Reference library</h2>
            <p class="mt-2 max-w-xl text-sm leading-6 text-app-text-soft">References, PDFs, tags, notes, highlights, and reading state stay private. Adding a citation shares only its bibliographic snapshot with this project.</p>
          </div>
          <button class="button-secondary" id="close-reference-library" type="button">Close</button>
        </div>
        <div class="mt-5 flex flex-wrap gap-2 border-y border-app-line py-4">
          <label class="button-primary">Import BibTeX<input class="sr-only" id="library-bibliography-upload" type="file" accept=".bib,application/x-bibtex,text/plain"></label>
          <label class="button-secondary">Add PDF<input class="sr-only" id="library-pdf-upload" type="file" accept="application/pdf"></label>
          <button class="button-secondary" id="open-citation-network" type="button">Citation network</button>
          <button class="button-secondary" id="show-archived-references" type="button" aria-pressed="false">Show archived</button>
        </div>
        <details class="mt-4 rounded-sm border border-app-line p-4" id="web-source-intake">
          <summary class="cursor-pointer font-sans text-sm font-semibold">Capture web source</summary>
          <form class="mt-4 grid gap-3 md:grid-cols-2" id="web-source-form">
            <label class="field-label md:col-span-2">Public URL<input class="field" id="web-source-url" type="url" maxlength="4096" required placeholder="https://example.org/article"></label>
            <label class="field-label">Title override<input class="field" id="web-source-title" maxlength="1000" placeholder="Fetched automatically when available"></label>
            <label class="field-label">Author or organization<input class="field" id="web-source-author" maxlength="500"></label>
            <label class="field-label">Publisher<input class="field" id="web-source-publisher" maxlength="500"></label>
            <label class="field-label">Publication date<input class="field" id="web-source-published-at" maxlength="100" placeholder="YYYY-MM-DD"></label>
            <div class="flex items-end md:col-span-2"><button class="button-primary" type="submit">Capture immutable version</button></div>
          </form>
          <p class="mt-3 text-xs leading-5 text-app-text-soft">Captures are private, bounded, timestamped, and stored as inert raw bytes plus extracted plain text. Redirects and incomplete captures are recorded.</p>
        </details>
        <div class="mt-5 grid gap-3 md:grid-cols-2" id="reference-library-list"><div class="empty-state">Loading private library…</div></div>
        <section class="mt-6 hidden border-t border-app-line pt-5" id="web-snapshot-comparison" aria-live="polite"></section>
        <section class="mt-6 hidden border-t border-app-line pt-5" id="citation-network" aria-labelledby="citation-network-heading">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><p class="eyebrow">Shared literature map</p><h3 class="mt-1 text-lg font-semibold" id="citation-network-heading">Citation assertions</h3><p class="mt-2 max-w-2xl text-xs leading-5 text-app-text-soft">Source-to-source assertions retain direction, extraction state, provider or source identity, retrieval time, and researcher review. Conflicts remain visible.</p></div>
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
        <section class="mt-6 border-t border-app-line pt-5">
          <div class="flex items-center justify-between gap-3"><p class="eyebrow">PDFs awaiting identification</p><span class="count-badge" id="unidentified-pdf-count">0</span></div>
          <div class="mt-3 grid gap-3 md:grid-cols-2" id="unidentified-pdf-list"><div class="empty-state">No unidentified PDFs.</div></div>
        </section>
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
