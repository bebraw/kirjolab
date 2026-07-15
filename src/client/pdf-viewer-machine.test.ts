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
  });

  it("invalidates a render during continuous zoom", () => {
    const value = actor();
    load(value);
    value.send({ type: "RENDER", page: 1 });
    const staleRender = value.getSnapshot().context.renderRequest;
    value.send({ type: "CANCEL_RENDER" });
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
});
