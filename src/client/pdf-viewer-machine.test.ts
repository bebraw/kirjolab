import { afterEach, describe, expect, it } from "vitest";
import {
  createPdfViewerActor,
  pdfViewerDocumentRequestActive,
  pdfViewerRenderRequestActive,
  type PdfViewerActor,
} from "./pdf-viewer-machine";

const actors: PdfViewerActor[] = [];

afterEach(() => {
  for (const actor of actors.splice(0)) actor.stop();
});

function actor(): PdfViewerActor {
  const value = createPdfViewerActor();
  actors.push(value);
  return value;
}

function load(value: PdfViewerActor, page = 1): number {
  value.send({ type: "OPEN" });
  const request = value.getSnapshot().context.documentRequest;
  value.send({ type: "RUNTIME_READY", documentRequest: request });
  value.send({ type: "DOCUMENT_READY", documentRequest: request, page, pages: 12 });
  return request;
}

describe("PDF viewer lifecycle machine", () => {
  it("coordinates runtime, document, and page rendering", () => {
    const value = actor();
    const documentRequest = load(value, 3);
    expect(pdfViewerDocumentRequestActive(value.getSnapshot(), documentRequest)).toBe(true);
    value.send({ type: "RENDER", page: 3 });
    const renderRequest = value.getSnapshot().context.renderRequest;
    expect(pdfViewerRenderRequestActive(value.getSnapshot(), renderRequest)).toBe(true);
    value.send({ type: "RENDERED", renderRequest });
    expect(value.getSnapshot()).toMatchObject({ value: "ready", context: { page: 3, pages: 12 } });
  });

  it("invalidates late document work when another PDF opens", () => {
    const value = actor();
    value.send({ type: "OPEN" });
    const staleRequest = value.getSnapshot().context.documentRequest;
    value.send({ type: "OPEN" });
    value.send({ type: "RUNTIME_READY", documentRequest: staleRequest });
    expect(value.getSnapshot().value).toBe("loadingRuntime");
    expect(pdfViewerDocumentRequestActive(value.getSnapshot(), staleRequest)).toBe(false);
    expect(value.getSnapshot().context).toMatchObject({
      documentRequest: staleRequest + 1,
      renderRequest: 2,
      page: 1,
      pages: 0,
      error: null,
    });
  });

  it("invalidates a render during continuous zoom", () => {
    const value = actor();
    load(value);
    value.send({ type: "RENDER", page: 1 });
    const staleRender = value.getSnapshot().context.renderRequest;
    value.send({ type: "CANCEL_RENDER" });
    expect(value.getSnapshot().context.renderRequest).toBe(staleRender + 1);
    value.send({ type: "RENDERED", renderRequest: staleRender });
    expect(value.getSnapshot().value).toBe("ready");
    expect(pdfViewerRenderRequestActive(value.getSnapshot(), staleRender)).toBe(false);
  });

  it("allows page rendering to recover after a render failure", () => {
    const value = actor();
    load(value);
    value.send({ type: "RENDER", page: 2 });
    value.send({ type: "RENDER_FAILED", renderRequest: value.getSnapshot().context.renderRequest, message: "Canvas unavailable" });
    expect(value.getSnapshot()).toMatchObject({ value: "failed", context: { error: "Canvas unavailable" } });
    value.send({ type: "RENDER", page: 2 });
    expect(value.getSnapshot().value).toBe("rendering");
  });

  it("ignores mismatched document and render completions", () => {
    const value = actor();
    value.send({ type: "OPEN" });
    const documentRequest = value.getSnapshot().context.documentRequest;
    value.send({ type: "RUNTIME_READY", documentRequest: documentRequest + 1 });
    expect(value.getSnapshot().value).toBe("loadingRuntime");
    value.send({ type: "RUNTIME_READY", documentRequest });
    value.send({ type: "DOCUMENT_READY", documentRequest: documentRequest + 1, page: 8, pages: 9 });
    expect(value.getSnapshot().value).toBe("loadingDocument");
    value.send({ type: "DOCUMENT_READY", documentRequest, page: 2, pages: 9 });
    value.send({ type: "RENDER", page: 2 });
    const renderRequest = value.getSnapshot().context.renderRequest;
    expect(value.getSnapshot().context.page).toBe(2);
    value.send({ type: "RENDER_FAILED", renderRequest: renderRequest + 1, message: "wrong render" });
    expect(value.getSnapshot().value).toBe("rendering");
    expect(pdfViewerRenderRequestActive(value.getSnapshot(), renderRequest + 1)).toBe(false);
    value.send({ type: "RENDERED", renderRequest });
    expect(pdfViewerRenderRequestActive(value.getSnapshot(), renderRequest)).toBe(false);
  });

  it("records open failures and refuses rendering without a document", () => {
    const value = actor();
    value.send({ type: "OPEN" });
    const documentRequest = value.getSnapshot().context.documentRequest;
    value.send({ type: "OPEN_FAILED", documentRequest, message: "Runtime unavailable" });
    expect(value.getSnapshot()).toMatchObject({ value: "failed", context: { pages: 0, error: "Runtime unavailable" } });
    expect(pdfViewerDocumentRequestActive(value.getSnapshot(), documentRequest)).toBe(false);
    value.send({ type: "RENDER", page: 1 });
    expect(value.getSnapshot().value).toBe("failed");
  });

  it("closes by invalidating document and render requests", () => {
    const value = actor();
    const documentRequest = load(value, 4);
    const renderRequest = value.getSnapshot().context.renderRequest;
    value.send({ type: "CLOSE" });
    expect(value.getSnapshot()).toMatchObject({
      value: "closed",
      context: {
        documentRequest: documentRequest + 1,
        renderRequest: renderRequest + 1,
        page: 1,
        pages: 0,
        error: null,
      },
    });
  });
});
