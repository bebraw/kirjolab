import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GitHubSyncMenu,
  gitHubSyncPullEvent,
  gitHubSyncPushEvent,
  gitHubSyncSettingsEvent,
  gitHubSyncStateEvent,
  type GitHubSyncStateDetail,
} from "./github-sync-menu";
import { gitHubSyncMutationEvent } from "./github-sync-review";
import { WorkspaceSettingsPanel, type GitHubSyncPreview } from "./workspace-settings-panel";

const connection = {
  owner: "bebraw",
  repository: "scalability_book",
  branch: "main",
  rootPath: "book",
  commitSha: "a".repeat(40),
};

class TestWorkspaceSettings extends WorkspaceSettingsPanel {
  activePreview = false;
  dialogOpen = false;
  configuredWith = "";
  connections: Array<{ connected: boolean; status: string }> = [];
  previews: GitHubSyncPreview[] = [];
  resetCount = 0;

  override get open(): boolean {
    return this.dialogOpen;
  }

  override get hasActiveGitHubPreview(): boolean {
    return this.activePreview;
  }

  override configureGitHub(apiBase: string): void {
    this.configuredWith = apiBase;
  }

  override setGitHubConnection(connected: boolean, status: string): void {
    this.connections.push({ connected, status });
  }

  override resetGitHubReview(): void {
    this.resetCount += 1;
  }

  override async previewGitHub(operation: GitHubSyncPreview): Promise<void> {
    this.previews.push(operation);
  }
}

describe("GitHub sync menu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("coordinates workspace settings, previews, and mutation refreshes", async () => {
    const menu = new GitHubSyncMenu();
    const settings = new TestWorkspaceSettings();
    const openSettings = vi.spyOn(settings, "openSettings").mockResolvedValue(undefined);
    const refreshProject = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { onLine: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(null));
    menu.bindWorkspace("/api/workspaces/project", false, { request: refreshProject }, { workspaceSettingsPanel: settings });

    menu.dispatchEvent(new CustomEvent<GitHubSyncStateDetail>(gitHubSyncStateEvent, { detail: { connected: true, message: "Synced" } }));
    menu.dispatchEvent(new CustomEvent(gitHubSyncPullEvent));
    menu.dispatchEvent(new CustomEvent(gitHubSyncPushEvent));
    menu.dispatchEvent(new CustomEvent(gitHubSyncSettingsEvent));
    settings.dispatchEvent(new CustomEvent(gitHubSyncMutationEvent, { detail: "pull" }));
    await vi.waitFor(() => expect(refreshProject).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(settings.connections).toHaveLength(2));

    expect(settings.configuredWith).toBe("/api/workspaces/project");
    expect(settings.connections).toEqual([
      { connected: true, status: "Synced" },
      { connected: false, status: "This project is not connected to GitHub." },
    ]);
    expect(openSettings.mock.calls).toEqual([[false], [false], []]);
    expect(settings.previews).toEqual(["pull", "push"]);
    expect(settings.resetCount).toBe(0);
  });

  it("pauses ambient workspace refreshes during review", async () => {
    const menu = new GitHubSyncMenu();
    const settings = new TestWorkspaceSettings();
    vi.stubGlobal("navigator", { onLine: true });
    const refresh = vi.spyOn(menu, "refresh").mockResolvedValue();
    menu.bindWorkspace("/api/workspaces/project", false, { request: async () => undefined }, { workspaceSettingsPanel: settings });

    settings.activePreview = true;
    await menu.refreshWorkspace();
    settings.activePreview = false;
    settings.dialogOpen = true;
    await menu.refreshWorkspace();
    settings.dialogOpen = false;
    await menu.refreshWorkspace();

    expect(refresh).toHaveBeenCalledOnce();
    expect(settings.resetCount).toBe(1);
  });

  it("owns ambient online, focus, and visibility refresh triggers", () => {
    const menu = new GitHubSyncMenu();
    const settings = new TestWorkspaceSettings();
    const browserWindow = new EventTarget();
    const browserDocument = Object.assign(new EventTarget(), { visibilityState: "hidden" });
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("document", browserDocument);
    const refreshWorkspace = vi.spyOn(menu, "refreshWorkspace").mockResolvedValue(undefined);
    menu.bindWorkspace("/api/workspaces/project", true, { request: async () => undefined }, { workspaceSettingsPanel: settings });

    browserWindow.dispatchEvent(new Event("focus"));
    browserWindow.dispatchEvent(new Event("online"));
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    browserDocument.visibilityState = "visible";
    browserDocument.dispatchEvent(new Event("visibilitychange"));

    expect(refreshWorkspace.mock.calls).toEqual([[], [true], []]);
    menu.disconnectedCallback();
    browserWindow.dispatchEvent(new Event("focus"));
    expect(refreshWorkspace).toHaveBeenCalledTimes(3);
  });

  it("owns connection and status refresh presentation", async () => {
    const menu = new GitHubSyncMenu();
    menu.configure("/api/workspaces/project");
    const states: GitHubSyncStateDetail[] = [];
    menu.addEventListener(gitHubSyncStateEvent, (event) => states.push((event as CustomEvent<GitHubSyncStateDetail>).detail));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(connection))
      .mockResolvedValueOnce(
        Response.json({
          ...connection,
          remoteHead: "b".repeat(40),
          remoteHeadChanged: true,
          relationship: "github-ahead",
          incomingChanges: 1,
          outgoingChanges: 0,
          conflicts: 0,
        }),
      );

    expect(menu.refreshDue()).toBe(true);
    await menu.refresh();

    expect(menu.refreshDue()).toBe(false);
    expect(menu.refreshDue(true)).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/workspaces/project/github-sync", { credentials: "same-origin" });
    expect(states).toEqual([
      {
        connected: true,
        message: `bebraw/scalability_book · main · book/ · 1 incoming change on GitHub.`,
      },
    ]);
  });

  it("reports disconnected and failed refreshes", async () => {
    const menu = new GitHubSyncMenu();
    menu.configure("/api/workspaces/project");
    const states: GitHubSyncStateDetail[] = [];
    menu.addEventListener(gitHubSyncStateEvent, (event) => states.push((event as CustomEvent<GitHubSyncStateDetail>).detail));
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(Response.json({ error: "Remote unavailable" }, { status: 503 }));

    await menu.refresh();
    await menu.refresh();

    expect(states).toEqual([
      { connected: false, message: "This project is not connected to GitHub." },
      { connected: false, message: "Remote unavailable" },
    ]);
  });

  it("ignores a superseded connection response", async () => {
    const menu = new GitHubSyncMenu();
    menu.configure("/api/workspaces/project");
    const states: GitHubSyncStateDetail[] = [];
    menu.addEventListener(gitHubSyncStateEvent, (event) => states.push((event as CustomEvent<GitHubSyncStateDetail>).detail));
    let resolveFirst: (response: Response) => void = () => undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(firstResponse).mockResolvedValueOnce(Response.json(null));

    const first = menu.refresh();
    await menu.refresh();
    resolveFirst(Response.json(connection));
    await first;

    expect(states).toEqual([{ connected: false, message: "This project is not connected to GitHub." }]);
  });
});
