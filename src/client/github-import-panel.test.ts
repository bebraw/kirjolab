import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GitHubImportPanel,
  gitHubDisconnectEvent,
  gitHubImportCancelEvent,
  gitHubImportConfirmEvent,
  gitHubImportPreviewEvent,
} from "./github-import-panel";

class TestGitHubImportPanel extends GitHubImportPanel {
  focusCount = 0;

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

  disconnectForTest(): void {
    this.requestDisconnect();
  }

  override focusTitle(): void {
    this.focusCount += 1;
  }
}

class FakeDialog extends EventTarget {
  closeCount = 0;
  modalCount = 0;

  close(): void {
    this.closeCount += 1;
  }

  showModal(): void {
    this.modalCount += 1;
  }
}

afterEach(() => vi.unstubAllGlobals());

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

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status });
}

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
    panel.setConnection({ connected: true, message: "Connected." });
    panel.setConnectionMessage("Ready.");
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

  it("owns the connected picker request lifecycle", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ connected: true, connectedAt: "2026-07-26T09:00:00Z", user: { id: "user-1", login: "researcher" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ installations: [installation] }))
      .mockResolvedValueOnce(jsonResponse({ repositories: [repository] }))
      .mockResolvedValueOnce(
        jsonResponse({
          branches: [
            { name: "draft", protected: false },
            { name: "main", protected: true },
          ],
          repository,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const panel = new TestGitHubImportPanel();

    await panel.refreshConnection();

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/github/connection",
      "/api/github/installations",
      "/api/github/installations/7/repositories",
      "/api/github/installations/7/repositories/11/branches",
    ]);
    expect(panel.selection).toMatchObject({ branch: "main", installationId: 7, repository });
    expect(panel.projectTitle).toBe("paper");
  });

  it("keeps picker failures local and disconnected accounts empty", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Connection unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ connected: false }));
    vi.stubGlobal("fetch", fetcher);
    const panel = new TestGitHubImportPanel();

    await panel.refreshConnection();
    expect(panel.renderForTest()).toBeDefined();
    await panel.refreshConnection();
    expect(panel.selection.installationId).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("ignores a superseded connection response", async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(jsonResponse({ connected: false }));
    vi.stubGlobal("fetch", fetcher);
    const panel = new TestGitHubImportPanel();

    const firstRefresh = panel.refreshConnection();
    await panel.refreshConnection();
    resolveFirst?.(jsonResponse({ connected: true, connectedAt: "2026-07-26T09:00:00Z", user: { id: "user-1", login: "old" } }));
    await firstRefresh;

    expect(fetcher).toHaveBeenCalledTimes(2);
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
    let previewId: string | null = null;
    for (const eventName of [gitHubImportPreviewEvent, gitHubImportCancelEvent, gitHubDisconnectEvent]) {
      panel.addEventListener(eventName, () => actions.push(eventName));
    }
    panel.addEventListener(gitHubImportConfirmEvent, (event) => {
      actions.push(gitHubImportConfirmEvent);
      previewId = (event as CustomEvent<string>).detail;
    });

    panel.previewForTest();
    panel.cancelForTest();
    panel.confirmForTest();
    panel.showPreview({ id: "preview-1", commitSha: "1234567890abcdef", entryPath: "main.md", files: [] });
    panel.confirmForTest();
    panel.disconnectForTest();

    expect(actions).toEqual([gitHubImportPreviewEvent, gitHubImportCancelEvent, gitHubImportConfirmEvent, gitHubDisconnectEvent]);
    expect(previewId).toBe("preview-1");
  });

  it("owns its native dialog lifecycle", () => {
    const panel = new TestGitHubImportPanel();
    const dialog = new FakeDialog();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    Object.defineProperty(panel, "closest", { value: () => dialog });

    panel.open();
    panel.close();
    expect(dialog.modalCount).toBe(1);
    expect(dialog.closeCount).toBe(1);
    expect(panel.focusCount).toBe(1);
  });
});
