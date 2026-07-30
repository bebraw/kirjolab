import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubSyncReview, gitHubSyncMutationEvent, type GitHubSyncMutation } from "./github-sync-review";

class TestGitHubSyncReview extends GitHubSyncReview {
  renderForTest() {
    return this.render();
  }

  confirmPullForTest(): Promise<void> {
    return this.requestPullConfirm();
  }

  confirmPublishForTest(): Promise<void> {
    return this.requestPublishConfirm();
  }
}

describe("GitHub sync review", () => {
  afterEach(() => vi.restoreAllMocks());

  it("owns pull and publish requests and emits completed mutations", async () => {
    const review = new TestGitHubSyncReview();
    review.configure("/api/workspaces/project");
    const mutations: GitHubSyncMutation[] = [];
    review.addEventListener(gitHubSyncMutationEvent, (event) => mutations.push((event as CustomEvent<GitHubSyncMutation>).detail));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ id: "pull-1", plan: { blocking: [], changes: [{ base: null, remote: { path: "main.md" } }] } }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(
        Response.json({
          id: "publish-1",
          expectedRemoteHead: "1234567890abcdef",
          plan: { blocking: [], changes: [{ path: "main.md", content: "# Paper" }], skippedLocalPaths: [] },
        }),
      )
      .mockResolvedValueOnce(Response.json({ commitSha: "1234567890abcdef" }));

    await review.previewPull();
    expect(review.hasActivePreview).toBe(true);
    await review.confirmPullForTest();
    await review.previewPublish();
    await review.confirmPublishForTest();

    expect(mutations).toEqual(["pull", "publish"]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/project/github-sync/pulls",
      expect.objectContaining({ body: JSON.stringify({ previewId: "pull-1", resolutions: [] }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/workspaces/project/github-sync/publish-previews",
      expect.objectContaining({ body: JSON.stringify({ commitMessage: "Publish from Kirjolab" }) }),
    );
    review.reset();
    expect(review.hasActivePreview).toBe(false);
  });

  it("presents invalid and failed request responses", async () => {
    const review = new TestGitHubSyncReview();
    review.configure("/api/workspaces/project");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ invalid: true }))
      .mockResolvedValueOnce(Response.json({ error: "Remote unavailable" }, { status: 503 }));

    await review.previewPull();
    await review.previewPublish();

    expect(review.hasActivePreview).toBe(false);
    expect(review.renderForTest()).toBeDefined();
  });

  it("owns review progress, success, and error presentation", () => {
    const review = new TestGitHubSyncReview();
    review.setConnected(true);
    review.beginPullPreview();
    review.showPullError("Pull failed");
    review.beginPublishPreview();
    review.showPublishError("Publish failed");
    review.beginPull();
    review.showPullSuccess();
    review.beginPublish();
    review.showPublishSuccess("1234567890abcdef");
    expect(review.renderForTest()).toBeDefined();
  });
});
