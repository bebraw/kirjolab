import { escapeHtml } from "../html";

export function renderPdfSharePage(share: { readonly name: string; readonly createdAt: string }, sharePath: string): string {
  const title = escapeHtml(share.name);
  const pdfPath = escapeHtml(`${sharePath}/document.pdf`);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="robots" content="noindex, nofollow">
    <title>${title} · Kirjolab</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased">
    <main class="mx-auto max-w-7xl p-4 sm:p-6">
      <header class="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <p class="eyebrow">Kirjolab · Shared PDF</p>
          <h1 class="mt-1 break-words text-2xl font-semibold tracking-[-0.035em]">${title}</h1>
          <p class="mt-2 text-sm text-app-text-soft">Annotated copy shared <time datetime="${escapeHtml(share.createdAt)}">${escapeHtml(share.createdAt.slice(0, 10))}</time>.</p>
        </div>
        <nav class="flex flex-wrap gap-2" aria-label="PDF actions">
          <a class="button-secondary" href="${pdfPath}" target="_blank" rel="noopener noreferrer">Open PDF</a>
          <a class="button-primary" href="${pdfPath}?download=1">Download PDF</a>
        </nav>
      </header>
      <iframe class="h-[75vh] w-full rounded-lg border border-app-line bg-app-surface" src="${pdfPath}" title="Shared annotated PDF"></iframe>
      <p class="mt-3 text-sm text-app-text-soft">If the preview or a comment is unavailable in your browser, download the PDF and open it in your PDF reader.</p>
    </main>
  </body>
</html>`;
}
