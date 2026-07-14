import type { ProjectFile, WorkspaceSnapshot } from "../domain/workspace";
import { escapeHtml } from "./shared";

export function resolveEditShareFile(snapshot: WorkspaceSnapshot, requestedFileId: string | null): ProjectFile {
  return (
    snapshot.files.find((file) => file.id === requestedFileId) ??
    snapshot.files.find((file) => file.id === snapshot.entryFileId) ??
    snapshot.files[0]!
  );
}

export function renderEditSharePage(snapshot: WorkspaceSnapshot, editPath: string, requestedFileId: string | null): string {
  const activeFile = resolveEditShareFile(snapshot, requestedFileId);
  const files = [...snapshot.files].sort((left, right) => left.path.localeCompare(right.path));
  const fileLinks = files
    .map(
      (file) =>
        `<a class="project-file-row${file.id === activeFile.id ? " bg-app-accent-ghost text-app-accent-strong" : ""}" href="?file=${encodeURIComponent(file.id)}"${file.id === activeFile.id ? ' aria-current="page"' : ""}><span class="min-w-0 truncate">${escapeHtml(file.path)}</span>${file.id === activeFile.id ? '<span class="project-file-kind">Editing</span>' : ""}</a>`,
    )
    .join("");
  const savePath = `${editPath}/files/${activeFile.id}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escapeHtml(snapshot.title)} · Edit link · Kirjolab</title>
    <link rel="stylesheet" href="/styles.css">
    <script type="module" src="/edit-share.js"></script>
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased" data-edit-revision="${snapshot.revision}" data-edit-save-path="${escapeHtml(savePath)}" data-edit-snapshot-path="${escapeHtml(`${editPath}/snapshot`)}">
    <header class="border-b border-app-line bg-app-canvas">
      <div class="mx-auto flex min-h-16 max-w-[96rem] items-center justify-between gap-4 px-5">
        <span class="font-sans text-sm font-black tracking-[-0.04em] text-app-ink">KIRJOLAB</span>
        <span class="count-badge">Edit link · anyone with this URL can change the project</span>
      </div>
    </header>
    <main class="mx-auto grid max-w-[96rem] gap-5 px-5 py-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside class="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <p class="eyebrow">Shared project</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-[-0.04em] text-app-ink">${escapeHtml(snapshot.title)}</h1>
        <p class="mt-2 font-sans text-xs leading-5 text-app-text-soft">Edits are saved to the live project. Private research, members, and project administration remain unavailable.</p>
        <div class="mt-6 flex items-center justify-between border-t border-app-line py-3">
          <p class="eyebrow">Project files</p>
          <span class="count-badge">${files.length}</span>
        </div>
        <nav class="grid gap-1" aria-label="Editable project files">${fileLinks}</nav>
      </aside>

      <section class="grid min-w-0 gap-5 xl:grid-cols-2">
        <div class="min-w-0 overflow-hidden border border-app-line bg-app-paper shadow-sm">
          <header class="flex min-h-16 items-center justify-between gap-4 border-b border-app-line px-5 py-3">
            <div class="min-w-0">
              <p class="eyebrow">Editing</p>
              <h2 class="mt-1 truncate text-lg font-semibold text-app-ink">${escapeHtml(activeFile.path)}</h2>
            </div>
            <span class="font-sans text-xs font-bold text-app-text-soft" id="edit-save-status" role="status">Saved · revision ${snapshot.revision}</span>
          </header>
          <label class="sr-only" for="edit-source">${escapeHtml(activeFile.path)} Markdown source</label>
          <textarea class="min-h-[70vh] w-full resize-y bg-app-paper p-5 font-mono text-sm leading-7 text-app-ink outline-none sm:p-7" id="edit-source" maxlength="2000000" spellcheck="true">${escapeHtml(activeFile.content)}</textarea>
        </div>

        <div class="min-w-0 overflow-hidden border border-app-line bg-app-paper shadow-sm">
          <header class="flex min-h-16 items-center justify-between gap-4 border-b border-app-line px-5 py-3">
            <div><p class="eyebrow">Output</p><h2 class="mt-1 text-lg font-semibold text-app-ink">Rendered PDF</h2></div>
            <a class="button-secondary shrink-0" href="${escapeHtml(`${editPath}/document.pdf`)}" target="_blank" rel="noreferrer">Open PDF</a>
          </header>
          <div class="bg-app-pdf-surround p-3 sm:p-5">
            <iframe class="h-[70vh] min-h-[36rem] w-full border border-app-line bg-app-paper" id="edit-pdf-viewer" src="${escapeHtml(`${editPath}/document.pdf`)}" title="Rendered PDF for ${escapeHtml(snapshot.title)}"></iframe>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
