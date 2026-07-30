import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  LibraryHighlight,
  LibraryPdfArtifact,
  LibraryPdfDrawing,
  LibraryPdfNote,
  ResearchShareSnapshot,
} from "../domain/reference-library";
import {
  LibraryPdfAnnotationList,
  annotationSummaryMarkdown,
  filterPdfAnnotations,
  libraryPdfAnnotationListActionEvent,
  type LibraryPdfAnnotationListAction,
} from "./library-pdf-annotation-list";

class TestAnnotationList extends LibraryPdfAnnotationList {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: LibraryPdfAnnotationListAction): void {
    this.emitAction(action);
  }

  async deleteForTest(markup: LibraryPdfDrawing | LibraryPdfNote): Promise<void> {
    await this.deleteMarkup(markup);
  }
}

afterEach(() => vi.restoreAllMocks());

const artifact: LibraryPdfArtifact = {
  id: "pdf-1",
  referenceId: "ref-1",
  name: "paper.pdf",
  contentType: "application/pdf",
  size: 100,
  objectKey: "pdfs/paper",
  fingerprint: "fingerprint",
  rights: "private",
  createdAt: "created",
};
const highlight: LibraryHighlight = {
  id: "highlight-1",
  referenceId: "ref-1",
  artifactId: artifact.id,
  page: 2,
  quote: "Evidence",
  comment: "Interpretation",
  rects: [{ x: 0, y: 0, width: 1, height: 1 }],
  createdAt: "created",
  updatedAt: "updated",
};
const note: LibraryPdfNote = {
  id: "note-1",
  kind: "note",
  referenceId: "ref-1",
  artifactId: artifact.id,
  page: 3,
  x: 0.2,
  y: 0.3,
  body: "Page note",
  createdAt: "created",
  updatedAt: "updated",
};
const drawing: LibraryPdfDrawing = {
  id: "drawing-1",
  kind: "drawing",
  referenceId: "ref-1",
  artifactId: artifact.id,
  page: 4,
  color: "#000000",
  width: 4,
  points: [{ x: 0.1, y: 0.2 }],
  createdAt: "created",
  updatedAt: "updated",
};
const share: ResearchShareSnapshot = {
  id: "share-1",
  projectId: "project-1",
  referenceId: "ref-1",
  resourceId: highlight.id,
  kind: "highlight",
  content: { kind: "highlight", page: 2, quote: "Evidence", comment: "Interpretation" },
  createdAt: "created",
  revokedAt: null,
};

describe("library PDF annotation list", () => {
  it("searches, filters, and exports a page-ordered annotation index", () => {
    expect(filterPdfAnnotations([highlight], [note, drawing], { kind: "note", page: 3, query: "page" })).toEqual([
      expect.objectContaining({ kind: "note", page: 3 }),
    ]);
    expect(filterPdfAnnotations([highlight], [note, drawing], { kind: "all", page: null, query: "interpretation" })).toEqual([
      expect.objectContaining({ kind: "highlight", page: 2 }),
    ]);
    expect(annotationSummaryMarkdown("paper.pdf", [highlight], [note, drawing])).toContain(
      "# Annotations — paper.pdf\n\n## Page 2 · highlight\n\n> Evidence\n\nInterpretation",
    );
  });
  it("owns empty, private, linked, shared, note, and drawing presentation", () => {
    const list = new TestAnnotationList();
    expect(list.rootForTest()).toBe(list);
    expect(list.renderForTest()).toBeDefined();
    list.setData({
      artifact,
      highlights: [highlight, { ...highlight, id: "highlight-2", comment: "" }],
      linkedReferenceIds: new Set(["ref-1"]),
      markups: [note, drawing],
      projectApiBase: "/api/workspaces/workspace",
      researchShares: [share],
    });
    expect(list.renderForTest()).toBeDefined();
    list.setData({
      artifact: null,
      highlights: [highlight],
      linkedReferenceIds: new Set(),
      markups: [drawing],
      projectApiBase: null,
      researchShares: [],
    });
    expect(list.renderForTest()).toBeDefined();
  });

  it("emits every coordinator-owned annotation action", () => {
    const list = new TestAnnotationList();
    const actions: LibraryPdfAnnotationListAction[] = [];
    list.addEventListener(libraryPdfAnnotationListActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfAnnotationListAction>).detail);
    });
    list.emitForTest({ action: "open-highlight", highlight });
    list.emitForTest({ action: "edit-highlight", highlight });
    list.emitForTest({ action: "cite-highlight", highlight });
    list.emitForTest({ action: "open-markup", artifact, page: note.page });
    list.emitForTest({ action: "edit-note", note });
    list.emitForTest({ action: "markup-deleted" });
    expect(actions).toHaveLength(6);
  });

  it("deletes a markup through stable encoded identities", async () => {
    const list = new TestAnnotationList();
    const actions: LibraryPdfAnnotationListAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    list.addEventListener(libraryPdfAnnotationListActionEvent, (event) =>
      actions.push((event as CustomEvent<LibraryPdfAnnotationListAction>).detail),
    );

    await list.deleteForTest({ ...drawing, id: "drawing/1", referenceId: "reference/1" });

    expect(fetchMock).toHaveBeenCalledWith("/api/library/references/reference%2F1/pdf-markups/drawing%2F1", {
      credentials: "same-origin",
      method: "DELETE",
    });
    expect(actions).toEqual([{ action: "markup-deleted" }]);
  });

  it("reports deletion failures, suppresses overlap, and permits retry", async () => {
    const list = new TestAnnotationList();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(pendingResponse)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const first = list.deleteForTest(drawing);
    await list.deleteForTest(note);
    respond(new Response("Unavailable", { status: 503 }));
    await first;
    expect(list.renderForTest()).toBeDefined();
    await list.deleteForTest(drawing);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
