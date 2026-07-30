import { assertEvent, assign, createActor, setup, type ActorRefFrom, type SnapshotFrom } from "xstate";

export type ProjectHistoryOperation =
  | { readonly kind: "inspect"; readonly revision: number }
  | { readonly kind: "compare"; readonly from: number; readonly to: number }
  | { readonly kind: "milestone"; readonly revision: number }
  | { readonly kind: "branch"; readonly revision: number }
  | { readonly kind: "restore"; readonly revision: number };

interface ProjectHistoryContext {
  readonly requestId: number;
  readonly operation: ProjectHistoryOperation | null;
  readonly error: string | null;
}

type ProjectHistoryEvent =
  | { readonly type: "OPEN" }
  | { readonly type: "TIMELINE_READY"; readonly requestId: number }
  | { readonly type: "TIMELINE_FAILED"; readonly requestId: number; readonly message: string }
  | { readonly type: "START_OPERATION"; readonly operation: ProjectHistoryOperation }
  | { readonly type: "OPERATION_DONE"; readonly requestId: number }
  | { readonly type: "OPERATION_FAILED"; readonly requestId: number; readonly message: string }
  | { readonly type: "CLOSE" };

const initialContext: ProjectHistoryContext = { requestId: 0, operation: null, error: null };

const projectHistoryMachine = setup({
  types: {
    context: {} as ProjectHistoryContext,
    events: {} as ProjectHistoryEvent,
  },
  guards: {
    matchesRequest: ({ context, event }) => {
      assertEvent(event, ["TIMELINE_READY", "TIMELINE_FAILED", "OPERATION_DONE", "OPERATION_FAILED"]);
      return event.requestId === context.requestId;
    },
  },
  actions: {
    startTimeline: assign(({ context }) => ({ requestId: context.requestId + 1, operation: null, error: null })),
    startOperation: assign(({ context, event }) => {
      assertEvent(event, "START_OPERATION");
      return { requestId: context.requestId + 1, operation: event.operation, error: null };
    }),
    finishOperation: assign({ operation: null, error: null }),
    recordFailure: assign(({ event }) => {
      assertEvent(event, ["TIMELINE_FAILED", "OPERATION_FAILED"]);
      return { operation: null, error: event.message };
    }),
    close: assign(({ context }) => ({ requestId: context.requestId + 1, operation: null, error: null })),
  },
}).createMachine({
  id: "projectHistory",
  initial: "closed",
  context: initialContext,
  on: {
    OPEN: { target: ".loadingTimeline", actions: "startTimeline" },
    CLOSE: { target: ".closed", actions: "close" },
  },
  states: {
    closed: {},
    loadingTimeline: {
      on: {
        TIMELINE_READY: { guard: "matchesRequest", target: "ready" },
        TIMELINE_FAILED: { guard: "matchesRequest", target: "failed", actions: "recordFailure" },
      },
    },
    ready: {
      on: {
        START_OPERATION: [
          {
            guard: ({ event }) => event.operation.kind === "inspect",
            target: "inspecting",
            actions: "startOperation",
          },
          {
            guard: ({ event }) => event.operation.kind === "compare",
            target: "comparing",
            actions: "startOperation",
          },
          {
            guard: ({ event }) => event.operation.kind === "milestone",
            target: "savingMilestone",
            actions: "startOperation",
          },
          {
            guard: ({ event }) => event.operation.kind === "branch",
            target: "branching",
            actions: "startOperation",
          },
          {
            guard: ({ event }) => event.operation.kind === "restore",
            target: "restoring",
            actions: "startOperation",
          },
        ],
      },
    },
    inspecting: {
      on: {
        OPERATION_DONE: { guard: "matchesRequest", target: "ready", actions: "finishOperation" },
        OPERATION_FAILED: { guard: "matchesRequest", target: "ready", actions: "recordFailure" },
      },
    },
    comparing: {
      on: {
        OPERATION_DONE: { guard: "matchesRequest", target: "ready", actions: "finishOperation" },
        OPERATION_FAILED: { guard: "matchesRequest", target: "ready", actions: "recordFailure" },
      },
    },
    savingMilestone: {
      on: {
        OPERATION_DONE: { guard: "matchesRequest", target: "ready", actions: "finishOperation" },
        OPERATION_FAILED: { guard: "matchesRequest", target: "ready", actions: "recordFailure" },
      },
    },
    branching: {
      on: {
        OPERATION_DONE: { guard: "matchesRequest", target: "ready", actions: "finishOperation" },
        OPERATION_FAILED: { guard: "matchesRequest", target: "ready", actions: "recordFailure" },
      },
    },
    restoring: {
      on: {
        OPERATION_DONE: { guard: "matchesRequest", target: "ready", actions: "finishOperation" },
        OPERATION_FAILED: { guard: "matchesRequest", target: "ready", actions: "recordFailure" },
      },
    },
    failed: {},
  },
});

export type ProjectHistoryActor = ActorRefFrom<typeof projectHistoryMachine>;
export type ProjectHistorySnapshot = SnapshotFrom<typeof projectHistoryMachine>;

export function createProjectHistoryActor(): ProjectHistoryActor {
  return createActor(projectHistoryMachine).start();
}

export function projectHistoryBusy(snapshot: ProjectHistorySnapshot): boolean {
  return !snapshot.matches("closed") && !snapshot.matches("ready") && !snapshot.matches("failed");
}
