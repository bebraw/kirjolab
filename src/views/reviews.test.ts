import { describe, expect, it } from "vitest";
import type { WorkspaceSummary } from "../domain/workspace";
import { renderReviewPage, renderReviewsPage } from "./reviews";

const projects: readonly WorkspaceSummary[] = [
  {
    id: "review-project",
    title: "Evidence synthesis",
    href: "/editor/review-project",
    createdAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-19T09:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "archived-project",
    title: "Archived review",
    href: "/editor/archived-project",
    createdAt: "2026-07-10T09:00:00.000Z",
    updatedAt: "2026-07-18T09:00:00.000Z",
    archivedAt: "2026-07-18T10:00:00.000Z",
  },
];

describe("review views", () => {
  it("renders the evidence-review hub from active linked projects", () => {
    const html = renderReviewsPage(projects);

    expect(html).toContain('data-app-mode="review-index"');
    expect(html).toContain('<h1 id="reviews-heading">Make the method visible.</h1>');
    expect(html).toContain('<a class="primary-navigation-link" href="/review" aria-current="page">Reviews</a>');
    expect(html).toContain('href="/review/review-project"');
    expect(html).toContain("Evidence synthesis");
    expect(html).toContain("Evidence review · linked writing project");
    expect(html).not.toContain("Archived review");
    expect(html).toContain("Reviews should stand on their own.");
    expect(html).not.toContain('<script type="module" src="/review-app.js"></script>');
    expect(html).not.toContain('id="review-protocol-form"');
  });

  it("renders a standalone review surface with explicit linked-project context", () => {
    const html = renderReviewPage(projects[0]!);

    expect(html).toContain('data-app-mode="review" data-workspace-id="review-project"');
    expect(html).toContain('<script type="module" src="/review-app.js"></script>');
    expect(html).not.toContain('<script type="module" src="/app.js"></script>');
    expect(html).toContain('<span class="review-context-label">Linked writing project</span>');
    expect(html).toContain('<a href="/editor/review-project">Open in Editor <span aria-hidden="true">↗</span></a>');
    expect(html).toContain('id="review-study-dialog"');
    expect(html).toContain('id="review-protocol-form"');
    expect(html).toContain('aria-label="Review study stages"');
    expect(html).toContain('href="/api/workspaces/review-project/review-study/export/review.zip"');
    expect(html).toContain('<a class="button-secondary" href="/review">All reviews</a>');
  });

  it("escapes project identity in the standalone review copy", () => {
    const html = renderReviewPage({ ...projects[0]!, title: `Review <script>`, href: `/editor/review-project?file="draft"` });

    expect(html).toContain("Review &lt;script&gt;");
    expect(html).not.toContain("Review <script>");
    expect(html).toContain('href="/editor/review-project?file=&quot;draft&quot;"');
  });
});
