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
          <label class="sr-only" for="workspace-switcher">Current workspace</label>
          <select class="workspace-switcher" id="workspace-switcher"><option value="${escapedWorkspaceId}">Loading workspace…</option></select>
          <button class="button-icon shrink-0" id="new-workspace" type="button" title="Create workspace" aria-label="Create workspace">＋</button>
          <p class="hidden truncate text-sm text-app-text-soft xl:block" id="workspace-title">Evidence becomes prose</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="hidden max-w-44 truncate font-sans text-xs text-app-text-soft 2xl:inline" title="${escapedIdentityEmail}">${escapedIdentityEmail}</span>
          <div class="flex items-center gap-2 text-xs text-app-text-soft" aria-live="polite">
            <span class="h-2 w-2 rounded-full bg-app-warn" id="connection-dot"></span>
            <span id="connection-status">Connecting</span>
          </div>
          <button class="button-secondary hidden sm:inline-flex" id="share-workspace" type="button">Share</button>
          <a class="button-secondary hidden sm:inline-flex" href="/api/workspaces/${escapedWorkspaceId}/export/bibliography.bib">Export .bib</a>
          <a class="button-primary" href="/api/workspaces/${escapedWorkspaceId}/export/document.md">Export .md</a>
        </div>
      </div>
    </header>

    <main class="workspace-grid min-h-[calc(100vh-4rem)]" id="workspace-surfaces" data-active-surface="authoring">
      <nav class="surface-switcher" aria-label="Workspace surface">
        <button class="surface-switch" id="show-authoring-surface" type="button" aria-controls="authoring-surface" aria-pressed="true">Authoring</button>
        <button class="surface-switch" id="show-context-surface" type="button" aria-controls="context-surface" aria-pressed="false">Context</button>
      </nav>
      <aside class="source-rail border-b border-app-line bg-app-paper px-4 py-5 lg:border-r lg:border-b-0 lg:px-5">
        <div class="flex items-end justify-between gap-3">
          <div>
            <p class="eyebrow">Source shelf</p>
            <h1 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Evidence</h1>
          </div>
          <label class="button-icon" title="Import a PDF">
            <span aria-hidden="true">＋</span>
            <span class="sr-only">Import PDF</span>
            <input class="sr-only" id="pdf-upload" type="file" accept="application/pdf">
          </label>
        </div>
        <p class="mt-3 text-sm leading-6 text-app-text-soft">Import a paper, select evidence in place, then carry its durable anchor into the draft.</p>
        <form class="mt-4 flex gap-2" id="knowledge-search-form" role="search">
          <label class="sr-only" for="knowledge-search-input">Search this workspace</label>
          <input class="field min-w-0" id="knowledge-search-input" type="search" maxlength="200" placeholder="Search this workspace">
          <button class="button-secondary shrink-0" type="submit">Find</button>
        </form>
        <div class="mt-3 hidden space-y-2" id="knowledge-search-results" aria-live="polite"></div>
        <div class="mt-5 space-y-2" id="pdf-list">
          <div class="empty-state">No paper imported yet.</div>
        </div>
        <section class="mt-6 border-t border-app-line pt-5">
          <div class="flex items-center justify-between gap-3">
            <p class="eyebrow">Annotations</p>
            <span class="count-badge" id="annotation-count">0</span>
          </div>
          <div class="mt-3 space-y-3" id="annotation-list">
            <div class="empty-state">Annotations appear here with their source context.</div>
          </div>
        </section>
        <section class="mt-6 border-t border-app-line pt-5">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <p class="eyebrow">Claims</p>
              <span class="count-badge" id="claim-count">0</span>
            </div>
            <button class="button-secondary" id="new-claim" type="button">New claim</button>
          </div>
          <p class="mt-2 text-xs leading-5 text-app-text-soft">Synthesize annotations into propositions, then connect them to prose.</p>
          <div class="mt-3 space-y-3" id="claim-list">
            <div class="empty-state">Evidence-backed claims appear here.</div>
          </div>
        </section>
        <section class="mt-6 border-t border-app-line pt-5">
          <div class="flex items-center justify-between gap-3">
            <p class="eyebrow">References</p>
            <span class="count-badge" id="publication-count">0</span>
          </div>
          <label class="button-secondary mt-3 w-full justify-center">
            Import BibTeX
            <input class="sr-only" id="bibliography-upload" type="file" accept=".bib,application/x-bibtex,text/plain">
          </label>
          <div class="mt-3 space-y-3" id="publication-list">
            <div class="empty-state">Imported references appear here as stable publication resources.</div>
          </div>
        </section>
        <section class="mt-6 border-t border-app-line pt-5">
          <div class="flex items-center justify-between gap-3">
            <p class="eyebrow">Connections</p>
            <span class="count-badge" id="connection-count">0</span>
          </div>
          <p class="mt-2 text-xs leading-5 text-app-text-soft">Follow typed links through the scholarly record.</p>
          <div class="mt-3 space-y-2" id="knowledge-connection-list">
            <div class="empty-state">Citations and evidence links appear here.</div>
          </div>
        </section>
      </aside>

      <section class="editor-column min-w-0 border-b border-app-line bg-app-surface lg:border-r lg:border-b-0" id="authoring-surface">
        <div class="flex h-12 items-center justify-between border-b border-app-line px-4">
          <div class="flex items-center gap-2">
            <span class="eyebrow">Manuscript</span>
            <span class="count-badge" id="revision-badge">r0</span>
          </div>
          <div class="flex items-center gap-2">
            <button class="button-secondary" id="open-source-citation" type="button" disabled>Open reference</button>
            <p class="text-xs text-app-text-soft" id="save-status">Loading source…</p>
          </div>
        </div>
        <label class="sr-only" for="source-editor">Markdown source</label>
        <textarea class="source-editor" id="source-editor" spellcheck="true" aria-describedby="editor-help"></textarea>
        <p class="sr-only" id="editor-help">Collaborative Markdown source. Select text to link it to an annotation.</p>
        <details class="border-t border-app-line bg-app-paper/60">
          <summary class="cursor-pointer px-4 py-3 font-sans text-xs font-bold uppercase tracking-[0.14em] text-app-text-soft">Bibliography source</summary>
          <label class="sr-only" for="bibliography-editor">BibTeX bibliography</label>
          <textarea class="bibliography-editor" id="bibliography-editor" spellcheck="false"></textarea>
        </details>
      </section>

      <section class="context-column preview-column min-w-0 bg-app-paper" id="context-surface" aria-label="Research context">
        <div class="context-tabs" id="context-tabs">
          <div class="context-tab-list" id="context-tab-list" role="tablist" aria-label="Research context">
            <button class="context-tab" id="context-preview-tab" type="button" role="tab" aria-controls="context-preview-panel" aria-selected="true" tabindex="0">Preview</button>
            <div class="context-resource-tabs" id="context-resource-tabs" role="presentation"></div>
          </div>
          <div class="context-tab-controls" aria-label="Active context actions">
            <button id="pin-active-context" type="button" disabled>Pin</button>
            <button id="close-active-context" type="button" disabled>Close</button>
          </div>
        </div>

        <section class="context-panel context-preview-panel" id="context-preview-panel" role="tabpanel" aria-labelledby="context-preview-tab" tabindex="0">
          <div class="flex h-12 items-center justify-between border-b border-app-line px-5">
            <p class="eyebrow">Manuscript preview</p>
            <span class="text-xs text-app-text-soft" id="diagnostic-summary">Validating…</span>
          </div>
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
          <header class="context-resource-header">
            <div class="min-w-0">
              <p class="truncate font-sans text-sm font-bold" id="paper-title">Paper</p>
              <p class="mt-0.5 font-sans text-xs text-app-text-soft" id="paper-status">Loading PDF…</p>
            </div>
            <div class="flex items-center gap-2">
              <button class="button-secondary" id="previous-paper-page" type="button" aria-label="Previous PDF page">←</button>
              <span class="min-w-16 text-center font-sans text-xs text-app-text-soft" id="paper-page-indicator">– / –</span>
              <button class="button-secondary" id="next-paper-page" type="button" aria-label="Next PDF page">→</button>
              <button class="button-secondary" id="close-paper" type="button">Close</button>
            </div>
          </header>
          <div class="context-pdf-body">
            <div class="pdf-reader" id="paper-reader">
              <div class="pdf-page" id="paper-page">
                <canvas class="block" id="paper-canvas"></canvas>
                <div class="pdf-highlights" id="paper-highlights"></div>
                <div class="textLayer" id="paper-text-layer"></div>
              </div>
            </div>
            <aside class="annotation-composer" aria-labelledby="annotation-composer-title">
              <section class="publication-intake" id="publication-intake" aria-labelledby="publication-intake-heading">
                <div>
                  <p class="eyebrow">Reference intake</p>
                  <h2 class="mt-1 text-lg font-semibold tracking-[-0.035em]" id="publication-intake-heading">Identify this paper</h2>
                </div>
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
              </section>
              <div>
                <p class="eyebrow">Evidence capture</p>
                <h2 class="mt-1 text-lg font-semibold tracking-[-0.035em]" id="annotation-composer-title">Annotate this paper</h2>
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
                  <textarea class="field min-h-20" id="annotation-quote" required placeholder="Select a passage in the paper"></textarea>
                </label>
                <label class="field-label">Text before
                  <input class="field" id="annotation-prefix" type="text" placeholder="Context before selection">
                </label>
                <label class="field-label">Text after
                  <input class="field" id="annotation-suffix" type="text" placeholder="Context after selection">
                </label>
                <div class="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                  <button class="button-primary justify-center" type="submit">Save annotation</button>
                  <button class="button-secondary justify-center" id="save-and-link-annotation" type="submit">Save &amp; link selected prose</button>
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

      <aside class="workbench border-t border-app-line bg-app-canvas px-4 py-5 lg:col-span-3 lg:px-6">
        <div class="mx-auto max-w-5xl">
          <section>
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p class="eyebrow">Local model lab</p>
                <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Propose, inspect, apply</h2>
              </div>
              <p class="max-w-lg text-xs leading-5 text-app-text-soft">The selected passage, revision instruction, chosen evidence, and configured model identifier are sent from your browser to the local OpenAI-compatible endpoint. No other manuscript text is sent. The proposed replacement stays separate for review in Context.</p>
            </div>
            <div class="model-lab-fields">
              <label class="field-label">Endpoint
                <input class="field" id="llm-endpoint" type="url" value="http://127.0.0.1:1234/v1/chat/completions">
              </label>
              <label class="field-label">Model
                <input class="field" id="llm-model" type="text" value="local-model">
              </label>
              <label class="field-label model-instruction-field" for="model-instruction">Revision instruction
                <textarea class="field model-instruction" id="model-instruction" maxlength="4000" rows="2">Improve clarity while preserving the claim and citation syntax.</textarea>
              </label>
              <button class="button-primary model-generate-action justify-center" id="generate-candidate" type="button">Draft revision</button>
            </div>
            <p class="mt-3 text-sm text-app-text-soft" id="model-status" role="status" aria-live="polite">Select manuscript text and at least one annotation or claim to ground the request.</p>
            <div class="mt-4" id="candidate-list">
              <div class="empty-state">Grounded revisions open in Context and remain separate from the manuscript until you apply one.</div>
            </div>
          </section>
        </div>
      </aside>
    </main>

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
