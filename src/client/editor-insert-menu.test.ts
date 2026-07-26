import { describe, expect, it } from "vitest";
import type { ProjectFile } from "../domain/project-files";
import {
  EditorInsertMenu,
  editorInsertActionEvent,
  type EditorInsertAction,
  type EditorSyntaxKind,
  type EditorSyntaxTemplate,
} from "./editor-insert-menu";

const createdAt = "2026-07-25T00:00:00.000Z";
const mainFile: ProjectFile = {
  content: "# Main",
  createdAt,
  id: "file:1",
  mediaType: "text/markdown",
  path: "main.md",
  updatedAt: createdAt,
};
const nestedFile: ProjectFile = { ...mainFile, id: "file:2", path: "sections/methods.md" };

class TestEditorInsertMenu extends EditorInsertMenu {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: EditorInsertAction): void {
    this.emitAction(action);
  }

  selectSyntaxForTest(kind: EditorSyntaxKind, template: EditorSyntaxTemplate): void {
    this.emitForTest({ action: "syntax", kind, template });
  }
}

describe("editor insert menu", () => {
  it("owns fallback, empty, and relative include-file presentation", () => {
    const menu = new TestEditorInsertMenu();
    expect(menu.rootForTest()).toBe(menu);
    expect(menu.renderForTest()).toBeDefined();
    menu.setFiles(mainFile, [mainFile]);
    expect(menu.renderForTest()).toBeDefined();
    menu.setFiles(nestedFile, [mainFile, nestedFile]);
    expect(menu.renderForTest()).toBeDefined();
  });

  it("emits syntax and relative include intents", () => {
    const menu = new TestEditorInsertMenu();
    const actions: EditorInsertAction[] = [];
    menu.addEventListener(editorInsertActionEvent, (event) => {
      actions.push((event as CustomEvent<EditorInsertAction>).detail);
    });
    menu.selectSyntaxForTest("citation", { text: ":cite[key]", select: "key" });
    menu.emitForTest({ action: "include-file", path: mainFile.path, relativePath: "../main.md" });
    expect(actions).toEqual([
      { action: "syntax", kind: "citation", template: { text: ":cite[key]", select: "key" } },
      { action: "include-file", path: "main.md", relativePath: "../main.md" },
    ]);
  });
});
