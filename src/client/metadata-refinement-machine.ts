import { assertEvent, assign, createActor, setup, type ActorRefFrom, type SnapshotFrom } from "xstate";
import type { MetadataRefinementPreview } from "../domain/reference-library";
import type { PdfMetadataCandidates } from "./pdf-metadata";

interface MetadataRefinementContext {
  readonly referenceId: string | null;
  readonly artifactId: string | null;
  readonly requestId: number;
  readonly local: PdfMetadataCandidates | null;
  readonly preview: MetadataRefinementPreview | null;
  readonly error: string | null;
}

type MetadataRefinementEvent =
  | { readonly type: "START"; readonly referenceId: string; readonly artifactId: string }
  | { readonly type: "LOCAL_READY"; readonly requestId: number; readonly local: PdfMetadataCandidates }
  | { readonly type: "DISCOVERY_READY"; readonly requestId: number; readonly preview: MetadataRefinementPreview }
  | { readonly type: "DISCOVERY_FAILED"; readonly requestId: number; readonly message: string }
  | { readonly type: "FAIL"; readonly requestId: number; readonly message: string }
  | { readonly type: "APPLY"; readonly referenceId: string }
  | { readonly type: "APPLIED" }
  | { readonly type: "APPLY_FAILED"; readonly message: string }
  | { readonly type: "CANCEL" };

const initialContext: MetadataRefinementContext = {
  referenceId: null,
  artifactId: null,
  requestId: 0,
  local: null,
  preview: null,
  error: null,
};

const metadataRefinementMachine = setup({
  types: {
    context: {} as MetadataRefinementContext,
    events: {} as MetadataRefinementEvent,
  },
  guards: {
    matchesRequest: ({ context, event }) => {
      assertEvent(event, ["LOCAL_READY", "DISCOVERY_READY", "DISCOVERY_FAILED", "FAIL"]);
      return event.requestId === context.requestId;
    },
    matchesReference: ({ context, event }) => {
      assertEvent(event, "APPLY");
      return event.referenceId === context.referenceId;
    },
  },
  actions: {
    start: assign(({ context, event }) => {
      assertEvent(event, "START");
      return {
        referenceId: event.referenceId,
        artifactId: event.artifactId,
        requestId: context.requestId + 1,
        local: null,
        preview: null,
        error: null,
      };
    }),
    storeLocal: assign(({ event }) => {
      assertEvent(event, "LOCAL_READY");
      return { local: event.local, error: null };
    }),
    storePreview: assign(({ event }) => {
      assertEvent(event, "DISCOVERY_READY");
      return { preview: event.preview, error: null };
    }),
    recordFailure: assign(({ event }) => {
      assertEvent(event, ["DISCOVERY_FAILED", "FAIL", "APPLY_FAILED"]);
      return { error: event.message };
    }),
    reset: assign(({ context }) => ({ ...initialContext, requestId: context.requestId + 1 })),
  },
}).createMachine({
  id: "metadataRefinement",
  initial: "idle",
  context: initialContext,
  on: {
    START: { target: ".extracting", actions: "start" },
    CANCEL: { target: ".idle", actions: "reset" },
  },
  states: {
    idle: {},
    extracting: {
      on: {
        LOCAL_READY: { guard: "matchesRequest", target: "discovering", actions: "storeLocal" },
        FAIL: { guard: "matchesRequest", target: "failed", actions: "recordFailure" },
      },
    },
    discovering: {
      on: {
        DISCOVERY_READY: { guard: "matchesRequest", target: "reviewing", actions: "storePreview" },
        DISCOVERY_FAILED: { guard: "matchesRequest", target: "reviewing", actions: "recordFailure" },
        FAIL: { guard: "matchesRequest", target: "failed", actions: "recordFailure" },
      },
    },
    reviewing: {
      on: {
        APPLY: { guard: "matchesReference", target: "applying" },
      },
    },
    applying: {
      on: {
        APPLIED: { target: "complete" },
        APPLY_FAILED: { target: "reviewing", actions: "recordFailure" },
      },
    },
    complete: {},
    failed: {},
  },
});

export type MetadataRefinementActor = ActorRefFrom<typeof metadataRefinementMachine>;
export type MetadataRefinementSnapshot = SnapshotFrom<typeof metadataRefinementMachine>;

export function createMetadataRefinementActor(): MetadataRefinementActor {
  return createActor(metadataRefinementMachine).start();
}

export function metadataRefinementBusy(snapshot: MetadataRefinementSnapshot): boolean {
  return snapshot.matches("extracting") || snapshot.matches("discovering") || snapshot.matches("applying");
}
