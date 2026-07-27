import { describe, expect, it } from "vitest";
import type { ServerCollaborationMessage } from "../domain/collaboration";
import type { ProjectFile } from "../domain/project-files";
import { CollaboratorSelectionList } from "./collaborator-selection-list";

class TestSelectionList extends CollaboratorSelectionList {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

type RemoteSelection = Extract<ServerCollaborationMessage, { type: "selection" }>;

const file = {
  id: "file-1",
  path: "main.md",
  content: "Selected collaborative evidence",
} as ProjectFile;

const selection: RemoteSelection = {
  type: "selection",
  collaboratorId: "collaborator-1",
  fileId: file.id,
  start: 0,
  end: 8,
  revision: 2,
};

describe("collaborator selection list", () => {
  it("owns empty, stale, caret, range, excerpt, and missing-file presentation", () => {
    const list = new TestSelectionList();
    expect(list.rootForTest()).toBe(list);
    expect(list.renderForTest()).toBeDefined();
    list.setData({ files: [file], revision: 1 });
    list.receive(selection);
    expect(list.renderForTest()).toBeDefined();
    list.setData({ files: [file], revision: 2 });
    list.receive(selection);
    list.receive({ ...selection, collaboratorId: "collaborator-2", start: 4, end: 4, fileId: "missing" });
    expect(list.renderForTest()).toBeDefined();
    expect(list.rangesFor(file.id)).toEqual([{ collaboratorId: selection.collaboratorId, start: 0, end: 8 }]);
    expect(list.rangesFor("missing")).toEqual([{ collaboratorId: "collaborator-2", start: 4, end: 4 }]);
  });

  it("owns selection replacement, departure, clearing, and stale-revision pruning", () => {
    const list = new TestSelectionList();
    let changes = 0;
    list.bindSelectionChanged(() => (changes += 1));
    list.setData({ files: [file], revision: 2 });

    list.receive(selection);
    list.receive({ ...selection, end: 4 });
    list.receive({ ...selection, collaboratorId: "stale", revision: 1 });
    expect(list.rangesFor(file.id)).toEqual([{ collaboratorId: selection.collaboratorId, start: 0, end: 4 }]);
    list.removeSelection("missing");
    list.removeSelection(selection.collaboratorId);
    list.receive(selection);
    list.setData({ files: [file], revision: 3 });
    expect(list.rangesFor(file.id)).toEqual([]);
    list.clear();
    list.setData({ files: [file], revision: 2 });
    list.receive(selection);
    list.clear();

    expect(list.rangesFor(file.id)).toEqual([]);
    expect(changes).toBe(6);
  });
});
