import type { ReferenceLibrarySnapshot } from "../domain/reference-library";
import type { WorkspaceSummary } from "../domain/workspace";
import { renderProductHeader } from "./app-navigation";
import { escapeHtml } from "./shared";

interface DashboardActivity {
  readonly kind: "Editor" | "Library";
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  readonly updatedAt: string;
}

export function renderDashboardPage(
  workspaces: readonly WorkspaceSummary[],
  library: ReferenceLibrarySnapshot | null,
  identityEmail = "local@kirjolab.invalid",
  identityMode: "local" | "access" = "local",
): string {
  const activeProjects = workspaces.filter((workspace) => workspace.archivedAt === null);
  const editorHref = activeProjects[0]?.href ?? "/editor";
  const activities = dashboardActivities(activeProjects, library);
  const artifactCount = library?.artifacts.length ?? 0;
  const referenceCount = library?.references.length ?? 0;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>Dashboard · Kirjolab</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased" data-app-mode="dashboard">
    ${renderProductHeader("dashboard", identityEmail, identityMode, editorHref)}
    <main class="dashboard-shell">
      <section class="dashboard-intro" aria-labelledby="dashboard-heading">
        <div>
          <p class="eyebrow">Research workspace</p>
          <h1 id="dashboard-heading">Pick up the thread.</h1>
          <p>Writing, evidence, and sources stay close without competing for attention.</p>
        </div>
        <div class="dashboard-actions" aria-label="Create or collect">
          <a class="button-primary" href="/editor?create=1">New project</a>
          <a class="button-secondary" href="/review">Start a review</a>
          <a class="button-secondary" href="/library">Add references</a>
        </div>
      </section>

      <section class="dashboard-section" aria-labelledby="recent-work-heading">
        <header class="dashboard-section-heading">
          <div><p class="eyebrow">Recent work</p><h2 id="recent-work-heading">Continue where you left off</h2></div>
          <a href="/editor">All projects</a>
        </header>
        <div class="dashboard-activity-list">
          ${activities.length > 0 ? activities.map(renderActivity).join("") : '<div class="empty-state">Create a writing project or add a source to begin.</div>'}
        </div>
      </section>

      <section class="dashboard-section" aria-labelledby="areas-heading">
        <header class="dashboard-section-heading">
          <div><p class="eyebrow">Work areas</p><h2 id="areas-heading">Move by intent</h2></div>
        </header>
        <div class="dashboard-area-list">
          <a class="dashboard-area-row" href="${escapeHtml(editorHref)}">
            <span class="dashboard-area-index">01</span><span><strong>Editor</strong><small>Draft, connect evidence, collaborate, and publish.</small></span><span class="dashboard-area-meta">${activeProjects.length} ${activeProjects.length === 1 ? "project" : "projects"}</span><span aria-hidden="true">→</span>
          </a>
          <a class="dashboard-area-row" href="/library">
            <span class="dashboard-area-index">02</span><span><strong>Library</strong><small>Read and organize private research material.</small></span><span class="dashboard-area-meta">${referenceCount} sources · ${artifactCount} PDFs</span><span aria-hidden="true">→</span>
          </a>
          <a class="dashboard-area-row" href="/review">
            <span class="dashboard-area-index">03</span><span><strong>Evidence reviews</strong><small>Plan, screen, extract, synthesize, and report.</small></span><span class="dashboard-area-meta">Project-linked</span><span aria-hidden="true">→</span>
          </a>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function dashboardActivities(
  workspaces: readonly WorkspaceSummary[],
  library: ReferenceLibrarySnapshot | null,
): readonly DashboardActivity[] {
  const projects: DashboardActivity[] = workspaces.map((workspace) => ({
    kind: "Editor",
    title: workspace.title,
    detail: "Writing project",
    href: workspace.href,
    updatedAt: workspace.updatedAt,
  }));
  const references: DashboardActivity[] = (library?.references ?? []).map((reference) => ({
    kind: "Library",
    title: reference.title || reference.referenceKey || "Untitled source",
    detail: [reference.authors[0], reference.year].filter(Boolean).join(" · ") || "Private source",
    href: "/library",
    updatedAt: reference.updatedAt,
  }));
  return [...projects, ...references].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8);
}

function renderActivity(activity: DashboardActivity): string {
  return `<a class="dashboard-activity-row" href="${escapeHtml(activity.href)}">
    <span class="dashboard-activity-kind">${activity.kind}</span>
    <span class="dashboard-activity-title"><strong>${escapeHtml(activity.title)}</strong><small>${escapeHtml(activity.detail)}</small></span>
    <time datetime="${escapeHtml(activity.updatedAt)}">${formatDate(activity.updatedAt)}</time>
    <span aria-hidden="true">→</span>
  </a>`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return new Intl.DateTimeFormat("en", options).format(date);
}
