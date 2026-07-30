import { afterEach, describe, expect, it } from "vitest";
import { createProjectHistoryActor, projectHistoryBusy, type ProjectHistoryActor } from "./project-history-machine";

const actors: ProjectHistoryActor[] = [];

afterEach(() => {
  for (const actor of actors.splice(0)) actor.stop();
});

function actor(): ProjectHistoryActor {
  const value = createProjectHistoryActor();
  actors.push(value);
  return value;
}

function open(value: ProjectHistoryActor): void {
  value.send({ type: "OPEN" });
  value.send({ type: "TIMELINE_READY", requestId: value.getSnapshot().context.requestId });
}

describe("project history machine", () => {
  it("loads the timeline before accepting operations", () => {
    const value = actor();
    value.send({ type: "START_OPERATION", operation: { kind: "inspect", revision: 2 } });
    expect(value.getSnapshot().value).toBe("closed");
    value.send({ type: "OPEN" });
    expect(projectHistoryBusy(value.getSnapshot())).toBe(true);
    value.send({ type: "TIMELINE_READY", requestId: value.getSnapshot().context.requestId });
    expect(value.getSnapshot().value).toBe("ready");
  });

  it("keeps mutually exclusive operation states", () => {
    const value = actor();
    open(value);
    value.send({ type: "START_OPERATION", operation: { kind: "compare", from: 1, to: 3 } });
    const requestId = value.getSnapshot().context.requestId;
    expect(value.getSnapshot()).toMatchObject({ value: "comparing", context: { operation: { kind: "compare" } } });
    value.send({ type: "START_OPERATION", operation: { kind: "restore", revision: 1 } });
    expect(value.getSnapshot().value).toBe("comparing");
    value.send({ type: "OPERATION_DONE", requestId });
    expect(value.getSnapshot()).toMatchObject({ value: "ready", context: { operation: null } });
  });

  it.each([
    [{ kind: "inspect", revision: 2 } as const, "inspecting"],
    [{ kind: "compare", from: 1, to: 2 } as const, "comparing"],
    [{ kind: "milestone", revision: 2 } as const, "savingMilestone"],
    [{ kind: "branch", revision: 2 } as const, "branching"],
    [{ kind: "restore", revision: 2 } as const, "restoring"],
  ])("maps %s to its exclusive operation state", (operation, expected) => {
    const value = actor();
    open(value);
    value.send({ type: "START_OPERATION", operation });
    expect(value.getSnapshot().value).toBe(expected);
    expect(value.getSnapshot().context.operation).toEqual(operation);
    expect(projectHistoryBusy(value.getSnapshot())).toBe(true);
  });

  it("invalidates late reads when the dialog closes", () => {
    const value = actor();
    open(value);
    value.send({ type: "START_OPERATION", operation: { kind: "inspect", revision: 4 } });
    const requestId = value.getSnapshot().context.requestId;
    value.send({ type: "CLOSE" });
    value.send({ type: "OPERATION_DONE", requestId });
    expect(value.getSnapshot().value).toBe("closed");
  });

  it("returns to the loaded timeline after an operation failure", () => {
    const value = actor();
    open(value);
    value.send({ type: "START_OPERATION", operation: { kind: "milestone", revision: 2 } });
    value.send({ type: "OPERATION_FAILED", requestId: value.getSnapshot().context.requestId, message: "Duplicate name" });
    expect(value.getSnapshot()).toMatchObject({ value: "ready", context: { operation: null, error: "Duplicate name" } });
  });

  it("supersedes an in-flight timeline request when reopened", () => {
    const value = actor();
    value.send({ type: "OPEN" });
    const staleRequest = value.getSnapshot().context.requestId;
    value.send({ type: "OPEN" });
    value.send({ type: "TIMELINE_READY", requestId: staleRequest });
    expect(value.getSnapshot().value).toBe("loadingTimeline");
    expect(value.getSnapshot().context.requestId).toBe(staleRequest + 1);
  });

  it("ignores mismatched failures and completions", () => {
    const value = actor();
    value.send({ type: "OPEN" });
    const requestId = value.getSnapshot().context.requestId;
    value.send({ type: "TIMELINE_FAILED", requestId: requestId + 1, message: "wrong timeline" });
    expect(value.getSnapshot().value).toBe("loadingTimeline");
    value.send({ type: "TIMELINE_READY", requestId });
    value.send({ type: "START_OPERATION", operation: { kind: "inspect", revision: 1 } });
    const operationRequest = value.getSnapshot().context.requestId;
    value.send({ type: "OPERATION_DONE", requestId: operationRequest + 1 });
    expect(value.getSnapshot().value).toBe("inspecting");
    value.send({ type: "OPERATION_FAILED", requestId: operationRequest, message: "Inspection failed" });
    expect(value.getSnapshot()).toMatchObject({ value: "ready", context: { error: "Inspection failed", operation: null } });
  });

  it("reports busy only for active timeline and operation work", () => {
    const value = actor();
    expect(projectHistoryBusy(value.getSnapshot())).toBe(false);
    value.send({ type: "OPEN" });
    const requestId = value.getSnapshot().context.requestId;
    expect(projectHistoryBusy(value.getSnapshot())).toBe(true);
    value.send({ type: "TIMELINE_FAILED", requestId, message: "Unavailable" });
    expect(value.getSnapshot().context.error).toBe("Unavailable");
    expect(projectHistoryBusy(value.getSnapshot())).toBe(false);
    value.send({ type: "CLOSE" });
    expect(value.getSnapshot().context.requestId).toBe(requestId + 1);
    expect(value.getSnapshot().context.error).toBeNull();
  });
});
