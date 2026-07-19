import type { WorkspaceSummary } from "../domain/workspace";
import { renderProductHeader } from "./app-navigation";
import { renderReviewStudySurface } from "./review-study";
import { escapeHtml } from "./shared";

export function renderReviewsPage(
  workspaces: readonly WorkspaceSummary[],
  identityEmail = "local@kirjolab.invalid",
  identityMode: "local" | "access" = "local",
): string {
  const projects = workspaces.filter((workspace) => workspace.archivedAt === null);
  const editorHref = projects[0]?.href ?? "/editor";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Evidence reviews · Kirjolab</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased" data-app-mode="review-index">
    ${renderProductHeader("review", identityEmail, identityMode, editorHref)}
    <main class="reviews-index-shell">
      <section class="reviews-index-intro" aria-labelledby="reviews-heading">
        <div><p class="eyebrow">Evidence reviews</p><h1 id="reviews-heading">Make the method visible.</h1></div>
        <p>Systematic and multivocal reviews have their own working surface, apart from manuscript authoring.</p>
      </section>
      <section class="reviews-index-section" aria-labelledby="linked-reviews-heading">
        <header class="dashboard-section-heading">
          <div><p class="eyebrow">Available now</p><h2 id="linked-reviews-heading">Project-linked reviews</h2></div>
          <span>${projects.length} ${projects.length === 1 ? "review" : "reviews"}</span>
        </header>
        <div class="reviews-index-list">
          ${projects.length > 0 ? projects.map(renderReviewRow).join("") : '<div class="empty-state">Create a writing project before starting the current project-linked review workflow.</div>'}
        </div>
      </section>
      <aside class="reviews-model-note" aria-labelledby="reviews-model-heading">
        <p class="eyebrow">Integration direction</p>
        <h2 id="reviews-model-heading">Reviews should stand on their own.</h2>
        <p>This first pass separates the working surface. Review identity, access, and lifecycle still follow the linked writing project; independent reviews and explicit project links are the next model boundary.</p>
      </aside>
    </main>
  </body>
</html>`;
}

export function renderReviewPage(
  project: WorkspaceSummary,
  identityEmail = "local@kirjolab.invalid",
  identityMode: "local" | "access" = "local",
): string {
  const workspaceId = escapeHtml(project.id);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escapeHtml(project.title)} · Evidence review · Kirjolab</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
    <script type="module" src="/review-app.js"></script>
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased" data-app-mode="review" data-workspace-id="${workspaceId}">
    ${renderProductHeader("review", identityEmail, identityMode, project.href)}
    <div class="review-context-row">
      <span><span class="review-context-label">Linked writing project</span><strong>${escapeHtml(project.title)}</strong></span>
      <a href="${escapeHtml(project.href)}">Open in Editor <span aria-hidden="true">↗</span></a>
    </div>
    <main class="review-detail-shell">
      ${renderReviewStudySurface(project.id, project.title)}
    </main>
  </body>
</html>`;
}

function renderReviewRow(project: WorkspaceSummary): string {
  return `<a class="review-index-row" href="/review/${encodeURIComponent(project.id)}">
    <span class="review-index-mark" aria-hidden="true">R</span>
    <span><strong>${escapeHtml(project.title)}</strong><small>Evidence review · linked writing project</small></span>
    <time datetime="${escapeHtml(project.updatedAt)}">Project updated ${formatDate(project.updatedAt)}</time>
    <span aria-hidden="true">→</span>
  </a>`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(date);
}
