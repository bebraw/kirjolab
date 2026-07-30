import { describe, expect, it, vi } from "vitest";
import type { AnnotationResource, PdfResource } from "../../domain/workspace/workspace";
import { PdfContextSession, type ContextPdfViewer, type PdfContextSessionSources } from "./pdf-context-session";
import type { ResearchResourceTab } from "./research-context";

const createdAt = "2026-07-30T00:00:00.000Z";
const pdf: PdfResource = {
  contentType: "application/pdf",
  createdAt,
  fingerprint: "fingerprint",
  id: "pdf/1",
  name: "paper.pdf",
  objectKey: "pdfs/paper.pdf",
  size: 1024,
};
const annotation: AnnotationResource = {
  comment: "Note",
  createdAt,
  fragments: [],
  id: "annotation/1",
  page: 2,
  pdfId: pdf.id,
  prefix: "Before",
  quote: "Evidence",
  rects: [],
  suffix: "After",
  updatedAt: createdAt,
};

function pdfTab(scrollTop = 28): Extract<ResearchResourceTab, { kind: "pdf" | "library-pdf" }> {
  return { focusedAnnotationId: annotation.id, id: pdf.id, key: `pdf:${pdf.id}`, kind: "pdf", page: 2, scrollTop };
}

function sources(activeTab: ResearchResourceTab | undefined = pdfTab()): PdfContextSessionSources {
  return {
    activeTab,
    annotations: [annotation],
    libraryArtifacts: [],
    libraryHighlights: [],
    projectReferencePdfs: [],
    workspacePdfs: [pdf],
  };
}

function viewer(open: ContextPdfViewer["open"] = vi.fn(async () => true)): ContextPdfViewer {
  return {
    clearDraftSelection: vi.fn(),
    currentPage: 2,
    focusedAnnotationId: annotation.id,
    open,
    resize: vi.fn(async () => undefined),
    setPrivateHighlightSelection: vi.fn(),
    setTextSelectionMode: vi.fn(),
    setTool: vi.fn(),
    showError: vi.fn(),
    updateAnnotations: vi.fn(),
    updatePrivateHighlights: vi.fn(),
  };
}

describe("PDF context session", () => {
  it("opens the authorized document and owns rendered identity, navigation, scroll, and layout state", async () => {
    let activeKey: ResearchResourceTab["key"] | undefined = pdfTab().key;
    const navigationDocument = vi.fn();
    const selectWorkspacePdf = vi.fn();
    const reader = { scrollTop: 0 };
    const session = new PdfContextSession({
      activeKey: () => activeKey,
      navigationDocument,
      reader: () => reader,
      selectWorkspacePdf,
    });
    const boundViewer = viewer();
    session.bind("/api/workspaces/workspace", boundViewer);

    expect(session.layoutViewer).toBe(boundViewer);
    expect(session.viewerState()).toMatchObject({ renderedContextKey: undefined });
    await session.load(sources(), false);

    expect(selectWorkspacePdf).toHaveBeenCalledWith(pdf.id);
    expect(boundViewer.updateAnnotations).toHaveBeenCalledWith([annotation]);
    expect(boundViewer.open).toHaveBeenCalledWith(
      expect.objectContaining({
        documentKey: pdfTab().key,
        focusAnnotationId: annotation.id,
        mode: "evidence",
        page: 2,
        url: "/api/workspaces/workspace/pdfs/pdf%2F1",
      }),
    );
    expect(navigationDocument).toHaveBeenCalledWith(pdfTab().key, 2);
    expect(reader.scrollTop).toBe(28);
    expect(session.currentWorkspacePdfId).toBe(pdf.id);
    expect(session.viewerState()).toEqual({ focusedAnnotationId: annotation.id, page: 2, renderedContextKey: pdfTab().key });

    reader.scrollTop = 0;
    await session.load(sources(pdfTab(91)), false);
    expect(boundViewer.open).toHaveBeenCalledOnce();
    expect(reader.scrollTop).toBe(91);

    activeKey = undefined;
    await session.load(sources(undefined), false);
    expect(boundViewer.open).toHaveBeenCalledOnce();
  });

  it("rejects stale completions and reports only active failures", async () => {
    let activeKey: ResearchResourceTab["key"] | undefined = "pdf:other";
    const navigationDocument = vi.fn();
    const session = new PdfContextSession({
      activeKey: () => activeKey,
      navigationDocument,
      reader: () => ({ scrollTop: 0 }),
      selectWorkspacePdf: vi.fn(),
    });
    const staleViewer = viewer();
    session.bind("/api/workspaces/workspace", staleViewer);
    await session.load(sources(), true);
    expect(navigationDocument).not.toHaveBeenCalled();
    expect(session.currentWorkspacePdfId).toBeUndefined();

    const failure = new Error("runtime path");
    const failingViewer = viewer(vi.fn(async () => Promise.reject(failure)));
    session.bind("/api/workspaces/workspace", failingViewer);
    await session.load(sources(), true);
    expect(failingViewer.showError).not.toHaveBeenCalled();

    activeKey = pdfTab().key;
    await session.load(sources(), true);
    expect(failingViewer.showError).toHaveBeenCalledWith(failure);
  });

  it("remains inert until a viewer is bound", async () => {
    const session = new PdfContextSession({
      activeKey: () => pdfTab().key,
      navigationDocument: vi.fn(),
      reader: () => null,
      selectWorkspacePdf: vi.fn(),
    });

    expect(session.viewer).toBeNull();
    expect(session.viewerState()).toBeNull();
    await expect(session.load(sources(), false)).resolves.toBeUndefined();
  });
});
