import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubSyncReview } from "./github-sync-review";
import {
  WorkspaceSettingsPanel,
  workspaceSettingsActionEvent,
  type WorkspaceSettingsAction,
  type WorkspaceSettingsValue,
  type WorkspaceSettingsView,
} from "./workspace-settings-panel";

const value: WorkspaceSettingsValue = {
  entryFileId: "file-2",
  publicationProfile: {
    citationStyle: "ieee",
    locale: "fi-FI",
    paperSize: "letter",
    submissionTemplate: "preprint",
  },
  title: "Study",
};

const view: WorkspaceSettingsView = {
  ...value,
  archived: false,
  files: [
    { id: "file-1", path: "main.md" },
    { id: "file-2", path: "methods.md" },
  ],
  templateAllowed: true,
};

class TestWorkspaceSettingsPanel extends WorkspaceSettingsPanel {
  closeCount = 0;
  projectTitle = value.title;

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  setViewForTest(next: WorkspaceSettingsView): void {
    this.setView(next);
  }

  async saveForTest(): Promise<void> {
    await this.saveSettings();
  }

  async actionForTest(action: "archive" | "delete" | "duplicate" | "save-template"): Promise<void> {
    if (action === "archive") await this.toggleArchive();
    else if (action === "delete") await this.deleteProject();
    else if (action === "duplicate") await this.duplicateProject();
    else this.saveTemplate();
  }

  override close(): void {
    this.closeCount += 1;
  }

  protected override get titleInput(): HTMLInputElement {
    return { value: this.projectTitle } as HTMLInputElement;
  }

  protected override select(id: string): HTMLSelectElement {
    const values: Readonly<Record<string, string>> = {
      "workspace-citation-locale": value.publicationProfile.locale,
      "workspace-citation-style": value.publicationProfile.citationStyle,
      "workspace-entry-file": value.entryFileId,
      "workspace-paper-size": value.publicationProfile.paperSize,
      "workspace-submission-template": value.publicationProfile.submissionTemplate,
    };
    return { value: values[id] ?? "" } as HTMLSelectElement;
  }
}

class LifecycleWorkspaceSettingsPanel extends TestWorkspaceSettingsPanel {
  showCount = 0;
  readonly review = new GitHubSyncReview();
  readonly modal = {
    close: () => {
      this.modal.open = false;
    },
    open: false,
    showModal: () => {
      this.showCount += 1;
      this.modal.open = true;
    },
  };
  override get updateComplete(): Promise<boolean> {
    return Promise.resolve(true);
  }

  override get gitHubReview(): GitHubSyncReview {
    return this.review;
  }

  override close(): void {
    this.modal.close();
  }

  firstUpdatedForTest(): void {
    this.firstUpdated();
  }

  protected override get dialog(): HTMLDialogElement {
    return this.modal as HTMLDialogElement;
  }
}

class MissingWorkspaceSettingsElements extends WorkspaceSettingsPanel {
  override querySelector<E extends Element = Element>(_selector: string): E | null {
    return null;
  }

  dialogForTest(): HTMLDialogElement {
    return this.dialog;
  }

  titleForTest(): HTMLInputElement {
    return this.titleInput;
  }

  selectForTest(): HTMLSelectElement {
    return this.select("missing");
  }

  reviewForTest(): GitHubSyncReview {
    return this.gitHubReview;
  }
}

describe("workspace settings panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders active, archived, and demo-safe states", () => {
    const panel = new TestWorkspaceSettingsPanel();
    expect(panel.rootForTest()).toBe(panel);
    panel.setViewForTest(view);
    expect(panel.renderForTest()).toBeDefined();
    panel.setViewForTest({ ...view, archived: true, templateAllowed: false });
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns save and project lifecycle requests", async () => {
    const panel = new TestWorkspaceSettingsPanel();
    const actions: WorkspaceSettingsAction[] = [];
    const assign = vi.fn();
    const duplicate = {
      archivedAt: null,
      createdAt: "2026-07-25",
      href: "/editor/copy",
      id: "copy",
      title: "Study copy",
      updatedAt: "2026-07-25",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json(duplicate))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign, href: "https://example.test/editor/study?mode=source" });
    vi.stubGlobal("prompt", vi.fn().mockReturnValueOnce("Study copy").mockReturnValueOnce("DELETE"));
    panel.configureGitHub("/api/workspaces/study");
    panel.setViewForTest(view);
    panel.addEventListener(workspaceSettingsActionEvent, (event) => actions.push((event as CustomEvent<WorkspaceSettingsAction>).detail));

    await panel.saveForTest();
    await panel.actionForTest("save-template");
    await panel.actionForTest("duplicate");
    await panel.actionForTest("archive");
    await panel.actionForTest("delete");

    expect(actions).toEqual([{ action: "save-template" }, { action: "catalog-refresh" }]);
    expect(assign.mock.calls).toEqual([["/editor/study?mode=source&file=file-2"], ["/editor/copy"], ["/"]]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(panel.closeCount).toBe(1);
  });

  it("contains failed, malformed, cancelled, and overlapping requests", async () => {
    const panel = new TestWorkspaceSettingsPanel();
    let resolveSave: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSave = resolve;
          }),
      )
      .mockResolvedValueOnce(Response.json({ id: "invalid" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { href: "https://example.test/editor/study" });
    vi.stubGlobal("prompt", vi.fn().mockReturnValueOnce(null).mockReturnValueOnce("Study copy").mockReturnValueOnce("KEEP"));
    panel.configureGitHub("/api/workspaces/study");

    const save = panel.saveForTest();
    await panel.actionForTest("archive");
    resolveSave?.(Response.json({ error: "Denied" }, { status: 403 }));
    await save;
    await panel.actionForTest("duplicate");
    await panel.actionForTest("duplicate");
    await panel.actionForTest("delete");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("opens, reuses, and closes", async () => {
    const panel = new LifecycleWorkspaceSettingsPanel();
    const configure = vi.spyOn(panel.gitHubReview, "configure");
    panel.configureGitHub("/api/workspaces/project");
    panel.firstUpdatedForTest();
    expect(configure).toHaveBeenCalledWith("/api/workspaces/project");
    await panel.show(view);
    expect(panel.open).toBe(true);
    expect(panel.showCount).toBe(1);
    await panel.show({ ...view, archived: true });
    expect(panel.showCount).toBe(1);
    panel.close();
    expect(panel.open).toBe(false);
  });

  it("owns its GitHub review presentation and preview actions", async () => {
    const panel = new LifecycleWorkspaceSettingsPanel();
    const connected = vi.spyOn(panel.review, "setConnected");
    const reset = vi.spyOn(panel.review, "reset");
    const previewPull = vi.spyOn(panel.review, "previewPull").mockResolvedValue();
    const previewPublish = vi.spyOn(panel.review, "previewPublish").mockResolvedValue();

    panel.setGitHubConnection(true, "Synced");
    panel.resetGitHubReview();
    await panel.previewGitHub("pull");
    await panel.previewGitHub("push");

    expect(connected).toHaveBeenCalledWith(true);
    expect(reset).toHaveBeenCalledOnce();
    expect(previewPull).toHaveBeenCalledOnce();
    expect(previewPublish).toHaveBeenCalledOnce();
  });

  it("reports missing internal controls clearly", () => {
    const panel = new MissingWorkspaceSettingsElements();
    expect(() => panel.dialogForTest()).toThrow("Workspace settings dialog is unavailable");
    expect(() => panel.titleForTest()).toThrow("Workspace settings title is unavailable");
    expect(() => panel.selectForTest()).toThrow("Workspace settings select missing is unavailable");
    expect(() => panel.reviewForTest()).toThrow("GitHub sync review is unavailable");
  });
});
