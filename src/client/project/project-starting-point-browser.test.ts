import { afterEach, describe, expect, it, vi } from "vitest";
import { nothing, type TemplateResult } from "lit";
import { isTemplateResult } from "lit/directive-helpers.js";
import type { ProjectTemplateSummary } from "../../domain/project/project-templates";
import type { WorkspaceSummary } from "../../domain/workspace/workspace";
import type { DeferredDeletionNoticeOptions } from "../platform/deferred-deletion";
import { ProjectStartingPointBrowser, type StartingPointAction } from "./project-starting-point-browser";
import { ProjectImportPanel } from "./project-import-panel";
import { LatexImportPanel } from "../integrations/latex/latex-import-panel";
import { GitHubImportPanel } from "../integrations/github/github-import-panel";

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

function templateText(value: unknown): string {
  if (value === nothing || value === null || value === undefined || typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map(templateText).join("");
  if (isTemplateResult(value, 1))
    return value.strings.reduce((result, part, index) => result + part + templateText(value.values[index]), "");
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function binding(template: TemplateResult, marker: string): unknown {
  const index = template.strings.findIndex((part) => part.includes(marker));
  if (index < 0) throw new Error(`Missing rendered binding: ${marker}`);
  return template.values[index];
}

class TestProjectStartingPointBrowser extends ProjectStartingPointBrowser {
  active: Element | null = null;
  closeCount = 0;
  focusCount = 0;
  firstFocusCount = 0;
  focusables: readonly HTMLElement[] = [];
  modalCount = 0;
  openDialog = false;

  constructor() {
    super();
    this.configure({ github: true });
  }

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
  loadPageForTest(): Promise<void> {
    return this.loadCreationPage();
  }
  backForTest(): void {
    this.previousStep();
  }
  chooseAgainForTest(): void {
    this.chooseAgain();
  }
  importStateForTest(detail: unknown): void {
    this.importStateChanged(new CustomEvent("project-creation-state", { detail }));
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

  override focusFirst(): void {
    this.firstFocusCount += 1;
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
  it.each([
    ["import-project", "project-import-panel", ProjectImportPanel],
    ["import-latex", "latex-import-panel", LatexImportPanel],
    ["import-github", "github-import-panel", GitHubImportPanel],
  ] as const)("keeps Back to setup on step two for %s", (action, selector, Panel) => {
    const browser = new TestProjectStartingPointBrowser();
    browser.standalone = true;
    const panel = new Panel();
    panel.standalone = true;
    panel.addEventListener("project-creation-state", (event) => {
      if (event instanceof CustomEvent) browser.importStateForTest(event.detail);
    });
    Object.defineProperty(browser, "querySelector", { value: (value: string) => (value === selector ? panel : null) });
    browser.importForTest(action);
    browser.importStateForTest({ step: 3, busy: false });
    browser.backForTest();
    const activeStep = /aria-current=step[^>]*>\s*<span>(\d+)<\/span>([^<]+)/u.exec(templateText(browser.renderForTest()))?.slice(1);
    expect(activeStep).toEqual(["02", "Project setup"]);
    expect(templateText(browser.renderForTest())).toContain(`${selector} standalone`);
  });

  it("keeps template creation read-only until the final step and preserves setup when going back", async () => {
    const browser = new TestProjectStartingPointBrowser();
    browser.standalone = true;
    browser.setData([builtIn], []);
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(workspace));
    await browser.createForTest();
    expect(templateText(browser.renderForTest())).toContain("Choose a starting point.");
    browser.chooseTemplateForTest(builtIn);
    await browser.createForTest();
    expect(templateText(browser.renderForTest())).toContain("Name your project");
    await browser.createForTest();
    expect(templateText(browser.renderForTest())).toContain("Enter a project title.");
    browser.changeTitleForTest("Reviewed template");
    await browser.createForTest();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(templateText(browser.renderForTest())).toContain("Reviewed template");
    browser.backForTest();
    expect(templateText(browser.renderForTest())).toContain("Name your project");
    await browser.createForTest();
    await browser.createForTest();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(workspace.href);
  });

  it("loads the standalone catalog and routes imports through setup and review", async () => {
    const browser = new TestProjectStartingPointBrowser();
    browser.standalone = true;
    vi.stubGlobal("document", { body: { dataset: {} } });
    Object.defineProperty(browser, "querySelector", { value: () => null });
    vi.stubGlobal("location", { href: "https://example.test/projects/new" });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([workspace]))
      .mockResolvedValueOnce(Response.json([builtIn]));
    await browser.loadPageForTest();
    expect(templateText(browser.renderForTest())).toContain("Guided project");
    browser.importForTest("import-project");
    expect(templateText(browser.renderForTest())).toContain("project-import-panel standalone");
    browser.importStateForTest({ step: 3, busy: true });
    browser.chooseAgainForTest();
    expect(templateText(browser.renderForTest())).toContain("project-import-panel standalone");
    browser.importStateForTest({ step: 3, busy: false });
    expect(templateText(browser.renderForTest())).toContain("Back to setup");
    browser.importStateForTest({ step: 4, busy: "wrong" });
    browser.importStateForTest(null);
    browser.backForTest();
    browser.chooseAgainForTest();
    expect(templateText(browser.renderForTest())).toContain("Choose a starting point");
    browser.importForTest("import-latex");
    expect(templateText(browser.renderForTest())).toContain("latex-import-panel standalone");
    browser.chooseAgainForTest();
    browser.importForTest("import-github");
    expect(templateText(browser.renderForTest())).toContain("github-import-panel standalone");
  });

  it("reports standalone catalog errors without enabling creation", async () => {
    const browser = new TestProjectStartingPointBrowser();
    browser.standalone = true;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ invalid: true }));
    await browser.loadPageForTest();
    expect(templateText(browser.renderForTest())).toContain("Project catalog returned invalid data");
  });
  it("presents the catalog, structure and publication setup before enabling project creation", () => {
    vi.stubGlobal("document", { body: { dataset: { workspaceId: "workspace-1" } } });
    const browser = new TestProjectStartingPointBrowser();
    browser.setData([builtIn, personal], [workspace]);
    let view = browser.renderForTest();
    let text = templateText(view);
    for (const label of [
      "Built in",
      "Your templates",
      "Existing projects",
      "Built-in template",
      "Guided structure",
      "Current project · copy its latest reusable structure.",
    ])
      expect(text).toContain(label);
    expect(text.match(/class="template-choice-name">Guided project/gu)).toHaveLength(1);
    expect(text.match(/class="template-choice-name">Personal project/gu)).toHaveLength(1);
    expect(text).toContain("<strong>2</strong><span>Markdown files</span>");
    expect(text).toContain("<strong>1</strong><span>folder</span>");
    expect(text).toContain("<strong>Included</strong><span>bibliography</span>");
    expect(text).toContain('data-kind="file">main.md</li>');
    expect(text).toContain('data-kind="folder">notes</li>');
    expect(text).toContain('data-kind="more">+ 1 more</li>');
    expect(text).toContain("<dd>Article</dd>");
    expect(text).toContain("<dd>APA · en-US</dd>");
    expect(text).toContain("<dd>A4</dd>");
    expect(text).toContain("Choose a starting point from the template list.");
    expect(binding(view, 'id="create-workspace"')).toBe(true);
    expect(binding(view, "?hidden=")).toBe(false);
    browser.chooseTemplateForTest(personal);
    view = browser.renderForTest();
    text = templateText(view);
    expect(text).toContain("Personal template");
    expect(text).toContain("Selected starting point");
    expect(text).toContain("Using “Personal project”. The new project will be an independent copy.");
    expect(text.match(/class="template-choice-name">Personal project/gu)).toHaveLength(1);
    expect(binding(view, 'id="create-workspace"')).toBe(false);
    browser.configure({ github: false });
    expect(binding(browser.renderForTest(), 'id="open-github-import"')).toBe(true);
    browser.setTemplateHidden(personal.id, true);
    expect(templateText(browser.renderForTest())).toContain("Choose a starting point.");
    expect(binding(browser.renderForTest(), 'id="create-workspace"')).toBe(true);
  });

  it("shows singular counts, empty bibliography and alternate publication settings without hidden paths", () => {
    const browser = new TestProjectStartingPointBrowser();
    const template: ProjectTemplateSummary = {
      ...builtIn,
      preview: {
        fileCount: 1,
        files: ["essay.md"],
        folderCount: 0,
        folders: [],
        hasBibliography: false,
        paperSize: "letter",
        submissionTemplate: "journal-two-column",
        citationStyle: "ieee",
        locale: "fi-FI",
      },
    };
    browser.setData([template], []);
    const text = templateText(browser.renderForTest());
    expect(text).toContain("<strong>1</strong><span>Markdown file</span>");
    expect(text).toContain("<strong>0</strong><span>folders</span>");
    expect(text).toContain("<strong>Empty</strong><span>bibliography</span>");
    expect(text).toContain('data-kind="file">essay.md</li>');
    expect(text).not.toContain('data-kind="more"');
    expect(text).toContain("<dd>Journal Two Column</dd>");
    expect(text).toContain("<dd>IEEE · fi-FI</dd>");
    expect(text).toContain("<dd>US Letter</dd>");
  });

  it("keeps a project source unselected while loading and ignores superseded results", async () => {
    vi.stubGlobal("document", { body: { dataset: {} } });
    const browser = new TestProjectStartingPointBrowser();
    let resolve: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((done) => {
          resolve = done;
        }),
      ),
    );
    browser.setData([builtIn], [workspace]);
    const pending = browser.chooseProjectForTest(workspace);
    expect(templateText(browser.renderForTest())).toContain("Loading the project structure…");
    expect(templateText(browser.renderForTest())).toContain("Loading “Existing project”…");
    expect(binding(browser.renderForTest(), 'id="create-workspace"')).toBe(true);
    browser.chooseTemplateForTest(builtIn);
    resolve(Response.json(projectTemplate));
    await pending;
    expect(templateText(browser.renderForTest())).toContain("Built-in template");
    expect(templateText(browser.renderForTest())).not.toContain("Using “Existing project”");
    browser.setData([], []);
    expect(templateText(browser.renderForTest())).toContain("No starting points are available.");
  });

  it("does not expose the GitHub import action when the capability is unavailable", () => {
    const browser = new TestProjectStartingPointBrowser();
    const openGitHub = vi.fn();
    browser.configure({ github: false });
    browser.bindWorkspace({
      gitHubImportPanel: { open: openGitHub },
      latexImportPanel: { open: vi.fn() },
      newWorkspace: new EventTarget() as HTMLElement,
      saveTemplateDialog: { syncTemplates: vi.fn() },
      toast: { show: vi.fn() },
      workspaceCatalogPanel: { catalog: [] },
    });

    browser.importForTest("import-github");

    expect(openGitHub).not.toHaveBeenCalled();
    expect(browser.closeCount).toBe(0);
  });

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
    browser.bindWorkspace({
      gitHubImportPanel: { open: () => actions.push("import-github") },
      latexImportPanel: { open: () => actions.push("import-latex") },
      newWorkspace: new EventTarget() as HTMLElement,
      saveTemplateDialog: { syncTemplates: vi.fn() },
      toast: { show: vi.fn() },
      workspaceCatalogPanel: { catalog: [] },
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
    browser.bindWorkspace({
      gitHubImportPanel: { open: vi.fn() },
      latexImportPanel: { open: vi.fn() },
      newWorkspace: new EventTarget() as HTMLElement,
      saveTemplateDialog: { syncTemplates: vi.fn() },
      toast: { show: (message, options) => notices.push({ message, options }) },
      workspaceCatalogPanel: { catalog: [] },
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
    const templatesChanged = vi.fn();
    browser.bindWorkspace({
      gitHubImportPanel: { open: vi.fn() },
      latexImportPanel: { open: vi.fn() },
      newWorkspace: new EventTarget() as HTMLElement,
      saveTemplateDialog: { syncTemplates: templatesChanged },
      toast: { show: vi.fn() },
      workspaceCatalogPanel: { catalog: [workspace] },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([builtIn, personal])));
    await browser.refresh();
    expect(browser.availableTemplates).toEqual([builtIn, personal]);
    expect(templatesChanged).toHaveBeenCalledOnce();
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
    browser.bindWorkspace({
      gitHubImportPanel: { open: vi.fn() },
      latexImportPanel: { open: vi.fn() },
      newWorkspace: new EventTarget() as HTMLElement,
      saveTemplateDialog: { syncTemplates: templatesChanged },
      toast: { show: (message) => notices.push(message) },
      workspaceCatalogPanel: { catalog: [] },
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

  it("opens the dedicated creation route from the editor trigger", async () => {
    const browser = new TestProjectStartingPointBrowser();
    const trigger = new EventTarget();
    const load = vi.fn().mockResolvedValue(undefined);
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    browser.bindWorkspace(
      {
        gitHubImportPanel: { open: vi.fn() },
        latexImportPanel: { open: vi.fn() },
        newWorkspace: trigger as HTMLElement,
        saveTemplateDialog: { syncTemplates: vi.fn() },
        toast: { show: vi.fn() },
        workspaceCatalogPanel: { catalog: [] },
      },
      load,
    );

    trigger.dispatchEvent(new Event("click"));
    expect(assign).toHaveBeenCalledWith("/projects/new");
    expect(load).not.toHaveBeenCalled();
    expect(browser.modalCount).toBe(0);
  });

  it("owns one-shot browser create requests", async () => {
    const browser = new TestProjectStartingPointBrowser();
    const open = vi.spyOn(browser, "openFromBoundTrigger").mockResolvedValue();
    const replace = vi.fn();

    await expect(browser.openFromBrowserRequest(new URL("https://example.test/editor?other=1"), replace)).resolves.toBe(false);
    await expect(browser.openFromBrowserRequest(new URL("https://example.test/editor?create=1"), replace)).resolves.toBe(true);

    expect(replace).toHaveBeenCalledWith("/editor");
    expect(open).toHaveBeenCalledOnce();
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
