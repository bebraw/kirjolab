import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectRevisionContent, ProjectRevisionDiff, ProjectRevisionSummary } from "../../domain/project/project-history";
import type { ProjectHistoryOperation } from "./project-history-machine";
import { ProjectHistoryDialog, projectHistoryOutcomeEvent } from "./project-history-dialog";

const revisions: readonly ProjectRevisionSummary[] = [
  { createdAt: "t2", fileCount: 1, milestones: [], reason: "checkpoint", revision: 2, title: "Paper" },
  { createdAt: "t1", fileCount: 1, milestones: [], reason: "created", revision: 1, title: "Paper" },
];

const content: ProjectRevisionContent = {
  annotations: [],
  assets: [],
  bibliography: "",
  claims: [],
  comments: [],
  entryFileId: "main",
  files: [{ content: "# Paper", createdAt: "t1", id: "main", mediaType: "text/markdown", path: "main.md", updatedAt: "t1" }],
  folders: [],
  pdfs: [],
  projectReferences: [],
  publicationPdfLinks: [],
  relationships: { annotationPassages: 0, claimEvidence: 0, claimPassages: 0, comments: 0 },
  researchShares: [],
  revision: 2,
  reviewArtifactPins: [],
  source: "# Paper",
  title: "Paper",
};

const comparison: ProjectRevisionDiff = {
  binaries: [],
  composed: { addedLines: 1, afterWords: 2, beforeWords: 1, hunks: [], removedLines: 0, wordDelta: 1 },
  files: [],
  fromRevision: 1,
  toRevision: 2,
};

class TestProjectHistoryDialog extends ProjectHistoryDialog {
  renderForTest() {
    return this.render();
  }

  actionForTest(operation: ProjectHistoryOperation): Promise<void> {
    return this.handleAction(operation);
  }

  closeFromPanelForTest(): void {
    this.handlePanelClose();
  }

  closeDialogForTest(): void {
    this.handleDialogClose();
  }
}

function controls() {
  const dialog = {
    close: vi.fn(),
    open: false,
    setAttribute: vi.fn(),
    showModal: vi.fn(() => {
      dialog.open = true;
    }),
  };
  const panel = {
    setBusy: vi.fn(),
    showComparison: vi.fn(),
    showError: vi.fn(),
    showLoading: vi.fn(),
    showRevision: vi.fn(),
    showTimeline: vi.fn(),
  };
  const control = new TestProjectHistoryDialog();
  Object.defineProperty(control, "querySelector", {
    value: (selector: string) => (selector === "#project-history-dialog" ? dialog : panel),
  });
  control.configure("/api/workspaces/workspace-1");
  return { control, dialog, panel };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status });
}

describe("project history dialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and owns the modal timeline lifecycle", async () => {
    const { control, dialog, panel } = controls();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(revisions)));

    await control.open();
    expect(control.renderForTest()).toBeDefined();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(panel.showLoading).toHaveBeenCalledOnce();
    expect(panel.showTimeline).toHaveBeenCalledWith(revisions);
    expect(dialog.setAttribute).toHaveBeenLastCalledWith("aria-busy", "false");
    control.closeFromPanelForTest();
    control.closeDialogForTest();
    expect(dialog.close).toHaveBeenCalledOnce();
  });

  it("owns its trigger and notice forwarding", async () => {
    const { control } = controls();
    const trigger = new EventTarget();
    const presentNotice = vi.fn();
    control.configure("/api/workspaces/workspace-1", {
      projectHistoryTrigger: trigger,
      toast: { show: presentNotice },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ invalid: true })));

    trigger.dispatchEvent(new Event("project-history-open"));
    await vi.waitFor(() => expect(presentNotice).toHaveBeenCalledWith("Project history returned an invalid timeline"));
  });

  it("owns inspect, compare, milestone, restore, and branch requests", async () => {
    const { control, dialog, panel } = controls();
    dialog.open = true;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/milestones") || url.endsWith("/restore")) return Promise.resolve(new Response(null, { status: 204 }));
      if (url.endsWith("/seed"))
        return Promise.resolve(
          json({ archivedAt: null, createdAt: "t1", href: "/workspaces/branch", id: "branch", title: "Branch", updatedAt: "t1" }),
        );
      if (url.includes("/compare?")) return Promise.resolve(json(comparison));
      if (url.endsWith("/history/2")) return Promise.resolve(json(content));
      return Promise.resolve(json(revisions));
    });
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.fn();
    const reload = vi.fn();
    vi.stubGlobal("window", {
      confirm: vi.fn().mockReturnValue(true),
      location: { assign, reload },
      prompt: vi.fn().mockReturnValueOnce("Submitted").mockReturnValueOnce("Final version").mockReturnValueOnce("Branch project"),
    });
    const outcomes: string[] = [];
    control.addEventListener(projectHistoryOutcomeEvent, (event) => {
      outcomes.push((event as CustomEvent<string>).detail);
    });

    await control.open();
    await control.actionForTest({ kind: "inspect", revision: 2 });
    await control.actionForTest({ kind: "compare", from: 1, to: 2 });
    await control.actionForTest({ kind: "milestone", revision: 2 });
    await control.actionForTest({ kind: "restore", revision: 2 });
    await control.actionForTest({ kind: "branch", revision: 2 });

    expect(panel.showRevision).toHaveBeenCalledWith(content);
    expect(panel.showComparison).toHaveBeenCalledWith(comparison);
    expect(outcomes).toEqual(["Milestone “Submitted” now identifies v2.", "Restored v2 as a new head."]);
    expect(reload).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith("/workspaces/branch");
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace-1/history/2/milestones", {
      body: JSON.stringify({ name: "Submitted", description: "Final version" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("keeps provider and malformed failures local and reports notices", async () => {
    const { control, panel } = controls();
    const outcomes: string[] = [];
    control.addEventListener(projectHistoryOutcomeEvent, (event) => outcomes.push((event as CustomEvent<string>).detail));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ invalid: true }))
        .mockResolvedValueOnce(json(revisions)),
    );

    await control.open();
    expect(panel.showError).toHaveBeenCalledWith("Project history returned an invalid timeline");
    await control.open();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "Revision unavailable" }, 404)));
    await control.actionForTest({ kind: "inspect", revision: 2 });
    expect(outcomes).toEqual(["Project history returned an invalid timeline", "Revision unavailable"]);
  });

  it("keeps an accepted mutation consequence after the dialog closes", async () => {
    const { control } = controls();
    const reload = vi.fn();
    vi.stubGlobal("window", { confirm: vi.fn().mockReturnValue(true), location: { reload } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(revisions)));
    await control.open();
    let resolveResponse = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pendingResponse));
    const outcomes: string[] = [];
    control.addEventListener(projectHistoryOutcomeEvent, (event) => outcomes.push((event as CustomEvent<string>).detail));

    const restore = control.actionForTest({ kind: "restore", revision: 1 });
    control.closeDialogForTest();
    resolveResponse(new Response(null, { status: 204 }));
    await restore;

    expect(outcomes).toEqual(["Restored v1 as a new head."]);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("tolerates unavailable server-rendered children", async () => {
    const control = new TestProjectHistoryDialog();
    Object.defineProperty(control, "querySelector", { value: () => null });
    control.configure("/api/workspaces/workspace-1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(revisions)));

    await control.open();
    control.closeFromPanelForTest();
    expect(control.isOpen()).toBe(false);
  });
});
