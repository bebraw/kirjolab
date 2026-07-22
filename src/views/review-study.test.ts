import { describe, expect, it } from "vitest";
import type { ReviewProjectLinkView } from "../api/reviews";
import type { ReviewSummary } from "../domain/review-catalog";
import { renderReviewStudySurface } from "./review-study";

const review: ReviewSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Evidence <review>",
  profile: "slr",
  href: "/review/11111111-1111-4111-8111-111111111111",
  role: "owner",
  createdAt: "2026-07-17T09:00:00.000Z",
  updatedAt: "2026-07-19T09:00:00.000Z",
  archivedAt: null,
};

const accessibleLink: ReviewProjectLinkView = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  reviewId: review.id,
  workspaceId: "writing-project",
  createdBy: "owner@example.test",
  createdAt: "2026-07-18T09:00:00.000Z",
  status: "active",
  unlinkedAt: null,
  unlinkedBy: null,
  project: { id: "writing-project", title: "Writing <project>", href: "/editor/writing-project" },
  permission: "available",
};

describe("review study surface", () => {
  it("renders the systematic workflow and canonical artifact routes", () => {
    const html = renderReviewStudySurface(review, [accessibleLink]);

    expect(html).toContain("<h2>Evidence &lt;review&gt;</h2>");
    expect(html).toContain("Systematic evidence workflow · independent review");
    expect(html).toContain('<label class="field-label">Population<input class="field" id="review-picoc-population"');
    expect(html).toContain('</label><label class="field-label">Intervention<input class="field" id="review-picoc-intervention"');
    expect(html).toContain('id="review-picoc-intervention"');
    expect(html).toContain('id="review-picoc-comparison"');
    expect(html).toContain('id="review-picoc-outcome"');
    expect(html).toContain('id="review-picoc-context"');
    expect(html).toContain(`/api/reviews/${review.id}/review-study/synthesis.csv`);
    expect(html).toContain(`/api/reviews/${review.id}/review-study/export/review.zip`);
    expect(html).toContain(`Publishing writes review/${review.id}/synthesis.md after checking the selected project revision.`);
  });

  it("labels a multivocal workflow independently from the systematic profile", () => {
    const html = renderReviewStudySurface({ ...review, profile: "mlr" }, [accessibleLink]);

    expect(html).toContain("Multivocal evidence workflow · independent review");
    expect(html).not.toContain("Systematic evidence workflow · independent review");
  });

  it("offers only active, accessible projects as escaped publication targets", () => {
    const unavailable = { ...accessibleLink, id: "unavailable", permission: "project-access-required" as const };
    const unlinked = { ...accessibleLink, id: "unlinked", status: "unlinked" as const };
    const missingProject = { ...accessibleLink, id: "missing-project", project: null };
    const secondAccessible = {
      ...accessibleLink,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      workspaceId: "second-project",
      project: { id: "second-project", title: "Second project", href: "/editor/second-project" },
    };
    const html = renderReviewStudySurface(review, [unavailable, unlinked, missingProject, accessibleLink, secondAccessible]);

    expect(html).toContain(
      '<option value="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" data-workspace-id="writing-project">Writing &lt;project&gt;</option><option value="cccccccc-cccc-4ccc-8ccc-cccccccccccc" data-workspace-id="second-project">Second project</option>',
    );
    expect(html).not.toContain('value="unavailable"');
    expect(html).not.toContain('value="unlinked"');
    expect(html).not.toContain('value="missing-project"');
    expect(html).toContain('<select class="field" id="review-publication-project">');
    expect(html).toContain('id="publish-review-synthesis" type="button">Publish synthesis</button>');
  });

  it("disables publication and explains the missing target", () => {
    const html = renderReviewStudySurface(review, []);

    expect(html).toContain(
      '<select class="field" id="review-publication-project" disabled><option value="">No accessible active project</option></select>',
    );
    expect(html).toContain('id="publish-review-synthesis" type="button" disabled>Publish synthesis</button>');
    expect(html).toContain("Link an accessible writing project before publishing this synthesis.");
    expect(html).not.toContain("Publishing writes review/");
  });
});
