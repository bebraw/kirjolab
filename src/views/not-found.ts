import { escapeHtml } from "./shared";

export function renderNotFoundPage(pathname: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Not found · Kirjolab</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased">
    <header class="border-b border-app-line bg-app-canvas">
      <div class="mx-auto flex min-h-16 max-w-2xl items-center px-5">
        <a class="font-sans text-sm font-black tracking-[-0.04em] text-app-ink" href="/">KIRJOLAB</a>
      </div>
    </header>
    <main class="mx-auto max-w-2xl px-5 py-16">
      <p class="eyebrow">404 · Not Found</p>
      <h1 class="mt-2 text-4xl font-semibold tracking-[-0.04em] text-app-ink">This page is outside the project.</h1>
      <p class="mt-4 max-w-lg font-sans text-sm leading-6 text-app-text-soft">No view is defined for <code class="break-words text-app-text">${escapeHtml(pathname)}</code>. It may have moved, or the link may be incomplete.</p>
      <a class="button-primary mt-8" href="/">Return to Kirjolab</a>
    </main>
  </body>
</html>`;
}
