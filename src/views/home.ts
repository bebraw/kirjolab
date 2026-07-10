import { escapeHtml } from "./shared";

const appTitle = "vibe-template Worker";
const appDescription = "A runnable Cloudflare Worker baseline with a route index, a health probe, and room for real feature work.";

export function renderHomePage(routes: Array<{ path: string; purpose: string }>): string {
  const routeList = routes
    .map(
      (route) =>
        `<li>
          <a class="group flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0" href="${escapeHtml(route.path)}">
            <div>
              <code class="text-sm font-semibold tracking-[0.02em] text-app-accent-strong">${escapeHtml(route.path)}</code>
              <p class="mt-2 max-w-2xl leading-7 text-app-text-soft">${escapeHtml(route.purpose)}</p>
            </div>
            <span class="pt-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-app-text-soft transition group-hover:text-app-accent">Open</span>
          </a>
        </li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(appTitle)}</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased">
    <main class="mx-auto w-[min(46rem,calc(100vw-2rem))] py-12 sm:py-16">
      <article class="space-y-10">
        <section>
          <p class="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-app-accent">Starter Surface</p>
          <h1 class="max-w-[10ch] text-5xl leading-[0.92] font-semibold tracking-[-0.055em] sm:text-7xl">${escapeHtml(appTitle)}</h1>
          <p class="mt-5 max-w-2xl text-lg leading-8 text-app-text-soft">${escapeHtml(appDescription)}</p>
        </section>
        <section class="rounded-[1.6rem] border border-app-line/90 bg-app-surface/90 p-3 shadow-panel">
          <a class="group flex items-center justify-between gap-4 rounded-[1.2rem] border border-app-line/80 bg-white/78 px-5 py-4 transition hover:border-app-accent/35 hover:bg-app-accent-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40" href="/api/health">
            <div>
              <p class="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-app-text-soft">Primary Check</p>
              <p class="mt-2 text-xl font-semibold tracking-[-0.03em] text-app-text">/api/health</p>
            </div>
            <span class="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-app-accent transition group-hover:text-app-accent-strong">Open JSON</span>
          </a>
          <p class="px-2 pt-3 text-sm leading-6 text-app-text-soft">Use the health probe to confirm the Worker is live, then replace this stub with the feature you actually want to ship.</p>
        </section>
        <section class="border-y border-app-line/90 py-4">
          <div class="mb-4 flex items-end justify-between gap-4">
            <h2 class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-app-text-soft">Route Index</h2>
            <p class="text-sm text-app-text-soft">Shipped with the starter</p>
          </div>
          <ul class="divide-y divide-app-line/90">${routeList}</ul>
        </section>
        <section class="space-y-4">
          <div class="border-t border-app-line pt-4">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-app-text-soft">What ships</p>
            <p class="mt-2 leading-7 text-app-text-soft">Server-rendered HTML, generated Tailwind CSS, and a JSON health endpoint. Enough surface area to run tests immediately without carrying a heavy starter shell.</p>
          </div>
          <div class="border-t border-app-line pt-4">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-app-text-soft">What to replace</p>
            <p class="mt-2 leading-7 text-app-text-soft">Swap the route index and starter copy for your real feature work, then update the relevant spec and keep the quality gate green.</p>
          </div>
        </section>
      </article>
    </main>
  </body>
</html>`;
}
