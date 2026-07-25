import { describe, expect, it } from "vitest";
import { LibraryPdfAnnotationToolbar, libraryPdfToolbarActionEvent, type LibraryPdfToolbarAction } from "./library-pdf-annotation-toolbar";
import type { PdfAnnotationTool } from "./pdf-annotation-machine";

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
}

describe("library PDF annotation toolbar", () => {
  it("owns toolbar state and drawing style in light DOM", () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    expect(toolbar.rootForTest()).toBe(toolbar);
    expect(toolbar.drawingStyle).toEqual({ color: "#d33f49", width: 4 });

    toolbar.setTool("draw");
    toolbar.setAnnotationAvailability(5, 2);
    toolbar.setUndoAvailable(false);
    toolbar.setInspectorOpen(true);
    toolbar.changeForTest("color", "#116655");
    toolbar.changeForTest("width", "7");

    expect(toolbar.drawingStyle).toEqual({ color: "#116655", width: 7 });
    expect(toolbar.renderForTest()).toBeDefined();
  });

  it("renders empty and populated annotation availability", () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    toolbar.setAnnotationAvailability(0, 0);
    expect(toolbar.renderForTest()).toBeDefined();
    toolbar.setAnnotationAvailability(3, 1);
    expect(toolbar.renderForTest()).toBeDefined();
  });

  it("emits tool, undo, export, and inspector intents", () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail);
    });

    toolbar.chooseForTest("select");
    toolbar.chooseForTest("text");
    toolbar.chooseForTest("note");
    toolbar.chooseForTest("draw");
    toolbar.emitForTest({ action: "undo-drawing" });
    toolbar.emitForTest({ action: "export-annotated" });
    toolbar.emitForTest({ action: "open-inspector" });

    expect(actions).toEqual([
      { action: "choose-tool", tool: "select" },
      { action: "choose-tool", tool: "text" },
      { action: "choose-tool", tool: "note" },
      { action: "choose-tool", tool: "draw" },
      { action: "undo-drawing" },
      { action: "export-annotated" },
      { action: "open-inspector" },
    ]);
  });
});
