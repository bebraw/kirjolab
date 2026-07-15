import { afterEach, describe, expect, it } from "vitest";
import {
  collaborationCanEdit,
  collaborationStable,
  collaborationStatus,
  collaborationSynced,
  createCollaborationWorkflowActor,
  type CollaborationWorkflowActor,
} from "./collaboration-workflow-machine";

const actors: CollaborationWorkflowActor[] = [];

afterEach(() => {
  for (const actor of actors.splice(0)) actor.stop();
});

function actor(): CollaborationWorkflowActor {
  const value = createCollaborationWorkflowActor();
  actors.push(value);
  return value;
}

function connect(value: CollaborationWorkflowActor): void {
  value.send({ type: "CONNECT", online: true });
  value.send({ type: "SOCKET_OPEN" });
  value.send({ type: "SYNC" });
}

describe("collaboration workflow machine", () => {
  it("requires server-led sync before becoming live", () => {
    const value = actor();
    value.send({ type: "CONNECT", online: true });
    expect(value.getSnapshot().value).toBe("connecting");
    value.send({ type: "SOCKET_OPEN" });
    expect(collaborationStatus(value.getSnapshot()).label).toBe("Synchronizing");
    value.send({ type: "SYNC" });
    expect(collaborationSynced(value.getSnapshot())).toBe(true);
    expect(collaborationCanEdit(value.getSnapshot())).toBe(true);
    expect(collaborationStable(value.getSnapshot())).toBe(true);
  });

  it("tracks pending updates and remote revision boundaries", () => {
    const value = actor();
    connect(value);
    value.send({ type: "QUEUE_CHANGED", pendingUpdates: 2 });
    expect(collaborationStable(value.getSnapshot())).toBe(false);
    value.send({ type: "QUEUE_CHANGED", pendingUpdates: 0 });
    value.send({ type: "REMOTE_UPDATE" });
    expect(collaborationStable(value.getSnapshot())).toBe(false);
    value.send({ type: "REVISION" });
    expect(collaborationStable(value.getSnapshot())).toBe(true);
  });

  it("keeps an authorized offline copy editable across reconnect", () => {
    const value = actor();
    connect(value);
    value.send({ type: "SOCKET_CLOSED", online: true });
    expect(value.getSnapshot().value).toBe("reconnecting");
    expect(collaborationCanEdit(value.getSnapshot())).toBe(true);
    value.send({ type: "RECONNECT" });
    expect(value.getSnapshot().value).toBe("connecting");
    value.send({ type: "SOCKET_CLOSED", online: false });
    expect(value.getSnapshot().value).toBe("offline");
    expect(collaborationCanEdit(value.getSnapshot())).toBe(true);
  });

  it("does not enable a project that has never synchronized or restored", () => {
    const value = actor();
    value.send({ type: "CONNECT", online: false });
    expect(collaborationCanEdit(value.getSnapshot())).toBe(false);
    value.send({ type: "OFFLINE_AVAILABLE", available: true });
    expect(collaborationCanEdit(value.getSnapshot())).toBe(true);
  });

  it("clears live-only state during reset", () => {
    const value = actor();
    connect(value);
    value.send({ type: "PRESENCE", collaborators: 3 });
    expect(collaborationStatus(value.getSnapshot()).label).toBe("Live · 3 writers");
    value.send({ type: "RESET" });
    expect(value.getSnapshot()).toMatchObject({
      value: "resetting",
      context: { offlineAvailable: false, awaitingRemoteRevision: false, collaborators: null },
    });
  });
});
