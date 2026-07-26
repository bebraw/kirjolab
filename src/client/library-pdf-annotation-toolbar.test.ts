import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryPdfDrawing } from "../domain/reference-library";
import { LibraryPdfAnnotationToolbar, libraryPdfToolbarActionEvent, type LibraryPdfToolbarAction } from "./library-pdf-annotation-toolbar";
import type { PdfAnnotationTool } from "./library-pdf-markup-layer";

class TestLibraryPdfAnnotationToolbar extends LibraryPdfAnnotationToolbar {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  chooseForTest(tool: PdfAnnotationTool): void {
    this.chooseTool(tool);
  }

  changeForTest(field: "color" | "width", value: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    if (field === "color") this.updateDrawingColor(event);
    else this.updateDrawingWidth(event);
  }

  emitForTest(action: LibraryPdfToolbarAction): void {
    this.emitAction(action);
  }

  async undoForTest(): Promise<void> {
    await this.undoDrawing();
  }
}

const drawing: LibraryPdfDrawing = {
  artifactId: "artifact:1",
  color: "#123456",
  createdAt: "2026-07-25T00:00:00.000Z",
  id: "drawing:1",
  kind: "drawing",
  page: 2,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.3, y: 0.4 },
  ],
  referenceId: "reference:1",
  updatedAt: "2026-07-25T00:00:00.000Z",
  width: 4,
};

afterEach(() => vi.restoreAllMocks());

describe("library PDF annotation toolbar", () => {
  it("owns toolbar state and drawing style in light DOM", () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    expect(toolbar.rootForTest()).toBe(toolbar);
    expect(toolbar.drawingStyle).toEqual({ color: "#d33f49", width: 4 });

    expect(toolbar.setTool("select")).toBe("Tap an existing highlight, line, or note to edit it. Drag a selected note to move it.");
    expect(toolbar.setTool("text")).toBe("Select text to highlight.");
    expect(toolbar.setTool("note")).toBe("Tap the page to place a note.");
    expect(toolbar.setTool("draw")).toBe("Draw with Apple Pencil or a mouse. Touch gestures pan and zoom.");
    toolbar.setAnnotationAvailability(5);
    toolbar.setUndoDrawings([]);
    toolbar.setInspectorOpen(true);
    toolbar.changeForTest("color", "#116655");
    toolbar.changeForTest("width", "7");

    expect(toolbar.drawingStyle).toEqual({ color: "#116655", width: 7 });
    expect(toolbar.renderForTest()).toBeDefined();
  });

  it("renders empty and populated annotation availability", () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    toolbar.setAnnotationAvailability(0);
    expect(toolbar.renderForTest()).toBeDefined();
    toolbar.setAnnotationAvailability(3);
    toolbar.setUndoDrawings([drawing]);
    expect(toolbar.renderForTest()).toBeDefined();
  });

  it("emits tool, completed undo, export, and inspector intents", () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail);
    });

    toolbar.chooseForTest("select");
    toolbar.chooseForTest("text");
    toolbar.chooseForTest("note");
    toolbar.chooseForTest("draw");
    toolbar.emitForTest({ action: "drawing-undone" });
    toolbar.emitForTest({ action: "export-annotated" });
    toolbar.emitForTest({ action: "open-inspector" });

    expect(actions).toEqual([
      { action: "choose-tool", tool: "select" },
      { action: "choose-tool", tool: "text" },
      { action: "choose-tool", tool: "note" },
      { action: "choose-tool", tool: "draw" },
      { action: "drawing-undone" },
      { action: "export-annotated" },
      { action: "open-inspector" },
    ]);
  });

  it("deletes the latest drawing through stable encoded identities", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    toolbar.setUndoDrawings([
      { ...drawing, id: "older", createdAt: "2026-07-24T00:00:00.000Z" },
      { ...drawing, id: "drawing/2", referenceId: "reference/1", createdAt: "2026-07-26T00:00:00.000Z" },
      { ...drawing, id: "drawing/3", referenceId: "reference/1", createdAt: "2026-07-26T00:00:00.000Z" },
    ]);
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));

    await toolbar.undoForTest();

    expect(fetchMock).toHaveBeenCalledWith("/api/library/references/reference%2F1/pdf-markups/drawing%2F3", {
      credentials: "same-origin",
      method: "DELETE",
    });
    expect(actions).toEqual([{ action: "drawing-undone" }]);
  });

  it("reports undo failures, suppresses overlap, and permits retry", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(pendingResponse)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    toolbar.setUndoDrawings([drawing]);

    const first = toolbar.undoForTest();
    await toolbar.undoForTest();
    respond(new Response("Unavailable", { status: 503 }));
    await first;
    expect(toolbar.renderForTest()).toBeDefined();
    await toolbar.undoForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
