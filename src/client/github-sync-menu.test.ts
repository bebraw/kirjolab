import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubSyncMenu, gitHubSyncStateEvent, type GitHubSyncStateDetail } from "./github-sync-menu";

const connection = {
  owner: "bebraw",
  repository: "scalability_book",
  branch: "main",
  rootPath: "book",
  commitSha: "a".repeat(40),
};

describe("GitHub sync menu", () => {
  afterEach(() => vi.restoreAllMocks());

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
