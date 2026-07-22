import { assertEvent, assign, createActor, setup, type ActorRefFrom, type SnapshotFrom } from "xstate";
import type { AssistantOperationId } from "./assistant-operations";

export interface AssistantCandidateDecision {
  readonly id: string;
  readonly action: "apply" | "reject";
}

interface AssistantWorkflowContext {
  readonly operation: AssistantOperationId | null;
  readonly sourceRevision: number | null;
  readonly candidateDecision: AssistantCandidateDecision | null;
  readonly error: string | null;
}

type AssistantWorkflowEvent =
  | { readonly type: "START"; readonly operation: AssistantOperationId; readonly sourceRevision: number }
  | { readonly type: "AWAIT_INPUT" }
  | { readonly type: "REVIEW" }
  | { readonly type: "CONTINUE" }
  | { readonly type: "COMPLETE" }
  | { readonly type: "FAIL"; readonly message: string }
  | { readonly type: "SOURCE_CHANGED" }
  | { readonly type: "DECIDE"; readonly id: string; readonly action: "apply" | "reject" }
  | { readonly type: "DECISION_DONE" }
  | { readonly type: "DECISION_FAILED"; readonly message: string }
  | { readonly type: "RESET" };

const initialContext: AssistantWorkflowContext = {
  operation: null,
  sourceRevision: null,
  candidateDecision: null,
  error: null,
};

const decisionTransition = { target: "deciding", actions: "startDecision" } as const;

export const assistantWorkflowMachine = setup({
  types: {
    context: {} as AssistantWorkflowContext,
    events: {} as AssistantWorkflowEvent,
  },
  actions: {
    start: assign(({ event }) => {
      assertEvent(event, "START");
      return {
        operation: event.operation,
        sourceRevision: event.sourceRevision,
        candidateDecision: null,
        error: null,
      };
    }),
    startDecision: assign(({ event }) => {
      assertEvent(event, "DECIDE");
      return { candidateDecision: { id: event.id, action: event.action }, error: null };
    }),
    recordFailure: assign(({ event }) => {
      assertEvent(event, ["FAIL", "DECISION_FAILED"]);
      return { candidateDecision: null, error: event.message };
    }),
    reset: assign(() => initialContext),
  },
}).createMachine({
  id: "assistantWorkflow",
  initial: "idle",
  context: initialContext,
  states: {
    idle: {
      on: {
        START: { target: "running", actions: "start" },
        DECIDE: decisionTransition,
      },
    },
    running: {
      on: {
        AWAIT_INPUT: { target: "awaitingInput" },
        REVIEW: { target: "reviewing" },
        COMPLETE: { target: "idle", actions: "reset" },
        FAIL: { target: "failed", actions: "recordFailure" },
      },
    },
    awaitingInput: {
      on: {
        CONTINUE: { target: "running" },
        SOURCE_CHANGED: { target: "stale" },
        DECIDE: decisionTransition,
        RESET: { target: "idle", actions: "reset" },
      },
    },
    reviewing: {
      on: {
        CONTINUE: { target: "running" },
        SOURCE_CHANGED: { target: "stale" },
        DECIDE: decisionTransition,
        RESET: { target: "idle", actions: "reset" },
      },
    },
    stale: {
      on: {
        START: { target: "running", actions: "start" },
        DECIDE: decisionTransition,
        RESET: { target: "idle", actions: "reset" },
      },
    },
    deciding: {
      on: {
        DECISION_DONE: { target: "idle", actions: "reset" },
        DECISION_FAILED: { target: "failed", actions: "recordFailure" },
      },
    },
    failed: {
      on: {
        START: { target: "running", actions: "start" },
        DECIDE: decisionTransition,
        RESET: { target: "idle", actions: "reset" },
      },
    },
  },
});

export type AssistantWorkflowActor = ActorRefFrom<typeof assistantWorkflowMachine>;
export type AssistantWorkflowSnapshot = SnapshotFrom<typeof assistantWorkflowMachine>;

export function createAssistantWorkflowActor(): AssistantWorkflowActor {
  return createActor(assistantWorkflowMachine).start();
}

export function assistantWorkflowBusy(snapshot: AssistantWorkflowSnapshot): boolean {
  return snapshot.matches("running") || snapshot.matches("deciding");
}
