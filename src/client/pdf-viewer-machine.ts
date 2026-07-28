import { assertEvent, assign, createActor, setup, type ActorRefFrom, type SnapshotFrom } from "xstate";

interface PdfViewerContext {
  readonly documentRequest: number;
  readonly renderRequest: number;
  readonly page: number;
  readonly pages: number;
  readonly error: string | null;
}

type PdfViewerEvent =
  | { readonly type: "OPEN" }
  | { readonly type: "RUNTIME_READY"; readonly documentRequest: number }
  | { readonly type: "DOCUMENT_READY"; readonly documentRequest: number; readonly page: number; readonly pages: number }
  | { readonly type: "OPEN_FAILED"; readonly documentRequest: number; readonly message: string }
  | { readonly type: "RENDER"; readonly page: number }
  | { readonly type: "RENDERED"; readonly renderRequest: number }
  | { readonly type: "RENDER_FAILED"; readonly renderRequest: number; readonly message: string }
  | { readonly type: "CANCEL_RENDER" }
  | { readonly type: "CLOSE" };

const initialContext: PdfViewerContext = {
  documentRequest: 0,
  renderRequest: 0,
  page: 1,
  pages: 0,
  error: null,
};

const pdfViewerMachine = setup({
  types: {
    context: {} as PdfViewerContext,
    events: {} as PdfViewerEvent,
  },
  guards: {
    matchesDocument: ({ context, event }) => {
      assertEvent(event, ["RUNTIME_READY", "DOCUMENT_READY", "OPEN_FAILED"]);
      return event.documentRequest === context.documentRequest;
    },
    matchesRender: ({ context, event }) => {
      assertEvent(event, ["RENDERED", "RENDER_FAILED"]);
      return event.renderRequest === context.renderRequest;
    },
  },
  actions: {
    startOpen: assign(({ context }) => ({
      documentRequest: context.documentRequest + 1,
      renderRequest: context.renderRequest + 1,
      page: 1,
      pages: 0,
      error: null,
    })),
    storeDocument: assign(({ event }) => {
      assertEvent(event, "DOCUMENT_READY");
      return { page: event.page, pages: event.pages, error: null };
    }),
    startRender: assign(({ context, event }) => {
      assertEvent(event, "RENDER");
      return { renderRequest: context.renderRequest + 1, page: event.page, error: null };
    }),
    cancelRender: assign(({ context }) => ({ renderRequest: context.renderRequest + 1 })),
    recordFailure: assign(({ event }) => {
      assertEvent(event, ["OPEN_FAILED", "RENDER_FAILED"]);
      return { error: event.message };
    }),
    reset: assign(({ context }) => ({
      ...initialContext,
      documentRequest: context.documentRequest + 1,
      renderRequest: context.renderRequest + 1,
    })),
  },
}).createMachine({
  id: "pdfViewer",
  initial: "closed",
  context: initialContext,
  on: {
    OPEN: { target: ".loadingRuntime", actions: "startOpen" },
    CLOSE: { target: ".closed", actions: "reset" },
  },
  states: {
    closed: {},
    loadingRuntime: {
      on: {
        RUNTIME_READY: { guard: "matchesDocument", target: "loadingDocument" },
        OPEN_FAILED: { guard: "matchesDocument", target: "failed", actions: "recordFailure" },
      },
    },
    loadingDocument: {
      on: {
        DOCUMENT_READY: { guard: "matchesDocument", target: "ready", actions: "storeDocument" },
        OPEN_FAILED: { guard: "matchesDocument", target: "failed", actions: "recordFailure" },
      },
    },
    ready: {
      on: {
        RENDER: { target: "rendering", actions: "startRender" },
      },
    },
    rendering: {
      on: {
        RENDER: { target: "rendering", reenter: true, actions: "startRender" },
        RENDERED: { guard: "matchesRender", target: "ready" },
        RENDER_FAILED: { guard: "matchesRender", target: "failed", actions: "recordFailure" },
        CANCEL_RENDER: { target: "ready", actions: "cancelRender" },
      },
    },
    failed: {
      on: {
        RENDER: { guard: ({ context }) => context.pages > 0, target: "rendering", actions: "startRender" },
      },
    },
  },
});

export type PdfViewerActor = ActorRefFrom<typeof pdfViewerMachine>;
export type PdfViewerSnapshot = SnapshotFrom<typeof pdfViewerMachine>;

export function createPdfViewerActor(): PdfViewerActor {
  return createActor(pdfViewerMachine).start();
}

export function pdfViewerDocumentRequestActive(snapshot: PdfViewerSnapshot, request: number): boolean {
  return request === snapshot.context.documentRequest && !snapshot.matches("closed") && !snapshot.matches("failed");
}

export function pdfViewerRenderRequestActive(snapshot: PdfViewerSnapshot, request: number): boolean {
  return snapshot.matches("rendering") && request === snapshot.context.renderRequest;
}
