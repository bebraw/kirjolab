import { describe, expect, it } from "vitest";
import type { ProjectFile } from "../domain/project-files";
import { EditorInsertMenu, type EditorInsertion, type EditorSyntaxKind, type EditorSyntaxTemplate } from "./editor-insert-menu";

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

  it("owns syntax insertion projection and relative include notices", () => {
    const menu = new TestEditorInsertMenu();
    const actions: unknown[] = [];
    menu.bind({
      applyInsertion: (insertion) => actions.push({ action: "insert", insertion }),
      authoringTarget: () => ({ caret: 4, passage: null }),
      includeFile: (relativePath) => actions.push({ action: "include-file", relativePath }),
      presentNotice: (message) => actions.push({ action: "notice", message }),
    });
    menu.selectSyntaxForTest("citation", { text: ":cite[key]", select: "key" });
    menu.includeFileForTest("../main.md", mainFile.path);
    expect(actions).toEqual([
      {
        action: "insert",
        insertion: { end: 4, selectionEnd: 13, selectionStart: 10, start: 4, text: ":cite[key]" },
      },
      { action: "notice", message: "Inserted scholarly syntax." },
      { action: "include-file", relativePath: "../main.md" },
      { action: "notice", message: "Included main.md." },
    ]);
  });

  it("wraps selected passages as links and owns external template insertion", () => {
    const menu = new TestEditorInsertMenu();
    const insertions: EditorInsertion[] = [];
    const notices: string[] = [];
    menu.bind({
      applyInsertion: (insertion) => insertions.push(insertion),
      authoringTarget: () => ({
        caret: 99,
        passage: { end: 8, excerpt: "Evidence", fileId: "file:1", start: 0 },
      }),
      includeFile: () => undefined,
      presentNotice: (message) => notices.push(message),
    });

    menu.selectSyntaxForTest("link", { text: "[text](url)", select: "text" });
    menu.insert({ text: "![Figure](asset.png)" }, "Inserted figure.");
    menu.replacePassage({ end: 8, excerpt: "Evidence", fileId: "file:1", start: 0 }, "| A |\n| - |");

    expect(insertions).toEqual([
      { end: 8, selectionEnd: 14, selectionStart: 11, start: 0, text: "[Evidence](url)" },
      { end: 8, selectionEnd: 20, selectionStart: 20, start: 0, text: "![Figure](asset.png)" },
      { end: 8, selectionEnd: 11, selectionStart: 11, start: 0, text: "| A |\n| - |" },
    ]);
    expect(notices).toEqual(["Inserted scholarly syntax.", "Inserted figure."]);
  });
});
