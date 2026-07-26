import { describe, expect, it } from "vitest";
import {
  LibraryPdfAnnotationForms,
  libraryPdfAnnotationActionEvent,
  type LibraryPdfAnnotationAction,
} from "./library-pdf-annotation-forms";

class TestLibraryPdfAnnotationForms extends LibraryPdfAnnotationForms {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changeForTest(field: "comment" | "note" | "color" | "width", value: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    if (field === "comment") this.updateHighlightComment(event);
    else if (field === "note") this.updateNoteBody(event);
    else if (field === "color") this.updateDrawingColor(event);
    else this.updateDrawingWidth(event);
  }

  submitForTest(form: "highlight" | "note" | "drawing"): void {
    const event = new Event("submit") as SubmitEvent;
    if (form === "highlight") this.saveHighlight(event);
    else if (form === "note") this.saveNote(event);
    else this.applyDrawing(event);
  }

  emitForTest(action: LibraryPdfAnnotationAction): void {
    this.emitAction(action);
  }
}

describe("library PDF annotation forms", () => {
  it("owns bounded light-DOM composer visibility", () => {
    const forms = new TestLibraryPdfAnnotationForms();
    expect(forms.rootForTest()).toBe(forms);
    expect(forms.empty).toBe(true);

    forms.showHighlight({ highlightId: null, page: 3, quote: "evidence", comment: "private", rects: [] });
    expect(forms.highlightOpen).toBe(true);
    expect(forms.empty).toBe(false);
    expect(forms.renderForTest()).toBeDefined();
    forms.clearHighlight(4);

    forms.showNote("draft");
    expect(forms.noteOpen).toBe(true);
    forms.clearNote();

    forms.showMarkup({ label: "Line on page 2", kind: "drawing", color: "#112233", width: 8 });
    expect(forms.markupOpen).toBe(true);
    expect(forms.renderForTest()).toBeDefined();
    forms.showMarkup({ label: "Note on page 2", kind: "note" });
    forms.clearMarkup();
    expect(forms.empty).toBe(true);
  });

  it("emits current highlight, note, and drawing values", () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const actions: LibraryPdfAnnotationAction[] = [];
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail);
    });

    const rects = [{ height: 0.1, width: 0.4, x: 0.1, y: 0.2 }];
    forms.showHighlight({ highlightId: "highlight-1", page: 5, quote: "  selected claim  ", comment: "", rects });
    forms.changeForTest("comment", "Explain this");
    forms.submitForTest("highlight");
    forms.showNote();
    forms.changeForTest("note", "  Margin note  ");
    forms.submitForTest("note");
    forms.showMarkup({ label: "Line", kind: "drawing" });
    forms.changeForTest("color", "#abcdef");
    forms.changeForTest("width", "12");
    forms.submitForTest("drawing");

    expect(actions).toEqual([
      { action: "save-highlight", highlightId: "highlight-1", page: 5, quote: "selected claim", comment: "Explain this", rects },
      { action: "save-note", body: "Margin note" },
      { action: "apply-drawing", color: "#abcdef", width: 12 },
    ]);
  });

  it("emits cancellation and selected-markup intents", () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const actions: LibraryPdfAnnotationAction[] = [];
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail);
    });

    forms.emitForTest({ action: "cancel-highlight" });
    forms.emitForTest({ action: "cancel-note" });
    forms.emitForTest({ action: "edit-note" });
    forms.emitForTest({ action: "delete-markup" });
    forms.emitForTest({ action: "clear-markup" });

    expect(actions).toEqual([
      { action: "cancel-highlight" },
      { action: "cancel-note" },
      { action: "edit-note" },
      { action: "delete-markup" },
      { action: "clear-markup" },
    ]);
  });
});
