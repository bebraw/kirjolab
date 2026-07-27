import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectTemplateSummary } from "../domain/project-templates";
import type { WorkspaceSummary } from "../domain/workspace";
import type { DeferredDeletionNoticeOptions } from "./deferred-deletion";
import { ProjectStartingPointBrowser, type StartingPointAction } from "./project-starting-point-browser";

const builtIn: ProjectTemplateSummary = {
  createdAt: null,
  description: "Guided structure",
  id: "builtin-guided",
  name: "Guided project",
  preview: {
    citationStyle: "apa",
    fileCount: 2,
    files: ["main.md"],
    folderCount: 1,
    folders: ["notes"],
    hasBibliography: true,
    locale: "en-US",
    paperSize: "a4",
    submissionTemplate: "article",
  },
  source: "built-in",
  updatedAt: null,
};
const personal: ProjectTemplateSummary = {
  ...builtIn,
  id: "personal-1",
  name: "Personal project",
  source: "personal",
};
const projectTemplate: ProjectTemplateSummary = {
  ...builtIn,
  id: "workspace-1",
  name: "Existing project",
  source: "project",
};
const workspace: WorkspaceSummary = {
  archivedAt: null,
  createdAt: "2026-07-24T00:00:00.000Z",
  href: "/editor/workspace-1",
  id: "workspace-1",
  title: "Existing project",
  updatedAt: "2026-07-25T00:00:00.000Z",
};

class TestProjectStartingPointBrowser extends ProjectStartingPointBrowser {
  active: Element | null = null;
  closeCount = 0;
  focusCount = 0;
  focusables: readonly HTMLElement[] = [];
  modalCount = 0;
  openDialog = false;

  renderForTest() {
    return this.render();
  }

  override performUpdate(): void {}

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  chooseTemplateForTest(template: ProjectTemplateSummary): void {
    this.chooseTemplate(template);
  }

  async chooseProjectForTest(project: WorkspaceSummary): Promise<void> {
    await this.chooseProject(project);
  }

  deleteForTest(template: ProjectTemplateSummary): void {
    this.requestTemplateDelete(template);
  }

  changeTitleForTest(title: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value: title } });
    this.changeTitle(event);
  }

  async createForTest(): Promise<void> {
    await this.create(new Event("submit"));
  }

  cancelForTest(): void {
    this.close();
  }

  importForTest(action: StartingPointAction): void {
    this.openImport(action);
  }

  cycleFocusForTest(backward: boolean): void {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperties(event, { key: { value: "Tab" }, shiftKey: { value: backward } });
    this.trapFocus(event as KeyboardEvent);
  }

  restoreFocusForTest(): void {
    this.restoreFocus();
  }

  override focus(): void {
    this.focusCount += 1;
  }

  protected override showModal(): void {
    this.modalCount += 1;
  }

  protected override returnTarget(trigger: HTMLElement): HTMLElement {
    return trigger;
  }

  protected override closeModal(): void {
    this.closeCount += 1;
  }

  protected override focusableElements(): readonly HTMLElement[] {
    return this.focusables;
  }

  protected override activeElement(): Element | null {
    return this.active;
  }

  protected override hasOpenDialog(): boolean {
    return this.openDialog;
  }

  nativeDialogForTest(): readonly unknown[] {
    super.showModal();
    super.closeModal();
    return [super.returnTarget(this), super.focusableElements(), super.activeElement(), super.hasOpenDialog()];
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

  querySelector(): null {
    return null;
  }

  querySelectorAll(): readonly [] {
    return [];
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("project starting point browser", () => {
  it("owns the light-DOM create form and template presentation", () => {
    const browser = new TestProjectStartingPointBrowser();
    expect(browser.rootForTest()).toBe(browser);
    expect(browser.renderForTest()).toBeDefined();
    browser.setData([builtIn, personal], []);
    browser.setTemplateHidden("personal-1", true);
    expect(browser.availableTemplates).toEqual([builtIn]);
    browser.setTemplateHidden("personal-1", false);
    expect(browser.availableTemplates).toEqual([builtIn, personal]);
    expect(browser.renderForTest()).toBeDefined();
    browser.showError("Could not load templates.");
    browser.startLoading();
    expect(browser.renderForTest()).toBeDefined();
  });

  it("creates a project from the local title and selection", async () => {
    const browser = new TestProjectStartingPointBrowser();
    const actions: StartingPointAction[] = [];
    const assign = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(workspace));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign });
    browser.bind({
      openImport: (action) => actions.push(action),
      presentNotice: vi.fn(),
      templatesChanged: vi.fn(),
    });
    browser.setData([builtIn], []);
    browser.changeTitleForTest("Focused inquiry");
    await browser.createForTest();
    expect(actions).toEqual([]);
    browser.chooseTemplateForTest(builtIn);
    await browser.createForTest();
    expect(assign.mock.calls).toEqual([[workspace.href]]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces",
      expect.objectContaining({ body: JSON.stringify({ title: "Focused inquiry", templateId: "builtin-guided" }), method: "POST" }),
    );
    browser.cancelForTest();
    browser.importForTest("import-github");
    browser.importForTest("import-latex");
    expect(actions).toEqual(["import-github", "import-latex"]);
    expect(browser.closeCount).toBe(3);
    browser.reset();
    browser.setData([], []);
    expect(browser.renderForTest()).toBeDefined();
  });

  it("loads project sources, creates from them, and restores an optimistically removed personal template", async () => {
    const browser = new TestProjectStartingPointBrowser();
    const notices: { message: string; options: DeferredDeletionNoticeOptions | undefined }[] = [];
    const assign = vi.fn();
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      Response.json(String(input).endsWith("/template-preview") ? projectTemplate : workspace),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign });
    browser.bind({
      openImport: vi.fn(),
      presentNotice: (message, options) => notices.push({ message, options }),
      templatesChanged: vi.fn(),
    });
    browser.setData([builtIn, personal], [workspace]);
    await browser.chooseProjectForTest(workspace);
    browser.rejectProjectSource({ ...workspace, id: "other" }, "Ignored");
    browser.changeTitleForTest("Copied project");
    await browser.createForTest();
    browser.deleteForTest(personal);
    await Promise.resolve();
    expect(browser.availableTemplates).toEqual([builtIn]);
    notices.at(-1)?.options?.action();
    await Promise.resolve();
    expect(browser.availableTemplates).toEqual([builtIn, personal]);
    expect(notices.at(-1)?.message).toBe(`Restored template “${personal.name}”.`);
    expect(assign.mock.calls).toEqual([[workspace.href]]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/workspaces",
      expect.objectContaining({ body: JSON.stringify({ title: "Copied project", sourceWorkspaceId: "workspace-1" }), method: "POST" }),
    );
  });

  it("refreshes and validates the template catalog", async () => {
    const browser = new TestProjectStartingPointBrowser();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([builtIn, personal])));
    await browser.refresh([workspace]);
    expect(browser.availableTemplates).toEqual([builtIn, personal]);
  });

  it("commits an encoded personal-template deletion and refreshes its catalog", async () => {
    vi.useFakeTimers();
    const browser = new TestProjectStartingPointBrowser();
    const encoded = { ...personal, id: "personal/template" };
    const notices: string[] = [];
    const templatesChanged = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json([builtIn]));
    vi.stubGlobal("fetch", fetchMock);
    browser.bind({
      openImport: vi.fn(),
      presentNotice: (message) => notices.push(message),
      templatesChanged,
    });
    browser.setData([builtIn, encoded], [workspace]);

    browser.deleteForTest(encoded);
    await vi.advanceTimersByTimeAsync(6_000);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/project-templates/personal%2Ftemplate", {
      method: "DELETE",
      credentials: "same-origin",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/project-templates", { credentials: "same-origin" });
    expect(browser.availableTemplates).toEqual([builtIn]);
    expect(notices).toEqual([`Deleted template “${encoded.name}”.`]);
    expect(templatesChanged).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed catalogs and contains request failures", async () => {
    const browser = new TestProjectStartingPointBrowser();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ templates: [] }))
      .mockResolvedValueOnce(Response.json({ error: "Creation denied" }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ id: workspace.id }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(browser.refresh([workspace])).rejects.toThrow("Project templates returned invalid data");
    browser.setData([builtIn], [workspace]);
    browser.chooseTemplateForTest(builtIn);
    await browser.createForTest();
    await browser.chooseProjectForTest(workspace);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("owns modal and focus lifecycle", () => {
    const browser = new TestProjectStartingPointBrowser();
    const first = new TestProjectStartingPointBrowser();
    const last = new TestProjectStartingPointBrowser();
    browser.open(browser);
    expect(browser.modalCount).toBe(1);
    browser.close();
    expect(browser.closeCount).toBe(1);

    browser.focusables = [first, last];
    browser.active = last;
    browser.cycleFocusForTest(false);
    expect(first.focusCount).toBe(1);
    browser.active = first;
    browser.cycleFocusForTest(true);
    expect(last.focusCount).toBe(1);

    browser.openDialog = true;
    browser.restoreFocusForTest();
    expect(browser.focusCount).toBe(0);
    browser.openDialog = false;
    browser.restoreFocusForTest();
    expect(browser.focusCount).toBe(1);
  });

  it("binds lifecycle behavior to its native parent dialog", () => {
    const browser = new TestProjectStartingPointBrowser();
    const dialog = new FakeDialog();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    vi.stubGlobal("document", { activeElement: null, querySelector: () => null });
    Object.defineProperty(browser, "closest", { value: () => dialog });
    Object.defineProperty(browser, "replaceChildren", { value: () => undefined });

    browser.connectedCallback();
    expect(browser.nativeDialogForTest()).toEqual([browser, [], null, false]);
    expect(dialog.modalCount).toBe(1);
    expect(dialog.closeCount).toBe(1);
    browser.disconnectedCallback();
  });
});
