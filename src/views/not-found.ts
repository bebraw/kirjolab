import { escapeHtml } from "./shared";

export function renderNotFoundPage(pathname: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Not Found</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  </head>
  <body>
    <h1>Not Found</h1>
    <p>No route is defined for <code>${escapeHtml(pathname)}</code>.</p>
  </body>
</html>`;
}
