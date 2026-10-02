import { renderProductHeader } from "./app-navigation";

export function renderProjectCreationPage(identityEmail: string, identityMode: "local" | "access", githubAvailable: boolean): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>New project · Kirjolab</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased" data-app-mode="project-creation" data-github-capability="${githubAvailable ? "enabled" : "disabled"}">
    ${renderProductHeader("editor", identityEmail, identityMode)}
    <main class="creation-shell">
      <project-starting-point-browser standalone><p class="ui-status" role="status">Loading project starting points…</p></project-starting-point-browser>
      <noscript>Enable JavaScript to preview your starting point and create a project.</noscript>
    </main>
    <app-toast class="toast" id="toast" role="status" aria-live="polite" popover="manual"></app-toast>
    <script type="module" src="/app.js"></script>
  </body>
</html>`;
}
