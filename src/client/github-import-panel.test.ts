import { describe, expect, it } from "vitest";
import { GitHubImportPanel, gitHubImportCancelEvent, gitHubImportConfirmEvent, gitHubImportPreviewEvent } from "./github-import-panel";

class TestGitHubImportPanel extends GitHubImportPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  previewForTest(): void {
    this.requestPreview(new Event("submit") as SubmitEvent);
  }

  cancelForTest(): void {
    this.requestCancel();
  }

  confirmForTest(): void {
    this.requestConfirm();
  }
}

const installation = {
  id: 7,
  accountId: "account-1",
  accountLogin: "research-lab",
  accountType: "Organization" as const,
};

const repository = {
  id: 11,
  owner: "research-lab",
  name: "paper",
  fullName: "research-lab/paper",
  private: true,
  defaultBranch: "main",
};

describe("GitHub import panel", () => {
  it("owns the light-DOM form and repository selection lifecycle", () => {
    const panel = new TestGitHubImportPanel();
    expect(panel.rootForTest()).toBe(panel);
    expect(panel.selection).toEqual({
      installationId: null,
      repository: null,
      branch: "",
      rootPath: "",
      entryPath: "",
    });

    panel.beginConnectionRefresh();
    panel.setInstallationsLoading();
    panel.setInstallations([installation]);
    panel.setRepositoriesLoading();
    panel.setRepositories([repository]);
    panel.setBranchesLoading();
    panel.setBranches(
      [
        { name: "main", protected: true },
        { name: "draft", protected: false },
      ],
      "main",
    );

    expect(panel.selection).toMatchObject({
      installationId: 7,
      repository,
      branch: "main",
    });
    expect(panel.projectTitle).toBe("paper");
    expect(panel.renderForTest()).toBeDefined();

    panel.resetDisconnected();
    expect(panel.selection.installationId).toBeNull();
  });

  it("presents preview, creation, and error states", () => {
    const panel = new TestGitHubImportPanel();
    panel.beginPreview();
    panel.showPreview({
      id: "preview-1",
      commitSha: "1234567890abcdef",
      entryPath: "main.md",
      files: Array.from({ length: 13 }, (_, index) => ({ path: `chapter-${index}.md`, bytes: index + 1 })),
    });
    expect(panel.renderForTest()).toBeDefined();
    panel.beginCreation();
    panel.showCreationError("Could not create project.");
    panel.showPreviewError("Could not preview repository.");
    panel.resetPreview();
    expect(panel.renderForTest()).toBeDefined();
  });

  it("emits preview, cancel, and confirmation intents", () => {
    const panel = new TestGitHubImportPanel();
    const actions: string[] = [];
    for (const eventName of [gitHubImportPreviewEvent, gitHubImportCancelEvent, gitHubImportConfirmEvent]) {
      panel.addEventListener(eventName, () => actions.push(eventName));
    }

    panel.previewForTest();
    panel.cancelForTest();
    panel.confirmForTest();

    expect(actions).toEqual([gitHubImportPreviewEvent, gitHubImportCancelEvent, gitHubImportConfirmEvent]);
  });
});
