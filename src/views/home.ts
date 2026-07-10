import { escapeHtml } from "./shared";

export function renderHomePage(routes: Array<{ path: string; purpose: string }>): string {
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
  <body class="min-h-screen bg-app-canvas text-app-text antialiased">
    <header class="sticky top-0 z-30 border-b border-app-line bg-app-canvas/95 backdrop-blur">
      <div class="flex min-h-16 items-center justify-between gap-4 px-4 lg:px-6">
        <div class="flex min-w-0 items-baseline gap-4">
          <a class="font-sans text-sm font-black tracking-[-0.04em] text-app-ink" href="/">KIRJOLAB</a>
          <span class="hidden h-4 w-px bg-app-line sm:block"></span>
          <p class="truncate text-sm text-app-text-soft" id="workspace-title">Evidence becomes prose</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 text-xs text-app-text-soft" aria-live="polite">
            <span class="h-2 w-2 rounded-full bg-app-warn" id="connection-dot"></span>
            <span id="connection-status">Connecting</span>
          </div>
          <a class="button-secondary hidden sm:inline-flex" href="/api/workspaces/demo/export/bibliography.bib">Export .bib</a>
          <a class="button-primary" href="/api/workspaces/demo/export/document.md">Export .md</a>
        </div>
      </div>
    </header>

    <main class="workspace-grid min-h-[calc(100vh-4rem)]">
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
      </aside>

      <section class="editor-column min-w-0 border-b border-app-line bg-app-surface lg:border-r lg:border-b-0">
        <div class="flex h-12 items-center justify-between border-b border-app-line px-4">
          <div class="flex items-center gap-2">
            <span class="eyebrow">Manuscript</span>
            <span class="count-badge" id="revision-badge">r0</span>
          </div>
          <p class="text-xs text-app-text-soft" id="save-status">Loading source…</p>
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

      <section class="preview-column min-w-0 bg-app-paper">
        <div class="flex h-12 items-center justify-between border-b border-app-line px-5">
          <p class="eyebrow">Fast preview</p>
          <span class="text-xs text-app-text-soft" id="diagnostic-summary">Validating…</span>
        </div>
        <div class="preview-scroll">
          <article class="prose-preview" id="preview" aria-live="polite"></article>
          <div class="mx-auto mt-8 max-w-[44rem] border-t border-app-line pt-4" id="diagnostics"></div>
        </div>
      </section>

      <aside class="workbench border-t border-app-line bg-app-canvas px-4 py-5 lg:col-span-3 lg:px-6">
        <div class="grid gap-6 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(28rem,1.2fr)]">
          <section>
            <div class="flex items-end justify-between gap-3">
              <div>
                <p class="eyebrow">PDF evidence capture</p>
                <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Select, annotate, connect</h2>
              </div>
              <button class="button-secondary" id="open-paper" type="button" disabled>Open paper</button>
            </div>
            <p class="mt-3 text-sm leading-6 text-app-text-soft" id="annotation-selection-status">Open a paper and select its text. Page, quotation, context, and geometry will be captured here.</p>
            <form class="mt-4 grid gap-3 sm:grid-cols-2" id="annotation-form">
              <label class="field-label sm:col-span-2">Paper
                <select class="field" id="annotation-pdf" required><option value="">Import a PDF first</option></select>
              </label>
              <label class="field-label">Page
                <input class="field" id="annotation-page" type="number" min="1" value="1" required>
              </label>
              <label class="field-label">Your note
                <input class="field" id="annotation-comment" type="text" placeholder="Why this matters">
              </label>
              <label class="field-label sm:col-span-2">Exact quotation
                <textarea class="field min-h-24" id="annotation-quote" required placeholder="Paste the selected passage"></textarea>
              </label>
              <label class="field-label">Text before
                <input class="field" id="annotation-prefix" type="text" placeholder="Context before selection">
              </label>
              <label class="field-label">Text after
                <input class="field" id="annotation-suffix" type="text" placeholder="Context after selection">
              </label>
              <button class="button-primary justify-center sm:col-span-2" type="submit">Save evidence annotation</button>
            </form>
          </section>

          <section class="border-t border-app-line pt-5 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p class="eyebrow">Local model lab</p>
                <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Propose, inspect, apply</h2>
              </div>
              <p class="max-w-md text-xs leading-5 text-app-text-soft">The browser calls your local OpenAI-compatible endpoint. Kirjolab stores only the resulting review candidate and its provenance.</p>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-[1fr_0.65fr_auto]">
              <label class="field-label">Endpoint
                <input class="field" id="llm-endpoint" type="url" value="http://127.0.0.1:1234/v1/chat/completions">
              </label>
              <label class="field-label">Model
                <input class="field" id="llm-model" type="text" value="local-model">
              </label>
              <button class="button-primary self-end justify-center" id="generate-candidate" type="button">Draft revision</button>
            </div>
            <p class="mt-3 text-sm text-app-text-soft" id="model-status">Select manuscript text and at least one annotation to ground the request.</p>
            <div class="mt-4" id="candidate-list">
              <div class="empty-state">Model candidates remain separate from the manuscript until you apply one.</div>
            </div>
          </section>
        </div>
      </aside>
    </main>

    <dialog class="paper-dialog" id="paper-dialog">
      <div class="flex h-full flex-col">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-app-line px-4 py-3">
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
        </div>
        <div class="pdf-reader min-h-0 flex-1" id="paper-reader">
          <div class="pdf-page" id="paper-page">
            <canvas class="block" id="paper-canvas"></canvas>
            <div class="pdf-highlights" id="paper-highlights"></div>
            <div class="textLayer" id="paper-text-layer"></div>
          </div>
        </div>
      </div>
    </dialog>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <footer class="sr-only">${routes.map((route) => `${escapeHtml(route.path)} ${escapeHtml(route.purpose)}`).join(" · ")}</footer>
  </body>
</html>`;
}
