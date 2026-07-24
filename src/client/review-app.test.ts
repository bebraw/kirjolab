import { beforeEach, describe, expect, it, vi } from "vitest";

const bindReviewStudyPlanning = vi.fn();

vi.mock("./review-study", () => ({ bindReviewStudyPlanning }));

beforeEach(() => {
  vi.resetModules();
  bindReviewStudyPlanning.mockReset();
});

describe("review app entrypoint", () => {
  it("binds the exact versioned review identity", async () => {
    vi.stubGlobal("document", {
      body: { dataset: { reviewId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
    });

    await import("./review-app");

    expect(bindReviewStudyPlanning).toHaveBeenCalledOnce();
    expect(bindReviewStudyPlanning).toHaveBeenCalledWith("/api/reviews/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it.each([
    undefined,
    "",
    "aaaaaaaa-aaaa-0aaa-8aaa-aaaaaaaaaaaa",
    "aaaaaaaa-aaaa-4aaa-7aaa-aaaaaaaaaaaa",
    "gaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaaa",
    "prefix-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-suffix",
  ])("rejects invalid review identity %s", async (reviewId) => {
    vi.stubGlobal("document", { body: { dataset: { reviewId } } });

    await expect(import("./review-app")).rejects.toThrow("Invalid review identity");
    expect(bindReviewStudyPlanning).not.toHaveBeenCalled();
  });
});
