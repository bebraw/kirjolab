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
    expect(html).toContain('<button class="button-primary" type="submit"><span>Create review</span></button>');
    expect(html).toContain(`href="/review/${reviewId}"`);
    expect(html).toContain("Evidence synthesis");
    expect(html).toContain("Archived review");
    expect(html).toContain("1 active · 2 total");
    expect(html).toContain("Systematic literature review · Owner · Active");
    expect(html).toContain("Multivocal literature review · Member · Archived");
    expect(html).toContain('<span class="review-index-mark" aria-hidden="true">S</span>');
    expect(html).toContain('<span class="review-index-mark" aria-hidden="true">M</span>');
    expect(html).toContain('aria-label="Account for local@kirjolab.invalid"');
    expect(html).toContain("Local development");
    expect(html).toContain(
      `href="/review/${reviewId}">\n    <span class="review-index-mark" aria-hidden="true">S</span>\n    <span><strong>Evidence synthesis</strong>`,
    );
    expect(html).toContain('</a><a class="review-index-row" href="/review/22222222-2222-4222-8222-222222222222">');
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
    expect(html).toContain('aria-label="Account for local@kirjolab.invalid"');
    expect(html).toContain('<a class="primary-navigation-link" href="/review" aria-current="page">Reviews</a>');
    expect(html).toContain("owner@example.test");
    expect(html).toContain("Owner · joined");
    expect(html).toContain("Member · joined");
    expect(html).toContain("</span><span><strong>member@example.test</strong>");
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
    expect(html).toContain('data-link-status="active" data-project-permission="available"');
    expect(html).toContain('<a href="/editor/writing-project">Open in Editor <span aria-hidden="true">↗</span></a>');
    expect(html).toContain("<strong>Writing project</strong><small>Active link · linked");
    expect(html).toContain("<strong>Linked project</strong><small>Project access required · linked");
    expect(html).toContain('<span class="review-project-link-state">Project access required</span>');
    expect(html).toContain('</article><article class="review-project-link-row"');
    expect(html).toContain('<a class="primary-navigation-link" href="/editor/writing-project">Editor</a>');
    expect(html).toContain('<span class="count-badge">Active</span><span>Owner</span>');
    expect(html).toContain("<span>2 active</span>");
    expect(html).toContain(`method="post" action="/review/${reviewId}/project-links"`);
    expect(html).toContain('<button class="button-secondary" type="submit"><span>Link project</span></button>');
    expect(html).toContain('value="second-manuscript"');
    expect(html).not.toContain('<option value="writing-project">Writing project</option>');
  });

  it("keeps an unlinked review fully usable while disabling publication", () => {
    const html = renderReviewPage(reviews[0]!, members, []);

    expect(html).toContain("No writing projects linked. The review remains fully usable on its own.");
    expect(html).toContain('<select class="field" id="review-publication-project" disabled>');
    expect(html).toContain('id="publish-review-synthesis" type="button" disabled');
    expect(html).toContain("Link an accessible writing project before publishing this synthesis.");
    expect(html).toContain('<select class="field" id="review-link-project" name="workspaceId" disabled>');
    expect(html).toContain('<option value="">No unlinked projects available</option>');
    expect(html).toContain('<button class="button-secondary" type="submit" disabled><span>Link project</span></button>');
    expect(html).toContain('<a class="primary-navigation-link" href="/editor">Editor</a>');
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

  it("renders empty catalogs and member-owned review details without owner controls", () => {
    const catalog = renderReviewsPage([]);
    expect(catalog).toContain("0 active · 0 total");
    expect(catalog).toContain("No reviews yet. Create one above; a writing project is optional.");
    expect(catalog).toContain("Local development");

    const extraActive = { ...reviews[0]!, id: "55555555-5555-4555-8555-555555555555", title: "Second active review" };
    expect(renderReviewsPage([...reviews, extraActive])).toContain("2 active · 3 total");

    const memberReview = reviews[1]!;
    const member = [{ ...members[1]!, addedAt: "invalid <date>" }];
    const detail = renderReviewPage(memberReview, member, []);
    expect(detail).toContain('<span class="count-badge">Archived</span><span>Member</span>');
    expect(detail).toContain("<summary>1 member</summary>");
    expect(detail).toContain("invalid &lt;date&gt;");
    expect(detail).not.toContain('class="review-project-link-form"');
    expect(detail).toContain('<a class="primary-navigation-link" href="/editor">Editor</a>');
  });

  it("renders unlinked project history and filters unavailable link targets", () => {
    const unlinked: ReviewProjectLinkView = {
      ...projectLinks[0]!,
      status: "unlinked",
      unlinkedAt: "2026-07-20T09:00:00.000Z",
      unlinkedBy: "owner@example.test",
    };
    const archivedProject = {
      ...linkableProjects[1]!,
      id: "archived-project",
      title: "Archived project",
      archivedAt: "2026-07-20T09:00:00.000Z",
    };
    const html = renderReviewPage(reviews[0]!, members, [unlinked], undefined, undefined, [linkableProjects[0]!, archivedProject]);

    expect(html).toContain('data-link-status="unlinked" data-project-permission="available"');
    expect(html).toContain("<span>0 active</span>");
    expect(html).toContain("Unlinked Jul 20, 2026 · linked Jul 18, 2026");
    expect(html).toContain('<span class="review-project-link-state">Unlinked Jul 20, 2026</span>');
    expect(html).toContain('<option value="writing-project">Writing project</option>');
    expect(html).not.toContain('<option value="archived-project">Archived project</option>');

    const undated = { ...unlinked, unlinkedAt: null };
    expect(renderReviewPage(reviews[0]!, members, [undated])).toContain("<small>Unlinked · linked Jul 18, 2026</small>");
  });

  it("requires every accessible-project condition before changing the editor destination", () => {
    const unavailableProject = { ...projectLinks[0]!, permission: "project-access-required" as const };
    const unlinkedProject = { ...projectLinks[0]!, status: "unlinked" as const };
    const missingProject = { ...projectLinks[0]!, project: null };

    for (const link of [unavailableProject, unlinkedProject, missingProject]) {
      const html = renderReviewPage(reviews[0]!, members, [link]);
      expect(html).toContain('<a class="primary-navigation-link" href="/editor">Editor</a>');
      expect(html).not.toContain('<a class="primary-navigation-link" href="/editor/writing-project">Editor</a>');
      if (link.permission !== "available") expect(html).not.toContain("Open in Editor");
    }

    const withTwoOptions = renderReviewPage(reviews[0]!, members, [], undefined, undefined, linkableProjects);
    expect(withTwoOptions).toContain(
      '<option value="writing-project">Writing project</option><option value="second-manuscript">Second manuscript</option>',
    );
    expect(withTwoOptions).toContain('<select class="field" id="review-link-project" name="workspaceId">');
  });
});
