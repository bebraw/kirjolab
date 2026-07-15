import { afterEach, describe, expect, it } from "vitest";
import { assistantWorkflowBusy, createAssistantWorkflowActor, type AssistantWorkflowActor } from "./assistant-workflow-machine";

const actors: AssistantWorkflowActor[] = [];

afterEach(() => {
  for (const actor of actors.splice(0)) actor.stop();
});

function actor(): AssistantWorkflowActor {
  const value = createAssistantWorkflowActor();
  actors.push(value);
  return value;
}

describe("assistant workflow machine", () => {
  it("coordinates generation, user input, and review", () => {
    const value = actor();
    value.send({ type: "START", operation: "clarity-drill", sourceRevision: 12 });
    expect(assistantWorkflowBusy(value.getSnapshot())).toBe(true);
    expect(value.getSnapshot().context).toMatchObject({ operation: "clarity-drill", sourceRevision: 12 });

    value.send({ type: "AWAIT_INPUT" });
    expect(value.getSnapshot().value).toBe("awaitingInput");
    expect(assistantWorkflowBusy(value.getSnapshot())).toBe(false);
    value.send({ type: "CONTINUE" });
    value.send({ type: "REVIEW" });
    expect(value.getSnapshot().value).toBe("reviewing");
  });

  it("marks transient results stale when the manuscript changes", () => {
    const value = actor();
    value.send({ type: "START", operation: "build-table", sourceRevision: 3 });
    value.send({ type: "REVIEW" });
    value.send({ type: "SOURCE_CHANGED" });
    expect(value.getSnapshot().value).toBe("stale");
    value.send({ type: "RESET" });
    expect(value.getSnapshot()).toMatchObject({ value: "idle", context: { operation: null, sourceRevision: null } });
  });

  it("keeps candidate decisions mutually exclusive", () => {
    const value = actor();
    value.send({ type: "DECIDE", id: "candidate-1", action: "apply" });
    expect(value.getSnapshot()).toMatchObject({
      value: "deciding",
      context: { candidateDecision: { id: "candidate-1", action: "apply" } },
    });
    value.send({ type: "DECIDE", id: "candidate-2", action: "reject" });
    expect(value.getSnapshot().context.candidateDecision?.id).toBe("candidate-1");
    value.send({ type: "DECISION_DONE" });
    expect(value.getSnapshot()).toMatchObject({ value: "idle", context: { candidateDecision: null } });
  });

  it("retains failures until reset or another operation begins", () => {
    const value = actor();
    value.send({ type: "START", operation: "ideate", sourceRevision: 4 });
    value.send({ type: "FAIL", message: "Model unavailable" });
    expect(value.getSnapshot()).toMatchObject({ value: "failed", context: { error: "Model unavailable" } });
    expect(assistantWorkflowBusy(value.getSnapshot())).toBe(false);
    value.send({ type: "START", operation: "find-references", sourceRevision: 5 });
    expect(value.getSnapshot()).toMatchObject({ value: "running", context: { error: null } });
  });
});
