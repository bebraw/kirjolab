import { describe, expect, it } from "vitest";
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
  renderForTest() {
    return this.render();
  }

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
}

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
});
