import { nothing } from "lit";
import { isTemplateResult } from "lit/directive-helpers.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubImportPanel } from "./github-import-panel";

class TestGitHubImportPanel extends GitHubImportPanel {
  focusCount = 0;

  constructor() {
    super();
    this.configure({ github: true });
  }

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  previewForTest(): Promise<void> {
    return this.previewImport(new Event("submit") as SubmitEvent);
  }

  cancelForTest(): void {
    this.requestCancel();
  }

  confirmForTest(): Promise<void> {
    return this.confirmImport();
  }

  disconnectForTest(): Promise<void> {
    return this.disconnect();
  }

  override focusTitle(): void {
    this.focusCount += 1;
  }
}

class DeferredCapabilityGitHubImportPanel extends GitHubImportPanel {
  override performUpdate(): void {}

  override focusTitle(): void {}
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
  it("keeps standalone setup, review and busy controls synchronized with creation progress", () => {
    const panel = new TestGitHubImportPanel();
    panel.standalone = true;
    const states: unknown[] = [];
    const back = vi.fn();
    panel.addEventListener("project-creation-state", (event) => {
      if (event instanceof CustomEvent) {
        states.push(event.detail);
        expect(event.bubbles).toBe(true);
      }
    });
    panel.addEventListener("project-creation-back", back);
    let view = markup(panel.renderForTest());
    expect(control(view, "preview-github-import")).toContain("?hidden=false");
    expect(control(view, "preview-github-import")).toContain("?disabled=true");
    expect(view).toContain("/api/github/connect?returnTo=%2Fprojects%2Fnew%3Fsource%3Dgithub");
    expect(view).toContain("/api/github/install?returnTo=%2Fprojects%2Fnew%3Fsource%3Dgithub");
    expect(view).toContain("Choose another starting point");
    panel.setInstallations([installation]);
    panel.setRepositories([repository]);
    panel.setBranches([{ name: "main", protected: true }], "main");
    expect(control(markup(panel.renderForTest()), "preview-github-import")).toContain("?disabled=false");
    panel.beginPreview();
    view = markup(panel.renderForTest());
    expect(view).toContain("Reading the selected commit…");
    expect(control(view, "preview-github-import")).toContain("?disabled=true");
    panel.showPreview({ id: "preview-1", commitSha: "1234567890abcdef", entryPath: "main.md", files: [{ path: "main.md", bytes: 10 }] });
    view = markup(panel.renderForTest());
    expect(control(view, "preview-github-import")).toContain("?hidden=true");
    expect(view).toMatch(/aria-labelledby="github-connection-heading"\s+\?hidden=true/u);
    expect(view).toContain('sm:grid-cols-2" ?hidden=true');
    expect(view).toContain("1234567890 previewed. Confirm to create the project.");
    expect(view).toContain("1 Markdown files · entry main.md");
    expect(view).toContain("main.md · 1 KB");
    panel.beginCreation();
    expect(markup(panel.renderForTest())).toContain("Creating the project…");
    panel.showCreationError("Try again");
    expect(markup(panel.renderForTest())).toContain("Try again");
    panel.edit();
    view = markup(panel.renderForTest());
    expect(control(view, "preview-github-import")).toContain("?hidden=false");
    expect(view).toContain("Preview to inspect the selected files and resolved entry.");
    expect(states).toEqual([
      { step: 2, busy: true },
      { step: 3, busy: false },
      { step: 3, busy: true },
      { step: 3, busy: false },
      { step: 2, busy: false },
    ]);
    panel.cancelForTest();
    expect(back).toHaveBeenCalledOnce();
  });

  it("shows picker placeholders and resets dependent selections while loading", () => {
    const panel = new TestGitHubImportPanel();
    expect(markup(panel.renderForTest())).toContain("Connect GitHub first");
    expect(markup(panel.renderForTest())).toContain("Checking connection…");
    panel.beginConnectionRefresh();
    expect(control(markup(panel.renderForTest()), "github-installation-id")).toContain("?disabled=true");
    panel.setInstallationsLoading();
    expect(markup(panel.renderForTest())).toContain("Loading accounts…");
    panel.setInstallations([]);
    expect(markup(panel.renderForTest())).toContain("No installations available");
    panel.setInstallations([installation, { ...installation, id: 8, accountLogin: "ada", accountType: "User" }]);
    panel.setRepositories([repository, { ...repository, id: 12, fullName: "research-lab/public", private: false }]);
    panel.setBranches(
      [
        { name: "draft", protected: false },
        { name: "main", protected: true },
      ],
      "main",
    );
    let view = markup(panel.renderForTest());
    expect(view).toContain("research-lab · organization");
    expect(view).toContain("ada · personal");
    expect(view).toContain("research-lab/paper · private");
    expect(view).toContain("value=12>research-lab/public</option>");
    expect(view).toContain("value=main>main · protected");
    expect(view).toContain("value=draft>draft</option>");
    expect(control(view, "github-installation-id")).toContain("?disabled=false");
    expect(control(view, "github-repository")).toContain("?disabled=false");
    expect(control(view, "github-branch")).toContain("?disabled=false");
    panel.setBranches([{ name: "draft", protected: false }], "absent");
    expect(panel.selection.branch).toBe("draft");
    panel.setBranches([], "main");
    expect(markup(panel.renderForTest())).toContain("No branches available");
    expect(panel.selection.branch).toBe("");
    panel.setRepositoriesLoading();
    expect(markup(panel.renderForTest())).toContain("Loading repositories…");
    expect(panel.selection.repository).toBeNull();
    panel.setRepositories([]);
    expect(markup(panel.renderForTest())).toContain("No repositories available");
    panel.resetDisconnected();
    view = markup(panel.renderForTest());
    expect(view).toContain("Connect GitHub first");
    expect(view).toContain("Choose an account");
    expect(view).toContain("Choose a repository");
    expect(panel.selection).toMatchObject({ installationId: null, repository: null, branch: "" });
  });

  it("shows actionable request failures and preserves retry after a failed creation", async () => {
    const panel = new TestGitHubImportPanel();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await panel.previewForTest();
    expect(markup(panel.renderForTest())).toContain("Choose a GitHub account");
    expect(fetcher).not.toHaveBeenCalled();
    panel.setInstallations([installation]);
    await panel.previewForTest();
    expect(markup(panel.renderForTest())).toContain("Choose a GitHub repository");
    panel.setRepositories([repository]);
    panel.setBranches([{ name: "main", protected: false }], "main");
    fetcher.mockResolvedValueOnce(jsonResponse({ invalid: true }));
    await panel.previewForTest();
    expect(markup(panel.renderForTest())).toContain("GitHub returned an invalid import preview");
    panel.showPreview({ id: "preview-1", commitSha: "1234567890abcdef", entryPath: "main.md", files: [{ path: "main.md", bytes: 10 }] });
    fetcher.mockResolvedValueOnce(jsonResponse({ invalid: true }));
    await panel.confirmForTest();
    expect(markup(panel.renderForTest())).toContain("GitHub import returned invalid project data");
    expect(markup(panel.renderForTest())).toMatch(/class="button-primary"\s+type="button"\s+\?hidden=false\s+\?disabled=false/u);
  });

  it("stays hidden and makes no requests without the GitHub capability", async () => {
    const panel = new TestGitHubImportPanel();
    const dialog = new FakeDialog();
    const replace = vi.fn();
    const fetcher = vi.fn();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("confirm", () => true);
    Object.defineProperty(panel, "closest", { value: () => dialog });
    panel.configure({ github: false });
    panel.setInstallations([installation]);
    panel.setRepositories([repository]);
    panel.setBranches([{ name: "main", protected: false }], "main");
    panel.showPreview({
      id: "preview-1",
      commitSha: "1234567890abcdef",
      entryPath: "main.md",
      files: [{ path: "main.md", bytes: 10 }],
    });

    panel.open();
    await panel.refreshConnection();
    await panel.previewForTest();
    await panel.confirmForTest();
    await panel.disconnectForTest();

    expect(panel.openFromBrowserResult(new URL("https://example.test/?github=connected"), replace)).toBe(false);
    expect(dialog.modalCount).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(markup(panel.renderForTest())).toBe("");
  });

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
    expect(markup(panel.renderForTest())).toContain("Connection unavailable");
    await panel.refreshConnection();
    expect(markup(panel.renderForTest())).toContain("Connect GitHub to choose repositories available to your account.");
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
    expect(markup(panel.renderForTest())).toContain("Reading the selected commit…");
    panel.showPreview({
      id: "preview-1",
      commitSha: "1234567890abcdef",
      entryPath: "main.md",
      files: Array.from({ length: 13 }, (_, index) => ({ path: `chapter-${index}.md`, bytes: index + 1 })),
    });
    const view = markup(panel.renderForTest());
    expect(view).toContain("13 Markdown files · entry main.md");
    expect(view.match(/<li>chapter-/gu)).toHaveLength(12);
    expect(view).toContain("chapter-11.md · 1 KB");
    expect(view).not.toContain("chapter-12.md");
    expect(view).toContain("…and 1 more");
    expect(control(view, "preview-github-import")).toContain("?hidden=false");
    expect(view).toMatch(/class="button-primary"\s+type="button"\s+\?hidden=false\s+\?disabled=false/u);
    panel.beginCreation();
    expect(markup(panel.renderForTest())).toMatch(/class="button-primary"\s+type="button"\s+\?hidden=false\s+\?disabled=true/u);
    panel.showCreationError("Could not create project.");
    expect(markup(panel.renderForTest())).toContain("Could not create project.");
    panel.showPreviewError("Could not preview repository.");
    expect(markup(panel.renderForTest())).toContain("Could not preview repository.");
    panel.resetPreview();
    expect(markup(panel.renderForTest())).toContain("Preview to inspect the selected files and resolved entry.");
    expect(markup(panel.renderForTest())).toMatch(/class="button-primary"\s+type="button"\s+\?hidden=false\s+\?disabled=true/u);
  });

  it("owns import preview, creation, and canonical project navigation", async () => {
    const panel = new TestGitHubImportPanel();
    panel.setInstallations([installation]);
    panel.setRepositories([repository]);
    panel.setBranches([{ name: "main", protected: true }], "main");
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: "preview-1", commitSha: "1234567890abcdef", entryPath: "main.md", files: [{ path: "main.md", bytes: 10 }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ workspace: { href: "/editor/project" } }));
    vi.stubGlobal("fetch", fetcher);

    await panel.previewForTest();
    await panel.confirmForTest();

    expect(assign.mock.calls).toEqual([["/editor/project"]]);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({
      installationId: 7,
      owner: "research-lab",
      repository: "paper",
      branch: "main",
      rootPath: "",
    });
    expect(JSON.parse(fetcher.mock.calls[1]?.[1]?.body as string)).toEqual({ previewId: "preview-1", title: "paper" });
  });

  it("owns cancellation and account disconnection", async () => {
    const panel = new TestGitHubImportPanel();
    const dialog = new FakeDialog();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    Object.defineProperty(panel, "closest", { value: () => dialog });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ connected: false }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("confirm", () => true);

    panel.cancelForTest();
    await panel.disconnectForTest();

    expect(dialog.closeCount).toBe(1);
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/github/connection", { credentials: "same-origin", method: "DELETE" });
    expect(panel.selection.installationId).toBeNull();
  });

  it("owns its native dialog lifecycle", () => {
    const panel = new TestGitHubImportPanel();
    const dialog = new FakeDialog();
    const refreshConnection = vi.spyOn(panel, "refreshConnection").mockResolvedValue();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    Object.defineProperty(panel, "closest", { value: () => dialog });

    panel.open();
    panel.close();
    expect(dialog.modalCount).toBe(1);
    expect(dialog.closeCount).toBe(1);
    expect(panel.focusCount).toBe(1);
    expect(refreshConnection).toHaveBeenCalledOnce();
  });

  it("owns one-shot GitHub callback results", () => {
    const panel = new TestGitHubImportPanel();
    const open = vi.spyOn(panel, "open").mockImplementation(() => undefined);
    const replace = vi.fn();

    expect(panel.openFromBrowserResult(new URL("https://example.test/?github=ignored"), replace)).toBe(false);
    expect(panel.openFromBrowserResult(new URL("https://example.test/?github=connected"), replace)).toBe(true);
    expect(panel.openFromBrowserResult(new URL("https://example.test/?github=installed"), replace)).toBe(true);

    expect(open).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenNthCalledWith(1, "/");
    expect(replace).toHaveBeenNthCalledWith(2, "/");
  });

  it("activates a callback when capability configuration follows connection", async () => {
    const panel = new DeferredCapabilityGitHubImportPanel();
    const dialog = new FakeDialog();
    const replaceState = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ connected: false }));
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    vi.stubGlobal("location", { href: "https://example.test/?github=connected" });
    vi.stubGlobal("history", { replaceState, state: null });
    vi.stubGlobal("fetch", fetcher);
    Object.defineProperty(panel, "closest", { value: () => dialog });

    panel.connectedCallback();
    await panel.updateComplete;
    expect(dialog.modalCount).toBe(0);

    panel.configure({ github: true });
    await vi.waitFor(() => expect(dialog.modalCount).toBe(1));

    expect(fetcher).toHaveBeenCalledWith("/api/github/connection", { credentials: "same-origin" });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  });
});

function markup(value: unknown): string {
  return serialize(value).replace(/\s+/gu, " ");
}

function serialize(value: unknown): string {
  if (value === nothing || value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(serialize).join("");
  if (isTemplateResult(value, 1)) return value.strings.reduce((result, part, index) => result + part + serialize(value.values[index]), "");
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function control(value: string, id: string): string {
  const match = new RegExp(`<[^>]+id="${id}"[^>]*>`, "u").exec(value);
  if (!match) throw new Error(`Missing rendered control: ${id}`);
  return match[0];
}
