import { describe, expect, it, vi } from "vitest";
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

  saveForTest(): void {
    this.save(new Event("submit") as SubmitEvent);
  }

  actionForTest(action: "archive" | "delete" | "duplicate" | "save-template"): void {
    if (action === "archive") this.archive();
    else if (action === "delete") this.deleteWorkspace();
    else if (action === "duplicate") this.duplicate();
    else this.saveTemplate();
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
  it("renders active, archived, and demo-safe states", () => {
    const panel = new TestWorkspaceSettingsPanel();
    expect(panel.rootForTest()).toBe(panel);
    panel.setViewForTest(view);
    expect(panel.renderForTest()).toBeDefined();
    panel.setViewForTest({ ...view, archived: true, templateAllowed: false });
    expect(panel.renderForTest()).toBeDefined();
  });

  it("emits typed save and project action intents", () => {
    const panel = new TestWorkspaceSettingsPanel();
    const actions: WorkspaceSettingsAction[] = [];
    panel.addEventListener(workspaceSettingsActionEvent, (event) => actions.push((event as CustomEvent<WorkspaceSettingsAction>).detail));

    panel.saveForTest();
    panel.actionForTest("save-template");
    panel.actionForTest("duplicate");
    panel.actionForTest("archive");
    panel.actionForTest("delete");

    expect(actions).toEqual([
      { action: "save", value },
      { action: "save-template" },
      { action: "duplicate", title: "Study" },
      { action: "archive" },
      { action: "delete", title: "Study" },
    ]);
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

  it("reports missing internal controls clearly", () => {
    const panel = new MissingWorkspaceSettingsElements();
    expect(() => panel.dialogForTest()).toThrow("Workspace settings dialog is unavailable");
    expect(() => panel.titleForTest()).toThrow("Workspace settings title is unavailable");
    expect(() => panel.selectForTest()).toThrow("Workspace settings select missing is unavailable");
    expect(() => panel.reviewForTest()).toThrow("GitHub sync review is unavailable");
  });
});
