import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectTemplateSummary } from "../domain/project-templates";
import type { WorkspaceSummary } from "../domain/workspace";
import {
  ProjectStartingPointBrowser,
  startingPointActionEvent,
  startingPointProjectLoadEvent,
  startingPointTemplateDeleteEvent,
  type StartingPointAction,
} from "./project-starting-point-browser";

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

  chooseProjectForTest(project: WorkspaceSummary): void {
    this.chooseProject(project);
  }

  deleteForTest(template: ProjectTemplateSummary): void {
    this.requestTemplateDelete(template);
  }

  changeTitleForTest(title: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value: title } });
    this.changeTitle(event);
  }

  createForTest(): void {
    this.create(new Event("submit"));
  }

  actionForTest(action: "cancel" | "import-github" | "import-latex"): void {
    this.emitAction({ action });
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

afterEach(() => vi.unstubAllGlobals());

describe("project starting point browser", () => {
  it("owns the light-DOM create form and template presentation", () => {
    const browser = new TestProjectStartingPointBrowser();
    expect(browser.rootForTest()).toBe(browser);
    expect(browser.renderForTest()).toBeDefined();
    browser.setData([builtIn, personal], [], new Set(["personal-1"]));
    expect(browser.renderForTest()).toBeDefined();
    browser.showError("Could not load templates.");
    browser.startLoading();
    expect(browser.renderForTest()).toBeDefined();
  });

  it("emits a typed create intent with local title and selection", () => {
    const browser = new TestProjectStartingPointBrowser();
    const actions: StartingPointAction[] = [];
    browser.addEventListener(startingPointActionEvent, (event) => {
      actions.push((event as CustomEvent<StartingPointAction>).detail);
    });
    browser.setData([builtIn], [], new Set());
    browser.changeTitleForTest("Focused inquiry");
    browser.createForTest();
    expect(actions).toEqual([]);
    browser.chooseTemplateForTest(builtIn);
    browser.createForTest();
    expect(actions).toEqual([{ action: "create", startingPoint: "builtin-guided", title: "Focused inquiry" }]);
    browser.actionForTest("cancel");
    browser.actionForTest("import-github");
    browser.actionForTest("import-latex");
    expect(actions.slice(1)).toEqual([{ action: "cancel" }, { action: "import-github" }, { action: "import-latex" }]);
    browser.reset();
    browser.setData([], [], new Set());
    expect(browser.renderForTest()).toBeDefined();
  });

  it("loads project sources and requests personal-template deletion", () => {
    const browser = new TestProjectStartingPointBrowser();
    const projects: WorkspaceSummary[] = [];
    const deleted: ProjectTemplateSummary[] = [];
    const actions: StartingPointAction[] = [];
    browser.addEventListener(startingPointProjectLoadEvent, (event) => {
      projects.push((event as CustomEvent<WorkspaceSummary>).detail);
    });
    browser.addEventListener(startingPointTemplateDeleteEvent, (event) => {
      deleted.push((event as CustomEvent<ProjectTemplateSummary>).detail);
    });
    browser.addEventListener(startingPointActionEvent, (event) => {
      actions.push((event as CustomEvent<StartingPointAction>).detail);
    });
    browser.setData([builtIn, personal], [workspace], new Set());
    browser.chooseProjectForTest(workspace);
    browser.rejectProjectSource({ ...workspace, id: "other" }, "Ignored");
    browser.acceptProjectSource(workspace, projectTemplate);
    browser.changeTitleForTest("Copied project");
    browser.createForTest();
    browser.deleteForTest(personal);
    expect(projects).toEqual([workspace]);
    expect(deleted).toEqual([personal]);
    expect(actions).toEqual([{ action: "create", startingPoint: "project:workspace-1", title: "Copied project" }]);
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
