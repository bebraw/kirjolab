import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CollaborationSession } from "./collaboration-session";

const remoteOrigin = Symbol("remote");

function connectedSession(document = new Y.Doc()): CollaborationSession {
  const session = new CollaborationSession(document, remoteOrigin);
  session.connect(true);
  session.beginSocket();
  session.socketOpened();
  expect(session.synchronize()).toBe(true);
  return session;
}

describe("collaboration session", () => {
  it("owns workflow status, presence, disconnect, reconnect, and offline availability", () => {
    const session = new CollaborationSession(new Y.Doc(), remoteOrigin);
    expect(session.status).toEqual({ label: "Offline · changes stay on this device", connected: false });
    expect(session.canEdit).toBe(false);

    session.connect(true);
    session.beginSocket();
    session.socketOpened();
    expect(session.status.label).toBe("Synchronizing");
    expect(session.synchronize()).toBe(true);
    expect(session.synchronize()).toBe(false);
    session.setPresence(2);
    expect(session.status).toEqual({ label: "Live · 2 writers", connected: true });
    session.socketClosed(true);
    expect(session.status.label).toBe("Reconnecting");
    session.reconnect();
    session.socketClosed(false);
    session.setOfflineAvailable(true);
    expect(session.canEdit).toBe(true);
    session.goOffline();
    session.reset();
    expect(session.offlineAvailable).toBe(false);
  });

  it("owns pending update ordering, acknowledgement, and server shadow state", () => {
    const document = new Y.Doc();
    const session = connectedSession(document);
    const local = new Y.Doc();
    local.getText("source").insert(0, "Local change");
    const update = Y.encodeStateAsUpdate(local);
    const sent: ArrayBuffer[] = [];

    expect(session.acknowledge()).toBe(false);
    session.enqueue(update);
    expect(session.pendingCount).toBe(1);
    expect(session.stable).toBe(false);
    session.flush((payload) => sent.push(payload));
    session.flush((payload) => sent.push(payload));
    expect(sent).toHaveLength(1);
    expect(session.acknowledge()).toBe(true);
    expect(session.pendingCount).toBe(0);
    expect(session.stable).toBe(true);
    expect(session.serverStateVector.byteLength).toBeGreaterThan(0);
  });

  it("queues only locally authored document updates", () => {
    const session = new CollaborationSession(new Y.Doc(), remoteOrigin);
    const update = new Uint8Array([1, 2, 3]);
    const offlineOrigin = Symbol("offline");

    expect(session.enqueueLocal(update, remoteOrigin, offlineOrigin)).toBe(false);
    expect(session.enqueueLocal(update, offlineOrigin, offlineOrigin)).toBe(false);
    expect(session.enqueueLocal(update, "local", offlineOrigin)).toBe(true);
    expect(session.pendingCount).toBe(1);
  });

  it("owns remote Yjs application and remote-revision stability", () => {
    const document = new Y.Doc();
    const session = connectedSession(document);
    const remote = new Y.Doc();
    remote.getText("source").insert(0, "Remote change");

    session.applyRemoteUpdate(Y.encodeStateAsUpdate(remote).buffer as ArrayBuffer);

    expect(document.getText("source").toString()).toBe("Remote change");
    expect(session.stable).toBe(false);
    session.observeRevision();
    expect(session.stable).toBe(true);
    expect(() => session.applyRemoteUpdate(new Uint8Array([255]).buffer)).toThrow();
  });

  it("restores an offline server vector and queues only a real local delta", () => {
    const server = new Y.Doc();
    const document = new Y.Doc();
    document.getText("source").insert(0, "Offline change");
    const session = new CollaborationSession(document, remoteOrigin);

    expect(session.restoreOffline(Y.encodeStateVector(server))).toBe(true);
    expect(session.pendingCount).toBe(1);
    expect(session.restoreOffline(Y.encodeStateVector(document))).toBe(false);
    expect(session.serverStateVector).toEqual(Y.encodeStateVector(document));
  });
});
