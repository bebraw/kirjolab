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

  async exportForTest(): Promise<void> {
    await this.exportAnnotated();
  }

  async downloadOriginalForTest(): Promise<void> {
    await this.downloadOriginal();
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it("emits tool, completed undo, export-status, and inspector outcomes", () => {
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
    toolbar.emitForTest({ action: "export-status", message: "Preparing annotated PDF…" });
    toolbar.emitForTest({ action: "open-inspector" });

    expect(actions).toEqual([
      { action: "choose-tool", tool: "select" },
      { action: "choose-tool", tool: "text" },
      { action: "choose-tool", tool: "note" },
      { action: "choose-tool", tool: "draw" },
      { action: "drawing-undone" },
      { action: "export-status", message: "Preparing annotated PDF…" },
      { action: "open-inspector" },
    ]);
  });

  it("downloads an annotated PDF through a stable encoded artifact target", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    const click = vi.fn();
    const link = { click, download: "", href: "" };
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { createElement: () => link });
    toolbar.setAnnotationAvailability(2);
    toolbar.setExportArtifact({ id: "artifact/1", name: "paper.pdf" });
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));

    await toolbar.exportForTest();

    expect(link).toEqual(
      expect.objectContaining({
        download: "paper-annotated.pdf",
        href: "/api/library/pdfs/artifact%2F1/annotated",
      }),
    );
    expect(click).toHaveBeenCalledOnce();
    expect(actions).toEqual([{ action: "export-status", message: "Preparing annotated PDF…" }]);
  });

  it("downloads the original PDF without requiring annotations", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    const click = vi.fn();
    const link = { click, download: "", href: "" };
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { createElement: () => link });
    toolbar.setAnnotationAvailability(0);
    toolbar.setExportArtifact({ id: "artifact/1", name: "original paper.pdf" });
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));

    await toolbar.downloadOriginalForTest();

    expect(link).toEqual(
      expect.objectContaining({
        download: "original paper.pdf",
        href: "/api/library/pdfs/artifact%2F1",
      }),
    );
    expect(click).toHaveBeenCalledOnce();
    expect(actions).toEqual([{ action: "export-status", message: "Downloading original PDF…" }]);
  });

  it("shares an annotated PDF from an installed app", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    const share = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("pdf", { status: 200 }));
    class TestFile {
      constructor(
        readonly parts: readonly BlobPart[],
        readonly name: string,
        readonly options: FilePropertyBag,
      ) {}
    }
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    vi.stubGlobal("navigator", { canShare: () => true, share });
    vi.stubGlobal("File", TestFile);
    toolbar.setAnnotationAvailability(1);
    toolbar.setExportArtifact({ id: "artifact:1", name: "paper.pdf" });
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));

    await toolbar.exportForTest();

    expect(fetchMock).toHaveBeenCalledWith("/api/library/pdfs/artifact%3A1/annotated", { credentials: "same-origin" });
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ files: [expect.objectContaining({ name: "paper-annotated.pdf" })], title: "paper-annotated.pdf" }),
    );
    expect(actions).toEqual([{ action: "export-status", message: "Choose Save to Files to keep the annotated PDF." }]);
  });

  it("falls back to download when installed-app sharing fails", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    const click = vi.fn();
    const link = { click, download: "", href: "" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unavailable", { status: 503 }));
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    vi.stubGlobal("navigator", { share: vi.fn() });
    vi.stubGlobal("document", { createElement: () => link });
    toolbar.setAnnotationAvailability(1);
    toolbar.setExportArtifact({ id: "artifact:1", name: "paper.pdf" });
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));

    await toolbar.exportForTest();

    expect(click).toHaveBeenCalledOnce();
    expect(actions).toEqual([
      { action: "export-status", message: "Could not open the file saver. Downloading instead." },
      { action: "export-status", message: "Preparing annotated PDF…" },
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
