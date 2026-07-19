import { describe, expect, it } from "vitest";
import type { ReviewProjectLinkView } from "../api/reviews";
import type { ReviewMember, ReviewSummary } from "../domain/review-catalog";
import type { WorkspaceSummary } from "../domain/workspace";
import { renderReviewPage, renderReviewsPage } from "./reviews";

const reviewId = "11111111-1111-4111-8111-111111111111";
const reviews: readonly ReviewSummary[] = [
  {
    id: reviewId,
    title: "Evidence synthesis",
    profile: "slr",
    href: `/review/${reviewId}`,
    role: "owner",
    createdAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-19T09:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Archived review",
    profile: "mlr",
    href: "/review/22222222-2222-4222-8222-222222222222",
    role: "member",
    createdAt: "2026-07-10T09:00:00.000Z",
    updatedAt: "2026-07-18T09:00:00.000Z",
    archivedAt: "2026-07-18T10:00:00.000Z",
  },
];

const members: readonly ReviewMember[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    email: "owner@example.test",
    role: "owner",
    addedAt: "2026-07-17T09:00:00.000Z",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    email: "member@example.test",
    role: "member",
    addedAt: "2026-07-18T09:00:00.000Z",
  },
];

const projectLinks: readonly ReviewProjectLinkView[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    reviewId,
    workspaceId: "writing-project",
    createdBy: "owner@example.test",
    createdAt: "2026-07-18T09:00:00.000Z",
    status: "active",
    unlinkedAt: null,
    unlinkedBy: null,
    project: { id: "writing-project", title: "Writing project", href: "/editor/writing-project" },
    permission: "available",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    reviewId,
    workspaceId: "private-project-identity",
    createdBy: "another@example.test",
    createdAt: "2026-07-18T10:00:00.000Z",
    status: "active",
    unlinkedAt: null,
    unlinkedBy: null,
    project: null,
    permission: "project-access-required",
  },
];

const linkableProjects: readonly WorkspaceSummary[] = [
  {
    id: "writing-project",
    title: "Writing project",
    href: "/editor/writing-project",
    createdAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-19T09:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "second-manuscript",
    title: "Second manuscript",
    href: "/editor/second-manuscript",
    createdAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-19T09:00:00.000Z",
    archivedAt: null,
  },
];

describe("review views", () => {
  it("renders an independent review catalog with a normal creation form", () => {
    const html = renderReviewsPage(reviews);

    expect(html).toContain('data-app-mode="review-index"');
    expect(html).toContain('<h1 id="reviews-heading">Keep the method reusable.</h1>');
    expect(html).toContain('<a class="primary-navigation-link" href="/review" aria-current="page">Reviews</a>');
    expect(html).toContain('method="post" action="/review"');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="profile"');
    expect(html).toContain(`href="/review/${reviewId}"`);
    expect(html).toContain("Evidence synthesis");
    expect(html).toContain("Archived review");
    expect(html).toContain("Connections are explicit.");
    expect(html).not.toContain('<script type="module" src="/review-app.js"></script>');
    expect(html).not.toContain('id="review-protocol-form"');
  });

  it("renders independent review context, permission-safe project rows, and canonical exports", () => {
    const html = renderReviewPage(reviews[0]!, members, projectLinks, undefined, undefined, linkableProjects);

    expect(html).toContain(`data-app-mode="review" data-review-id="${reviewId}"`);
    expect(html).not.toContain('data-app-mode="review" data-workspace-id');
    expect(html).toContain('<script type="module" src="/review-app.js"></script>');
    expect(html).toContain("2 members");
    expect(html).toContain("owner@example.test");
    expect(html).toContain("Writing project");
    expect(html).toContain("Project access required");
    expect(html).toContain("Linked project");
    expect(html).not.toContain("private-project-identity");
    expect(html).toContain('data-project-permission="project-access-required"');
    expect(html).toContain('id="review-study-dialog"');
    expect(html).toContain('id="review-protocol-form"');
    expect(html).toContain('aria-label="Review study stages"');
    expect(html).toContain(`href="/api/reviews/${reviewId}/review-study/export/review.zip"`);
    expect(html).toContain(`data-src="/api/reviews/${reviewId}/review-study/export/prisma.svg"`);
    expect(html).toContain('id="review-publication-project"');
    expect(html).toContain('value="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" data-workspace-id="writing-project"');
    expect(html).not.toContain('value="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');
    expect(html).toContain(`method="post" action="/review/${reviewId}/project-links"`);
    expect(html).toContain('value="second-manuscript"');
    expect(html).not.toContain('<option value="writing-project">Writing project</option>');
  });

  it("keeps an unlinked review fully usable while disabling publication", () => {
    const html = renderReviewPage(reviews[0]!, members, []);

    expect(html).toContain("No writing projects linked. The review remains fully usable on its own.");
    expect(html).toContain('<select class="field" id="review-publication-project" disabled>');
    expect(html).toContain('id="publish-review-synthesis" type="button" disabled');
    expect(html).toContain("Link an accessible writing project before publishing this synthesis.");
  });

  it("escapes review and accessible project copy", () => {
    const review = { ...reviews[0]!, title: `Review <script>` };
    const links = [
      {
        ...projectLinks[0]!,
        project: { id: "writing-project", title: `Project <script>`, href: `/editor/writing-project?file="draft"` },
      },
    ];
    const html = renderReviewPage(review, members, links);

    expect(html).toContain("Review &lt;script&gt;");
    expect(html).not.toContain("Review <script>");
    expect(html).toContain("Project &lt;script&gt;");
    expect(html).not.toContain("Project <script>");
    expect(html).toContain('href="/editor/writing-project?file=&quot;draft&quot;"');
  });
});
