import { describe, expect, it } from "vitest";
import {
  LibraryReferencePersonalFields,
  libraryReferencePersonalActionEvent,
  type LibraryReferencePersonalAction,
} from "./library-reference-personal-fields";

class TestLibraryReferencePersonalFields extends LibraryReferencePersonalFields {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  updateForTest(field: "collections" | "note" | "tags", value: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    this.updateText(field, event);
  }

  emitForTest(action: Parameters<LibraryReferencePersonalFields["emitAction"]>[0]): void {
    this.emitAction(action);
  }

  emitReadingForTest(): void {
    this.emitReading();
  }
}

describe("library reference personal fields", () => {
  it("owns empty and populated light-DOM form state", () => {
    const fields = new TestLibraryReferencePersonalFields();
    expect(fields.rootForTest()).toBe(fields);
    expect(fields.renderForTest()).toBeDefined();
    fields.setData({
      archived: true,
      collections: ["Methods"],
      displayTitle: "Useful Paper",
      reading: { priority: "high", rating: 5, status: "read" },
      referenceId: "ref-1",
      tags: ["important", "reviewed"],
    });
    expect(fields.renderForTest()).toBeDefined();
  });

  it("emits organization, archive, reading, and note actions", () => {
    const fields = new TestLibraryReferencePersonalFields();
    const actions: LibraryReferencePersonalAction[] = [];
    fields.addEventListener(libraryReferencePersonalActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryReferencePersonalAction>).detail);
    });
    fields.setData({
      archived: false,
      collections: [],
      displayTitle: "Useful Paper",
      reading: null,
      referenceId: "ref-1",
      tags: [],
    });
    fields.updateForTest("tags", "important");
    fields.updateForTest("collections", "Methods");
    fields.updateForTest("note", "Private observation");
    fields.emitForTest({ action: "save-tags", value: "important" });
    fields.emitForTest({ action: "save-collections", value: "Methods" });
    fields.emitForTest({ action: "set-archived", archived: true, title: "Useful Paper" });
    fields.emitReadingForTest();
    fields.emitForTest({ action: "save-note", body: "Private observation" });
    expect(actions).toEqual([
      { action: "save-tags", referenceId: "ref-1", value: "important" },
      { action: "save-collections", referenceId: "ref-1", value: "Methods" },
      { action: "set-archived", archived: true, referenceId: "ref-1", title: "Useful Paper" },
      { action: "save-reading", priority: "normal", rating: null, referenceId: "ref-1", status: "unread" },
      { action: "save-note", body: "Private observation", referenceId: "ref-1" },
    ]);
  });
});
