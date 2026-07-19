import type { ReviewProjectLinkView } from "../api/reviews";
import type { ReviewMember, ReviewSummary } from "../domain/review-catalog";
import type { WorkspaceSummary } from "../domain/workspace";
import { renderProductHeader } from "./app-navigation";
import { renderReviewStudySurface } from "./review-study";
import { escapeHtml } from "./shared";

export function renderReviewsPage(
  reviews: readonly ReviewSummary[],
  identityEmail = "local@kirjolab.invalid",
  identityMode: "local" | "access" = "local",
): string {
  const activeReviews = reviews.filter((review) => review.archivedAt === null);
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
    ${renderProductHeader("review", identityEmail, identityMode)}
    <main class="reviews-index-shell">
      <section class="reviews-index-intro" aria-labelledby="reviews-heading">
        <div><p class="eyebrow">Independent evidence reviews</p><h1 id="reviews-heading">Keep the method reusable.</h1></div>
        <p>Systematic and multivocal reviews have their own identity, collaborators, and lifecycle. Connect them to writing projects only when the evidence is ready to travel.</p>
      </section>
      <section class="review-create-panel" aria-labelledby="create-review-heading">
        <div><p class="eyebrow">New review</p><h2 id="create-review-heading">Start with a method and a name.</h2><p>The review stays independent until you explicitly link a writing project.</p></div>
        <form class="review-create-form" method="post" action="/review">
          <label class="field-label" for="new-review-title">Review title<input class="field" id="new-review-title" name="title" maxlength="120" required placeholder="Evidence synthesis"></label>
          <label class="field-label" for="new-review-profile">Method<select class="field" id="new-review-profile" name="profile"><option value="slr">Systematic literature review</option><option value="mlr">Multivocal literature review</option></select></label>
          <button class="button-primary" type="submit">Create review</button>
        </form>
      </section>
      <section class="reviews-index-section" aria-labelledby="independent-reviews-heading">
        <header class="dashboard-section-heading">
          <div><p class="eyebrow">Your review catalog</p><h2 id="independent-reviews-heading">Independent reviews</h2></div>
          <span>${activeReviews.length} active · ${reviews.length} total</span>
        </header>
        <div class="reviews-index-list">
          ${reviews.length > 0 ? reviews.map(renderReviewRow).join("") : '<div class="empty-state">No reviews yet. Create one above; a writing project is optional.</div>'}
        </div>
      </section>
      <aside class="reviews-model-note" aria-labelledby="reviews-model-heading">
        <p class="eyebrow">Project integration</p>
        <h2 id="reviews-model-heading">Connections are explicit.</h2>
        <p>A review can inform several manuscripts, and a manuscript can draw from several reviews. Linking never grants access automatically; publication stays revision-pinned and deliberate.</p>
      </aside>
    </main>
  </body>
</html>`;
}

export function renderReviewPage(
  review: ReviewSummary,
  members: readonly ReviewMember[],
  projectLinks: readonly ReviewProjectLinkView[],
  identityEmail = "local@kirjolab.invalid",
  identityMode: "local" | "access" = "local",
  linkableProjects: readonly WorkspaceSummary[] = [],
): string {
  const reviewId = escapeHtml(review.id);
  const activeAccessibleProject = projectLinks.find(
    (link) => link.status === "active" && link.permission === "available" && link.project !== null,
  )?.project;
  const editorHref = activeAccessibleProject?.href ?? "/editor";
  const activeProjectIds = new Set(projectLinks.filter((link) => link.status === "active").map((link) => link.workspaceId));
  const availableProjects = linkableProjects.filter((project) => project.archivedAt === null && !activeProjectIds.has(project.id));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${escapeHtml(review.title)} · Evidence review · Kirjolab</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/styles.css">
    <script type="module" src="/review-app.js"></script>
  </head>
  <body class="min-h-screen bg-app-canvas text-app-text antialiased" data-app-mode="review" data-review-id="${reviewId}">
    ${renderProductHeader("review", identityEmail, identityMode, editorHref)}
    <main class="review-detail-shell">
      <section class="review-resource-context" aria-labelledby="review-resource-heading">
        <div class="review-resource-heading">
          <div><p class="eyebrow">${formatProfile(review.profile)}</p><h1 id="review-resource-heading">${escapeHtml(review.title)}</h1></div>
          <div class="review-resource-facts"><span class="count-badge">${review.archivedAt === null ? "Active" : "Archived"}</span><span>${formatRole(review.role)}</span>${renderMemberContext(members)}</div>
        </div>
        <div class="review-project-context">
          <header><div><p class="eyebrow">Writing projects</p><h2>Explicit project links</h2></div><span>${projectLinks.filter((link) => link.status === "active").length} active</span></header>
          ${review.role === "owner" ? renderProjectLinkForm(review.id, availableProjects) : ""}
          <div class="review-project-link-list" id="review-project-links">
            ${projectLinks.length > 0 ? projectLinks.map(renderProjectLink).join("") : '<div class="empty-state">No writing projects linked. The review remains fully usable on its own.</div>'}
          </div>
        </div>
      </section>
      ${renderReviewStudySurface(review, projectLinks)}
    </main>
  </body>
</html>`;
}

function renderReviewRow(review: ReviewSummary): string {
  const lifecycle = review.archivedAt === null ? "Active" : "Archived";
  return `<a class="review-index-row" href="${escapeHtml(review.href)}">
    <span class="review-index-mark" aria-hidden="true">${review.profile === "slr" ? "S" : "M"}</span>
    <span><strong>${escapeHtml(review.title)}</strong><small>${formatProfile(review.profile)} · ${formatRole(review.role)} · ${lifecycle}</small></span>
    <time datetime="${escapeHtml(review.updatedAt)}">Updated ${formatDate(review.updatedAt)}</time>
    <span aria-hidden="true">→</span>
  </a>`;
}

function renderMemberContext(members: readonly ReviewMember[]): string {
  return `<details class="review-member-context"><summary>${members.length} ${members.length === 1 ? "member" : "members"}</summary><div>${members
    .map(
      (member) =>
        `<span><strong>${escapeHtml(member.email)}</strong><small>${formatRole(member.role)} · joined ${formatDate(member.addedAt)}</small></span>`,
    )
    .join("")}</div></details>`;
}

function renderProjectLink(link: ReviewProjectLinkView): string {
  const projectTitle = link.project?.title ?? "Linked project";
  const status =
    link.status === "unlinked"
      ? `Unlinked${link.unlinkedAt ? ` ${formatDate(link.unlinkedAt)}` : ""}`
      : link.permission === "available"
        ? "Active link"
        : "Project access required";
  const action =
    link.status === "active" && link.permission === "available" && link.project
      ? `<a href="${escapeHtml(link.project.href)}">Open in Editor <span aria-hidden="true">↗</span></a>`
      : `<span class="review-project-link-state">${status}</span>`;
  return `<article class="review-project-link-row" data-link-status="${link.status}" data-project-permission="${link.permission}">
    <span><strong>${escapeHtml(projectTitle)}</strong><small>${escapeHtml(status)} · linked ${formatDate(link.createdAt)}</small></span>
    ${action}
  </article>`;
}

function renderProjectLinkForm(reviewId: string, projects: readonly WorkspaceSummary[]): string {
  const disabled = projects.length === 0;
  return `<form class="review-project-link-form" method="post" action="/review/${encodeURIComponent(reviewId)}/project-links">
    <label class="field-label" for="review-link-project">Add writing project<select class="field" id="review-link-project" name="workspaceId"${disabled ? " disabled" : ""}>${
      disabled
        ? '<option value="">No unlinked projects available</option>'
        : projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title)}</option>`).join("")
    }</select></label>
    <button class="button-secondary" type="submit"${disabled ? " disabled" : ""}>Link project</button>
  </form>`;
}

function formatProfile(profile: ReviewSummary["profile"]): string {
  return profile === "slr" ? "Systematic literature review" : "Multivocal literature review";
}

function formatRole(role: ReviewSummary["role"]): string {
  return role === "owner" ? "Owner" : "Member";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
