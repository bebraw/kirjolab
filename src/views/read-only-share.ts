import type { WorkspaceSnapshot } from "../domain/workspace";
import { escapeHtml } from "./shared";

export function renderReadOnlySharePage(snapshot: WorkspaceSnapshot): string {
  const files = snapshot.files
    .map(
      (file) => `<details class="border-b border-app-line py-3">
        <summary class="cursor-pointer font-sans text-xs font-bold text-app-ink">${escapeHtml(file.path)}</summary>
        <pre class="mt-3 overflow-x-auto whitespace-pre-wrap bg-app-surface p-4 text-xs leading-5"><code>${escapeHtml(file.content)}</code></pre>
      </details>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escapeHtml(snapshot.title)} · Read-only · Kirjolab</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased">
    <header class="border-b border-app-line bg-app-canvas">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <span class="font-sans text-sm font-black tracking-[-0.04em] text-app-ink">KIRJOLAB</span>
        <span class="count-badge">Read-only link</span>
      </div>
    </header>
    <main class="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <article class="min-w-0 border border-app-line bg-app-paper p-6 shadow-sm sm:p-10">
        <p class="eyebrow">Shared manuscript</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-[-0.04em] text-app-ink">${escapeHtml(snapshot.title)}</h1>
        <p class="mt-2 font-sans text-xs text-app-text-soft">Live view · revision ${snapshot.revision}</p>
        <pre class="mt-8 whitespace-pre-wrap font-serif text-base leading-7 text-app-text"><code>${escapeHtml(snapshot.composition.content)}</code></pre>
      </article>
      <aside class="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <p class="eyebrow">Project source</p>
        <h2 class="mt-1 text-lg font-semibold text-app-ink">Files</h2>
        <p class="mt-2 font-sans text-xs leading-5 text-app-text-soft">You can inspect the composed Markdown and its source files, but this link cannot edit them or access private research.</p>
        <div class="mt-4">${files}</div>
      </aside>
    </main>
  </body>
</html>`;
}
