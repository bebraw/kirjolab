import { describe, expect, it } from "vitest";
import { GitHubSyncReview, gitHubPublishConfirmEvent, gitHubPullConfirmEvent } from "./github-sync-review";

class TestGitHubSyncReview extends GitHubSyncReview {
  renderForTest() {
    return this.render();
  }

  confirmPullForTest(): void {
    this.requestPullConfirm();
  }

  confirmPublishForTest(): void {
    this.requestPublishConfirm();
  }
}

describe("GitHub sync review", () => {
  it("owns preview identities and emits complete confirmation intents", () => {
    const review = new TestGitHubSyncReview();
    const pulls: string[] = [];
    const publishes: string[] = [];
    review.addEventListener(gitHubPullConfirmEvent, (event) => {
      pulls.push((event as CustomEvent<string>).detail);
    });
    review.addEventListener(gitHubPublishConfirmEvent, (event) => {
      publishes.push((event as CustomEvent<string>).detail);
    });

    review.confirmPullForTest();
    review.confirmPublishForTest();
    review.showPullPreview({
      id: "pull-1",
      plan: { blocking: [], changes: [{ base: null, remote: { path: "main.md" } }] },
    });
    review.showPublishPreview({
      id: "publish-1",
      expectedRemoteHead: "1234567890abcdef",
      plan: { blocking: [], changes: [{ path: "main.md", content: "# Paper" }], skippedLocalPaths: [] },
    });
    expect(review.hasActivePreview).toBe(true);
    review.confirmPullForTest();
    review.confirmPublishForTest();

    expect(pulls).toEqual(["pull-1"]);
    expect(publishes).toEqual(["publish-1"]);
    review.reset();
    expect(review.hasActivePreview).toBe(false);
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
