import type { ProjectFile, WorkspaceSnapshot } from "../domain/workspace";
import { escapeHtml } from "./shared";

export type ReadOnlyShareView =
  | { readonly kind: "pdf" }
  | { readonly kind: "markdown" }
  | { readonly kind: "file"; readonly file: ProjectFile };

export function resolveReadOnlyShareView(snapshot: WorkspaceSnapshot, requestedView: string | null): ReadOnlyShareView {
  if (requestedView === "markdown") return { kind: "markdown" };
  if (requestedView?.startsWith("file:")) {
    const file = snapshot.files.find((candidate) => candidate.id === requestedView.slice("file:".length));
    if (file) return { kind: "file", file };
  }
  return { kind: "pdf" };
}

export function renderReadOnlySharePage(snapshot: WorkspaceSnapshot, sharePath: string, requestedView: string | null): string {
  const view = resolveReadOnlyShareView(snapshot, requestedView);
  const files = [...snapshot.files].sort((left, right) => left.path.localeCompare(right.path));
  const pdfPath = `${sharePath}/document.pdf`;
  const selectedValue = view.kind === "file" ? `file:${view.file.id}` : view.kind;
  const fileOptions = files
    .map(
      (file) =>
        `<option value="file:${escapeHtml(file.id)}"${selectedValue === `file:${file.id}` ? " selected" : ""}>${escapeHtml(file.path)}</option>`,
    )
    .join("");
  const fileLinks = files
    .map((file) =>
      navigationLink(`?view=${encodeURIComponent(`file:${file.id}`)}`, file.path, view.kind === "file" && view.file.id === file.id),
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escapeHtml(snapshot.title)} · Read-only · Kirjolab</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
    <script type="module" src="/read-only-share.js"></script>
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased" data-share-revision="${snapshot.revision}" data-share-socket-path="${escapeHtml(`${sharePath}/socket`)}">
    <header class="border-b border-app-line bg-app-canvas">
      <div class="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5">
        <span class="font-sans text-sm font-black tracking-[-0.04em] text-app-ink">KIRJOLAB</span>
        <span class="count-badge">Read-only link</span>
      </div>
    </header>
    <main class="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8 lg:py-8">
      <aside class="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <p class="eyebrow">Shared project</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-[-0.04em] text-app-ink">${escapeHtml(snapshot.title)}</h1>
        <p class="mt-2 font-sans text-xs leading-5 text-app-text-soft"><span id="shared-live-status">Connecting · revision ${snapshot.revision}</span> · No editing or private research access</p>

        <form class="mt-5 flex gap-2 lg:hidden" method="get">
          <label class="sr-only" for="shared-view-switcher">Shared project view</label>
          <select class="workspace-switcher min-w-0 flex-1" id="shared-view-switcher" name="view">
            <optgroup label="Output">
              <option value="pdf"${selectedValue === "pdf" ? " selected" : ""}>Rendered PDF</option>
              <option value="markdown"${selectedValue === "markdown" ? " selected" : ""}>Composed Markdown</option>
            </optgroup>
            <optgroup label="Project files">${fileOptions}</optgroup>
          </select>
          <button class="button-secondary shrink-0" type="submit">View</button>
        </form>

        <nav class="mt-6 hidden border-t border-app-line lg:block" aria-label="Shared project files">
          <p class="eyebrow py-3">Output</p>
          <div class="grid gap-1">
            ${navigationLink("?view=pdf", "Rendered PDF", view.kind === "pdf")}
            ${navigationLink("?view=markdown", "Composed Markdown", view.kind === "markdown")}
          </div>
          <div class="mt-5 flex items-center justify-between border-t border-app-line py-3">
            <p class="eyebrow">Project files</p>
            <span class="count-badge">${files.length}</span>
          </div>
          <div class="grid gap-1">${fileLinks}</div>
        </nav>
      </aside>

      <section class="min-w-0 overflow-hidden border border-app-line bg-app-paper shadow-sm" aria-live="polite">
        <header class="flex min-h-16 items-center justify-between gap-4 border-b border-app-line px-5 py-3">
          <div class="min-w-0">
            <p class="eyebrow">${view.kind === "file" ? "Project file" : "Output"}</p>
            <h2 class="mt-1 truncate text-lg font-semibold text-app-ink">${escapeHtml(viewTitle(view))}</h2>
          </div>
          ${view.kind === "pdf" ? `<a class="button-secondary shrink-0" href="${escapeHtml(pdfPath)}" target="_blank" rel="noreferrer">Open PDF</a>` : ""}
        </header>
        ${renderSharedContent(view, snapshot, pdfPath)}
      </section>
    </main>
  </body>
</html>`;
}

function navigationLink(href: string, label: string, active: boolean): string {
  return `<a class="project-file-row${active ? " bg-app-accent-ghost text-app-accent-strong" : ""}" href="${escapeHtml(href)}"${active ? ' aria-current="page"' : ""}><span class="min-w-0 truncate">${escapeHtml(label)}</span>${active ? '<span class="project-file-kind">Viewing</span>' : ""}</a>`;
}

function viewTitle(view: ReadOnlyShareView): string {
  if (view.kind === "pdf") return "Rendered PDF";
  if (view.kind === "markdown") return "Composed Markdown";
  return view.file.path;
}

function renderSharedContent(view: ReadOnlyShareView, snapshot: WorkspaceSnapshot, pdfPath: string): string {
  if (view.kind === "pdf") {
    return `<div class="bg-app-pdf-surround p-3 sm:p-5">
      <iframe class="h-[75vh] min-h-[36rem] w-full border border-app-line bg-app-paper" id="shared-pdf-viewer" src="${escapeHtml(pdfPath)}" title="Rendered PDF for ${escapeHtml(snapshot.title)}">
        <p class="p-5 font-sans text-sm">Your browser cannot display this PDF. <a class="text-app-accent-strong underline" href="${escapeHtml(pdfPath)}">Open the rendered PDF</a>.</p>
      </iframe>
    </div>`;
  }
  const content = view.kind === "markdown" ? snapshot.composition.content : view.file.content;
  return `<pre class="min-h-[36rem] overflow-x-auto whitespace-pre-wrap p-5 font-serif text-sm leading-7 text-app-text sm:p-8"><code>${escapeHtml(content)}</code></pre>`;
}
