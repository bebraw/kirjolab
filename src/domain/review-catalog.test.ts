import { describe, expect, it } from "vitest";
import {
  isIsoTimestamp,
  isReviewId,
  isReviewProfile,
  isReviewRole,
  isReviewStorageKey,
  isReviewSummaries,
  isReviewSummary,
  isWorkspaceRouteId,
  normalizeReviewEmail,
  normalizeReviewTitle,
  type ReviewSummary,
} from "./review-catalog";

const reviewId = "00000000-0000-4000-8000-000000000151";
const summary: ReviewSummary = {
  id: reviewId,
  title: "Reusable evidence review",
  profile: "slr",
  href: `/review/${reviewId}`,
  role: "owner",
  createdAt: "2026-07-19T10:00:00.000Z",
  updatedAt: "2026-07-19T11:00:00.000Z",
  archivedAt: null,
};

describe("review catalog boundaries", () => {
  it("recognizes stable review identities, roles, profiles, and locators", () => {
    expect(isReviewId(reviewId)).toBe(true);
    expect(isReviewId("workspace-1")).toBe(false);
    expect(isWorkspaceRouteId("workspace-1")).toBe(true);
    expect(isWorkspaceRouteId("workspace/1")).toBe(false);
    expect(isReviewStorageKey(`review:${reviewId}`)).toBe(true);
    expect(isReviewStorageKey("review key")).toBe(false);
    expect(isReviewProfile("slr")).toBe(true);
    expect(isReviewProfile("mlr")).toBe(true);
    expect(isReviewProfile("project")).toBe(false);
    expect(isReviewRole("owner")).toBe(true);
    expect(isReviewRole("member")).toBe(true);
    expect(isReviewRole("reader")).toBe(false);
    expect(isIsoTimestamp(summary.createdAt)).toBe(true);
    expect(isIsoTimestamp("not-a-date")).toBe(false);
  });

  it("normalizes bounded review metadata", () => {
    expect(normalizeReviewTitle("  Reusable evidence  ")).toBe("Reusable evidence");
    expect(() => normalizeReviewTitle(" ")).toThrow("title");
    expect(() => normalizeReviewTitle("x".repeat(121))).toThrow("title");
    expect(normalizeReviewEmail(" Reviewer@Example.TEST ")).toBe("reviewer@example.test");
    expect(() => normalizeReviewEmail("not-an-email")).toThrow("email");
    expect(() => normalizeReviewEmail(`${"x".repeat(310)}@example.test`)).toThrow("email");
  });

  it("validates the public summary fields", () => {
    expect(isReviewSummary(summary)).toBe(true);
    expect(isReviewSummaries([summary, { ...summary, profile: "mlr", role: "member" }])).toBe(true);
    expect(isReviewSummary({ ...summary, href: "/review/workspace-1" })).toBe(false);
    expect(isReviewSummary({ ...summary, title: " padded " })).toBe(false);
    expect(isReviewSummary({ ...summary, archivedAt: "invalid" })).toBe(false);
    expect(isReviewSummaries("not-an-array")).toBe(false);
  });
});
