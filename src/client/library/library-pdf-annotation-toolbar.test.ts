import type { TemplateResult } from "lit";
import { isTemplateResult } from "lit/directive-helpers.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryPdfDrawing } from "../../domain/reference-library";
import { LibraryPdfAnnotationToolbar, libraryPdfToolbarActionEvent, type LibraryPdfToolbarAction } from "./library-pdf-annotation-toolbar";
import type { PdfAnnotationTool } from "./library-pdf-markup-layer";

class TestLibraryPdfAnnotationToolbar extends LibraryPdfAnnotationToolbar {
  override get updateComplete(): Promise<boolean> {
    return Promise.resolve(true);
  }

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

function undoPresentation(toolbar: TestLibraryPdfAnnotationToolbar): { readonly disabled: unknown; readonly title: unknown } {
  const template: TemplateResult = toolbar.renderForTest();
  const disabledIndex = template.strings.findIndex((part) => part.includes('id="undo-library-drawing"'));
  if (disabledIndex < 0) throw new Error("Undo drawing control is unavailable");
  return { disabled: template.values[disabledIndex], title: template.values[disabledIndex + 1] };
}

function sharePresentation(toolbar: TestLibraryPdfAnnotationToolbar): { readonly disabled: unknown; readonly click: () => Promise<void> } {
  const template: TemplateResult = toolbar.renderForTest();
  const index = template.strings.findIndex((part) => part.includes('id="share-library-annotated-pdf"'));
  if (index < 0) throw new Error("Share annotated copy control is unavailable");
  const handler = template.values[index + 1];
  if (typeof handler !== "function") throw new Error("Share annotated copy action is unavailable");
  return { disabled: template.values[index], click: () => handler.call(toolbar) };
}

function controlBinding(template: TemplateResult, marker: string, attribute: string): unknown {
  const start = template.strings.findIndex((part) => part.includes(marker));
  const index = template.strings.findIndex((part, index) => index >= start && part.endsWith(`${attribute}=`));
  if (start < 0 || index < 0) throw new Error(`Missing ${attribute} for ${marker}`);
  return template.values[index];
}

function renderedText(value: unknown): string {
  if (Array.isArray(value)) return value.map(renderedText).join("");
  if (!isTemplateResult(value, 1)) return typeof value === "string" || typeof value === "number" ? String(value) : "";
  return value.strings.reduce((result, part, index) => result + part + renderedText(value.values[index]), "");
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("library PDF annotation toolbar", () => {
  it("opens sharing for the current PDF only after pending drawing saves finish", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const open = vi.fn().mockResolvedValue(undefined);
    const removeAttribute = vi.fn();
    const querySelector = vi.fn((selector: string) => {
      if (selector === "library-pdf-share-dialog") return { open };
      if (selector === "details[open]") return { removeAttribute };
      return null;
    });
    Object.defineProperty(toolbar, "querySelector", { value: querySelector });
    expect(sharePresentation(toolbar).disabled).toBe(true);
    await sharePresentation(toolbar).click();
    expect(open).not.toHaveBeenCalled();
    expect(querySelector).not.toHaveBeenCalled();
    const artifact = { id: "artifact/1", name: "paper.pdf" };
    toolbar.setExportArtifact(artifact);
    toolbar.setAnnotationAvailability(0);
    expect(sharePresentation(toolbar).disabled).toBe(false);
    toolbar.setDrawingPending(true);
    expect(sharePresentation(toolbar).disabled).toBe(true);
    await sharePresentation(toolbar).click();
    expect(open).not.toHaveBeenCalled();
    expect(querySelector).not.toHaveBeenCalled();
    toolbar.setDrawingPending(false);
    expect(sharePresentation(toolbar).disabled).toBe(false);
    await sharePresentation(toolbar).click();
    expect(open).toHaveBeenCalledExactlyOnceWith(artifact);
    expect(querySelector.mock.calls).toEqual([["details[open]"], ["library-pdf-share-dialog"]]);
    expect(removeAttribute).toHaveBeenCalledExactlyOnceWith("open");
    expect(toolbar.renderForTest().strings.join("")).toContain("<library-pdf-share-dialog></library-pdf-share-dialog>");
    expect(toolbar.renderForTest().strings.join("")).toContain("Share annotated copy");
    toolbar.setExportArtifact(null);
    expect(sharePresentation(toolbar).disabled).toBe(true);
    await sharePresentation(toolbar).click();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("waits for the share dialog to open and tolerates an already closed actions menu", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    let finishOpening = (): void => undefined;
    const open = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        finishOpening = resolve;
      }),
    );
    Object.defineProperty(toolbar, "querySelector", {
      value: (selector: string) => (selector === "library-pdf-share-dialog" ? { open } : null),
    });
    const target = { id: "artifact/1", name: "paper.pdf" };
    toolbar.setExportArtifact(target);
    target.id = "later-mutation";
    target.name = "changed.pdf";
    let completed = false;
    const opening = sharePresentation(toolbar)
      .click()
      .then(() => {
        completed = true;
      });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(open).toHaveBeenCalledExactlyOnceWith({ id: "artifact/1", name: "paper.pdf" });
    finishOpening();
    await opening;
    expect(completed).toBe(true);
  });

  it("disables sharing while a download is pending and restores it after failure", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const open = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(toolbar, "querySelector", {
      value: (selector: string) => (selector === "library-pdf-share-dialog" ? { open } : null),
    });
    let respond = (_response: Response): void => undefined;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    toolbar.setExportArtifact({ id: "artifact/1", name: "paper.pdf" });
    const downloading = toolbar.downloadOriginalForTest();
    expect(sharePresentation(toolbar).disabled).toBe(true);
    await sharePresentation(toolbar).click();
    expect(open).not.toHaveBeenCalled();
    respond(new Response("Unavailable", { status: 503 }));
    await downloading;
    expect(sharePresentation(toolbar).disabled).toBe(false);
    await sharePresentation(toolbar).click();
    expect(open).toHaveBeenCalledOnce();
  });

  it("does not throw if the sharing dialog is not mounted", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    Object.defineProperty(toolbar, "querySelector", { value: () => null });
    toolbar.setExportArtifact({ id: "artifact/1", name: "paper.pdf" });
    await expect(sharePresentation(toolbar).click()).resolves.toBeUndefined();
  });

  it("renders tool selection, drawing controls, and their interactive actions", () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));
    const choices = [
      ["select", "Select", "Select text to highlight or copy, or select an annotation to edit"],
      ["note", "Note", "Tap the page to attach a private note"],
      ["draw", "Draw", "Draw directly on the page with Apple Pencil or a mouse"],
    ] as const;
    expect(controlBinding(toolbar.renderForTest(), 'id="library-ink-options"', "?hidden")).toBe(true);
    for (const [selected] of choices) {
      toolbar.setTool(selected);
      const template = toolbar.renderForTest();
      expect(controlBinding(template, 'id="library-ink-options"', "?hidden")).toBe(selected !== "draw");
      const buttons = template.values.filter((value): value is TemplateResult => isTemplateResult(value, 1));
      for (const [index, [tool, label, title]] of choices.entries()) {
        const button = buttons[index];
        expect(button).toBeDefined();
        if (!button) throw new Error("Missing tool control");
        expect(controlBinding(button, "<button", "id")).toBe(`library-${tool}-tool`);
        expect(controlBinding(button, "<button", "aria-pressed")).toBe(String(selected === tool));
        expect(controlBinding(button, "<button", "title")).toBe(title);
        expect(renderedText(button)).toContain(`<span class="sr-only">${label}</span>`);
        if (selected === "select") {
          const handler = controlBinding(button, "<button", "@click");
          if (typeof handler !== "function") throw new Error("Missing tool action");
          handler.call(toolbar);
        }
      }
    }
    expect(actions).toEqual(choices.map(([tool]) => ({ action: "choose-tool", tool })));
  });

  it("exposes the active inspector panel and invokes its rendered controls", () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));
    const expanded = () => [
      controlBinding(toolbar.renderForTest(), 'id="open-library-pdf-inspector"', "aria-expanded"),
      controlBinding(toolbar.renderForTest(), 'id="open-library-pdf-references"', "aria-expanded"),
    ];
    expect(expanded()).toEqual(["false", "false"]);
    toolbar.setInspectorOpen(true);
    expect(expanded()).toEqual(["true", "false"]);
    toolbar.setInspectorOpen(true, "references");
    expect(expanded()).toEqual(["false", "true"]);
    toolbar.setInspectorOpen(false, "references");
    expect(expanded()).toEqual(["false", "false"]);
    for (const id of ["open-library-pdf-inspector", "open-library-pdf-references"]) {
      const handler = controlBinding(toolbar.renderForTest(), `id="${id}"`, "@click");
      if (typeof handler !== "function") throw new Error("Missing inspector action");
      handler.call(toolbar);
    }
    expect(actions).toEqual([{ action: "open-inspector" }, { action: "open-references" }]);
  });

  it("returns focus to the corresponding inspector trigger after rendering", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const annotationFocus = vi.fn();
    const menuFocus = vi.fn();
    const querySelector = vi.fn((selector: string) => {
      if (selector === "#open-library-pdf-inspector") return { focus: annotationFocus };
      if (selector === "#library-pdf-more-actions") return { focus: menuFocus };
      return null;
    });
    Object.defineProperty(toolbar, "querySelector", { value: querySelector });
    toolbar.focusInspectorButton("annotations");
    expect(annotationFocus).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(annotationFocus).toHaveBeenCalledOnce();
    expect(menuFocus).not.toHaveBeenCalled();
    toolbar.focusInspectorButton("references");
    await Promise.resolve();
    expect(menuFocus).toHaveBeenCalledOnce();
    querySelector.mockReturnValue(null);
    toolbar.focusInspectorButton("annotations");
    await Promise.resolve();
    expect(annotationFocus).toHaveBeenCalledTimes(1);
  });

  it("distinguishes original download availability from annotated export availability", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const disabled = (id: string) => controlBinding(toolbar.renderForTest(), `id="${id}"`, "?disabled");
    expect(disabled("download-library-original-pdf")).toBe(true);
    expect(disabled("export-library-annotated-pdf")).toBe(true);
    await toolbar.exportForTest();
    await toolbar.downloadOriginalForTest();
    toolbar.setAnnotationAvailability(1);
    expect(disabled("export-library-annotated-pdf")).toBe(true);
    toolbar.setExportArtifact({ id: "artifact", name: "paper.pdf" });
    expect(disabled("download-library-original-pdf")).toBe(false);
    expect(disabled("export-library-annotated-pdf")).toBe(false);
    toolbar.setAnnotationAvailability(0);
    expect(disabled("export-library-annotated-pdf")).toBe(true);
    await toolbar.exportForTest();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(renderedText(toolbar.renderForTest())).toContain("Download original");
    expect(renderedText(toolbar.renderForTest())).toContain("Export annotated copy");
    let respond = (_response: Response): void => undefined;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    const downloading = toolbar.downloadOriginalForTest();
    toolbar.setAnnotationAvailability(1);
    expect(disabled("download-library-original-pdf")).toBe(true);
    expect(disabled("export-library-annotated-pdf")).toBe(true);
    expect(renderedText(toolbar.renderForTest())).toContain("Preparing download…");
    expect(renderedText(toolbar.renderForTest())).toContain("Preparing export…");
    await toolbar.downloadOriginalForTest();
    await toolbar.exportForTest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    respond(new Response(null, { status: 503 }));
    await downloading;
    expect(disabled("download-library-original-pdf")).toBe(false);
    expect(disabled("export-library-annotated-pdf")).toBe(false);
  });

  it("owns toolbar state and drawing style in light DOM", () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    expect(toolbar.rootForTest()).toBe(toolbar);
    expect(toolbar.drawingStyle).toEqual({ color: "#d33f49", width: 4 });

    expect(toolbar.setTool("select")).toBe("Select text to highlight or copy. Tap an existing annotation to edit it.");
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

  it("emits the complete drawing style when a style control changes", () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail);
    });

    toolbar.changeForTest("color", "#116655");
    toolbar.changeForTest("width", "7");

    expect(actions).toEqual([
      { action: "drawing-style-changed", style: { color: "#116655", width: 4 } },
      { action: "drawing-style-changed", style: { color: "#116655", width: 7 } },
    ]);
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
    toolbar.chooseForTest("note");
    toolbar.chooseForTest("draw");
    toolbar.emitForTest({ action: "drawing-undone", drawingId: "drawing-1" });
    toolbar.emitForTest({ action: "export-status", message: "Preparing annotated PDF…" });
    toolbar.emitForTest({ action: "open-inspector" });
    toolbar.emitForTest({ action: "open-references" });

    expect(actions).toEqual([
      { action: "choose-tool", tool: "select" },
      { action: "choose-tool", tool: "note" },
      { action: "choose-tool", tool: "draw" },
      { action: "drawing-undone", drawingId: "drawing-1" },
      { action: "export-status", message: "Preparing annotated PDF…" },
      { action: "open-inspector" },
      { action: "open-references" },
    ]);
  });

  it("downloads an annotated PDF through a stable encoded artifact target", async () => {
    vi.useFakeTimers();
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    const click = vi.fn();
    const remove = vi.fn();
    const link = { click, download: "", href: "", remove };
    const append = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue("blob:annotated-pdf");
    const revokeObjectURL = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("pdf", { status: 200 }));
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal("document", { body: { append }, createElement: () => link });
    toolbar.setAnnotationAvailability(2);
    toolbar.setExportArtifact({ id: "artifact/1", name: "paper.pdf" });
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));

    await toolbar.exportForTest();

    expect(link).toEqual(
      expect.objectContaining({
        download: "paper-annotated.pdf",
        href: "blob:annotated-pdf",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/library/pdfs/artifact%2F1/annotated", { credentials: "same-origin" });
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(append).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:annotated-pdf");
    expect(actions).toEqual([{ action: "export-status", message: "Preparing annotated PDF…" }]);
  });

  it("downloads the original PDF without requiring annotations", async () => {
    vi.useFakeTimers();
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    const click = vi.fn();
    const remove = vi.fn();
    const link = { click, download: "", href: "", remove };
    const append = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue("blob:original-pdf");
    const revokeObjectURL = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("pdf", { status: 200 }));
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal("document", { body: { append }, createElement: () => link });
    toolbar.setAnnotationAvailability(0);
    toolbar.setExportArtifact({ id: "artifact/1", name: "original paper.pdf" });
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));

    await toolbar.downloadOriginalForTest();

    expect(link).toEqual(
      expect.objectContaining({
        download: "original paper.pdf",
        href: "blob:original-pdf",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/library/pdfs/artifact%2F1", { credentials: "same-origin" });
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(append).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:original-pdf");
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
    vi.useFakeTimers();
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    const click = vi.fn();
    const link = { click, download: "", href: "", remove: vi.fn() };
    const share = vi.fn().mockRejectedValue(new Error("Share failed"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("pdf", { status: 200 }));
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    vi.stubGlobal("navigator", { share });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:fallback-pdf", revokeObjectURL: vi.fn() });
    vi.stubGlobal("document", { body: { append: vi.fn() }, createElement: () => link });
    toolbar.setAnnotationAvailability(1);
    toolbar.setExportArtifact({ id: "artifact:1", name: "paper.pdf" });
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));

    await toolbar.exportForTest();

    expect(click).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledOnce();
    expect(actions).toEqual([
      { action: "export-status", message: "Choose Save to Files to keep the annotated PDF." },
      { action: "export-status", message: "Could not open the file saver. Downloading instead." },
      { action: "export-status", message: "Preparing annotated PDF…" },
    ]);
  });

  it("reports an unavailable private PDF instead of starting a broken download", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const actions: LibraryPdfToolbarAction[] = [];
    const createElement = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unavailable", { status: 503 }));
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { createElement });
    toolbar.setExportArtifact({ id: "artifact:1", name: "paper.pdf" });
    toolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfToolbarAction>).detail));

    await toolbar.downloadOriginalForTest();

    expect(createElement).not.toHaveBeenCalled();
    expect(actions).toEqual([{ action: "export-status", message: "Request failed (503)" }]);
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
    expect(actions).toEqual([{ action: "drawing-undone", drawingId: "drawing/3" }]);
  });

  it("does not undo an older drawing while a newly released stroke lacks a safe identity", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    toolbar.setUndoDrawings([drawing]);

    toolbar.setDrawingPending(true);
    await toolbar.undoForTest();
    expect(fetchMock).not.toHaveBeenCalled();

    toolbar.setDrawingPending(false);
    await toolbar.undoForTest();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("presents and enforces undo availability for missing, ready, and pending drawings", async () => {
    const toolbar = new TestLibraryPdfAnnotationToolbar();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    expect(undoPresentation(toolbar)).toEqual({ disabled: true, title: "Remove the latest drawing on this page" });
    await toolbar.undoForTest();
    expect(fetchMock).not.toHaveBeenCalled();

    toolbar.setUndoDrawings([drawing]);
    expect(undoPresentation(toolbar)).toEqual({ disabled: false, title: "Remove the latest drawing on this page" });

    toolbar.setDrawingPending(true);
    expect(undoPresentation(toolbar)).toEqual({ disabled: true, title: "Wait for the drawing to finish saving" });
    await toolbar.undoForTest();
    expect(fetchMock).not.toHaveBeenCalled();
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
