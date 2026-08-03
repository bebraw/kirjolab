import { describe, expect, it } from "vitest";
import { ProjectFileActions, projectFileActionEvent, type ProjectFileAction } from "./project-file-actions";

class TestProjectFileActions extends ProjectFileActions {
  renderForTest() {
    return this.render();
  }

  variantForTest(variant: "menu" | "rail"): void {
    this.variant = variant;
  }

  emitForTest(action: ProjectFileAction): void {
    this.emitAction(action);
  }
}

describe("project file actions", () => {
  it("renders rail and menu variants from bounded state", () => {
    const actions = new TestProjectFileActions();
    actions.variantForTest("rail");
    expect(actions.renderForTest()).toBeDefined();
    actions.variantForTest("menu");
    actions.setCompanionNotesPath("chapters/01_introduction.notes.md");
    actions.setEntryFileActive(false);
    expect(actions.renderForTest()).toBeDefined();
  });

  it("emits one typed action contract", () => {
    const actions = new TestProjectFileActions();
    const received: ProjectFileAction[] = [];
    actions.addEventListener(projectFileActionEvent, (event) => received.push((event as CustomEvent<ProjectFileAction>).detail));

    for (const action of ["create", "create-and-include", "create-folder", "create-notes", "delete", "rename", "upload-images"] as const) {
      actions.emitForTest(action);
    }

    expect(received).toEqual(["create", "create-and-include", "create-folder", "create-notes", "delete", "rename", "upload-images"]);
  });
});
