import { assertEvent, assign, createActor, setup, type ActorRefFrom, type SnapshotFrom } from "xstate";
import type { PublicationIntakePreview } from "../domain/workspace";

interface PublicationIntakeContext {
  readonly pdfId: string | null;
  readonly requestId: number;
  readonly preview: PublicationIntakePreview | null;
  readonly error: string | null;
}

type PublicationIntakeEvent =
  | { readonly type: "OPEN"; readonly pdfId: string }
  | { readonly type: "START_PREVIEW" }
  | { readonly type: "PREVIEW_READY"; readonly requestId: number; readonly preview: PublicationIntakePreview }
  | { readonly type: "PREVIEW_FAILED"; readonly requestId: number; readonly message: string }
  | { readonly type: "ACCEPT" }
  | { readonly type: "ACCEPTED"; readonly requestId: number }
  | { readonly type: "ACCEPT_FAILED"; readonly requestId: number; readonly message: string }
  | { readonly type: "CANCEL" };

const initialContext: PublicationIntakeContext = {
  pdfId: null,
  requestId: 0,
  preview: null,
  error: null,
};

const publicationIntakeMachine = setup({
  types: {
    context: {} as PublicationIntakeContext,
    events: {} as PublicationIntakeEvent,
  },
  guards: {
    matchesPreviewRequest: ({ context, event }) => {
      assertEvent(event, "PREVIEW_READY");
      return event.requestId === context.requestId && event.preview.pdfId === context.pdfId;
    },
    matchesRequest: ({ context, event }) => {
      assertEvent(event, ["PREVIEW_FAILED", "ACCEPTED", "ACCEPT_FAILED"]);
      return event.requestId === context.requestId;
    },
  },
  actions: {
    open: assign(({ event, context }) => {
      assertEvent(event, "OPEN");
      return { pdfId: event.pdfId, requestId: context.requestId + 1, preview: null, error: null };
    }),
    startRequest: assign(({ context }) => ({ requestId: context.requestId + 1, error: null })),
    storePreview: assign(({ event }) => {
      assertEvent(event, "PREVIEW_READY");
      return { preview: event.preview, error: null };
    }),
    recordFailure: assign(({ event }) => {
      assertEvent(event, ["PREVIEW_FAILED", "ACCEPT_FAILED"]);
      return { error: event.message };
    }),
    clearPreview: assign({ preview: null }),
    cancel: assign(({ context }) => ({ requestId: context.requestId + 1, preview: null, error: null })),
  },
}).createMachine({
  id: "publicationIntake",
  initial: "idle",
  context: initialContext,
  on: {
    OPEN: { target: ".idle", actions: "open" },
    CANCEL: { target: ".idle", actions: "cancel" },
  },
  states: {
    idle: {
      on: { START_PREVIEW: { target: "previewing", actions: "startRequest" } },
    },
    previewing: {
      on: {
        PREVIEW_READY: { guard: "matchesPreviewRequest", target: "reviewing", actions: "storePreview" },
        PREVIEW_FAILED: { guard: "matchesRequest", target: "failed", actions: ["clearPreview", "recordFailure"] },
      },
    },
    reviewing: {
      on: {
        START_PREVIEW: { target: "previewing", actions: ["clearPreview", "startRequest"] },
        ACCEPT: { target: "accepting", actions: "startRequest" },
      },
    },
    accepting: {
      on: {
        ACCEPTED: { guard: "matchesRequest", target: "idle", actions: "clearPreview" },
        ACCEPT_FAILED: { guard: "matchesRequest", target: "reviewing", actions: "recordFailure" },
      },
    },
    failed: {
      on: { START_PREVIEW: { target: "previewing", actions: "startRequest" } },
    },
  },
});

export type PublicationIntakeActor = ActorRefFrom<typeof publicationIntakeMachine>;
export type PublicationIntakeSnapshot = SnapshotFrom<typeof publicationIntakeMachine>;

export function createPublicationIntakeActor(): PublicationIntakeActor {
  return createActor(publicationIntakeMachine).start();
}

export function publicationIntakeBusy(snapshot: PublicationIntakeSnapshot): boolean {
  return snapshot.matches("previewing") || snapshot.matches("accepting");
}
