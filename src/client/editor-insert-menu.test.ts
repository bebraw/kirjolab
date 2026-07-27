import { describe, expect, it } from "vitest";
import type { ProjectFile } from "../domain/project-files";
import { EditorInsertMenu, type EditorSyntaxKind, type EditorSyntaxTemplate } from "./editor-insert-menu";

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

  selectSyntaxForTest(kind: EditorSyntaxKind, template: EditorSyntaxTemplate): void {
    this.insertSyntax(kind, template);
  }

  includeFileForTest(relativePath: string, path: string): void {
    this.includeFile(relativePath, path);
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

  it("binds syntax and relative include intents", () => {
    const menu = new TestEditorInsertMenu();
    const actions: unknown[] = [];
    menu.bind({
      includeFile: (relativePath, path) => actions.push({ action: "include-file", path, relativePath }),
      insertSyntax: (kind, template) => actions.push({ action: "syntax", kind, template }),
    });
    menu.selectSyntaxForTest("citation", { text: ":cite[key]", select: "key" });
    menu.includeFileForTest("../main.md", mainFile.path);
    expect(actions).toEqual([
      { action: "syntax", kind: "citation", template: { text: ":cite[key]", select: "key" } },
      { action: "include-file", path: "main.md", relativePath: "../main.md" },
    ]);
  });
});
