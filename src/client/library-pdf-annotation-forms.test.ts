import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryHighlight } from "../domain/reference-library";
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

  async submitForTest(form: "highlight" | "note" | "drawing"): Promise<void> {
    const event = new Event("submit") as SubmitEvent;
    if (form === "highlight") await this.saveHighlight(event);
    else if (form === "note") this.saveNote(event);
    else this.applyDrawing(event);
  }

  emitForTest(action: LibraryPdfAnnotationAction): void {
    this.emitAction(action);
  }
}

const rects = [{ height: 0.1, width: 0.4, x: 0.1, y: 0.2 }];
const highlight: LibraryHighlight = {
  artifactId: "artifact:1",
  comment: "",
  createdAt: "2026-07-25T00:00:00.000Z",
  id: "highlight:1",
  page: 5,
  quote: "selected claim",
  rects,
  referenceId: "reference:1",
  updatedAt: "2026-07-25T00:00:00.000Z",
};

afterEach(() => vi.restoreAllMocks());

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

  it("persists current highlight values and emits note and drawing intents", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const actions: LibraryPdfAnnotationAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail);
    });

    forms.setHighlightContext({ artifactId: highlight.artifactId, highlights: [highlight], referenceId: highlight.referenceId });
    forms.showHighlight({ highlightId: null, page: 5, quote: "  selected claim  ", comment: "", rects });
    forms.changeForTest("comment", "Explain this");
    await forms.submitForTest("highlight");
    forms.showNote();
    forms.changeForTest("note", "  Margin note  ");
    await forms.submitForTest("note");
    forms.showMarkup({ label: "Line", kind: "drawing" });
    forms.changeForTest("color", "#abcdef");
    forms.changeForTest("width", "12");
    await forms.submitForTest("drawing");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/references/reference%3A1/highlights",
      expect.objectContaining({
        body: JSON.stringify({
          artifactId: "artifact:1",
          page: 5,
          quote: "selected claim",
          comment: "Explain this",
          rects,
        }),
        method: "POST",
      }),
    );
    expect(actions).toEqual([
      { action: "highlight-saved", kind: "extended" },
      { action: "save-note", body: "Margin note" },
      { action: "apply-drawing", color: "#abcdef", width: 12 },
    ]);
  });

  it("updates an existing highlight note through stable encoded identities", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const actions: LibraryPdfAnnotationAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    forms.setHighlightContext({ artifactId: highlight.artifactId, highlights: [highlight], referenceId: "reference/1" });
    forms.showHighlight({ highlightId: "highlight/1", page: 5, quote: highlight.quote, comment: "Revised", rects });
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) =>
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail),
    );

    await forms.submitForTest("highlight");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/references/reference%2F1/highlights/highlight%2F1",
      expect.objectContaining({ body: JSON.stringify({ comment: "Revised" }), method: "PATCH" }),
    );
    expect(actions).toEqual([{ action: "highlight-saved", kind: "updated" }]);
  });

  it("reports provider failures and permits retry", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    forms.setHighlightContext({ artifactId: highlight.artifactId, highlights: [], referenceId: highlight.referenceId });
    forms.showHighlight({ highlightId: null, page: 5, quote: highlight.quote, comment: "", rects });

    await forms.submitForTest("highlight");
    expect(forms.renderForTest()).toBeDefined();
    await forms.submitForTest("highlight");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate highlight saves while one is pending", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    forms.setHighlightContext({ artifactId: highlight.artifactId, highlights: [], referenceId: highlight.referenceId });
    forms.showHighlight({ highlightId: null, page: 5, quote: highlight.quote, comment: "", rects });

    const first = forms.submitForTest("highlight");
    await forms.submitForTest("highlight");
    respond(new Response(null, { status: 200 }));
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
