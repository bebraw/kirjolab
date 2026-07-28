import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { collaborationProtocolVersion, encodeServerCollaborationMessage, parseClientSelectionMessage } from "../domain/collaboration";
import { CollaborationSession } from "./collaboration-session";
import {
  CollaborationSocket,
  type CollaborationSocketCallbacks,
  type CollaborationSocketEnvironment,
  type CollaborationWebSocket,
} from "./collaboration-socket";

const remoteOrigin = Symbol("remote");

class TestSocket extends EventTarget implements CollaborationWebSocket {
  binaryType: BinaryType = "blob";
  readyState = 0;
  readonly closes: Array<{ code?: number; reason?: string }> = [];
  readonly sent: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];

  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }

  message(data: string | ArrayBuffer): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  close(code?: number, reason?: string): void {
    this.closes.push({ ...(code === undefined ? {} : { code }), ...(reason === undefined ? {} : { reason }) });
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.sent.push(data);
  }
}

function createHarness(online = true): {
  readonly callbacks: CollaborationSocketCallbacks;
  readonly document: Y.Doc;
  readonly environment: CollaborationSocketEnvironment;
  readonly events: string[];
  readonly runTimer: (delay: number) => void;
  readonly session: CollaborationSession;
  readonly sockets: TestSocket[];
} {
  const document = new Y.Doc();
  const session = new CollaborationSession(document, remoteOrigin);
  const sockets: TestSocket[] = [];
  const events: string[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let nextTimer = 1;
  let connected = online;
  const environment: CollaborationSocketEnvironment = {
    clearTimer: (timer) => {
      if (timer !== undefined) timers.delete(timer);
    },
    createSocket: () => {
      const socket = new TestSocket();
      sockets.push(socket);
      return socket;
    },
    online: () => connected,
    reload: () => events.push("reload"),
    setTimer: (callback, delay) => {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
  };
  const callbacks: CollaborationSocketCallbacks = {
    beforeRemoteUpdate: () => {
      events.push("before-update");
      return () => events.push("restore-selection");
    },
    clearOffline: async () => {
      events.push("clear-offline");
    },
    connectionChanged: () => events.push(`connection:${session.status.label}`),
    disconnected: () => events.push("disconnected"),
    remoteUpdateApplied: () => events.push("remote-update"),
    resourcesChanged: () => events.push("resources"),
    revisionCompleted: (revision) => events.push(`complete:${revision}:${session.pendingCount}`),
    revisionObserved: (revision) => events.push(`revision:${revision}`),
    selection: () => ({ fileId: "main", start: 2, end: 4, revision: 3 }),
    selectionCleared: (id) => events.push(`selection-clear:${id}`),
    selectionReceived: ({ collaboratorId }) => events.push(`selection:${collaboratorId}`),
    socketUrl: "wss://example.test/api/workspaces/project/socket",
  };
  return {
    callbacks,
    document,
    environment,
    events,
    runTimer: (delay) => {
      const timer = [...timers.entries()].find(([, value]) => value.delay === delay);
      if (!timer) throw new Error(`Timer ${delay} is unavailable`);
      timers.delete(timer[0]);
      timer[1].callback();
    },
    session,
    sockets,
  };
}

describe("collaboration socket", () => {
  it("owns socket lifecycle, protocol routing, queue flush, and selection debounce", () => {
    const harness = createHarness();
    const connection = new CollaborationSocket(harness.session, harness.callbacks, harness.environment);
    connection.connect();
    const socket = harness.sockets[0];
    expect(socket?.binaryType).toBe("arraybuffer");
    socket?.open();
    socket?.message(encodeServerCollaborationMessage({ type: "sync", protocol: collaborationProtocolVersion, revision: 1 }));

    const local = new Y.Doc();
    local.getText("source").insert(0, "local");
    harness.session.enqueue(Y.encodeStateAsUpdate(local));
    connection.flush();
    socket?.message(encodeServerCollaborationMessage({ type: "ack", revision: 2 }));
    socket?.message(encodeServerCollaborationMessage({ type: "revision", revision: 3 }));
    socket?.message(encodeServerCollaborationMessage({ type: "presence", collaborators: 2 }));
    socket?.message(
      encodeServerCollaborationMessage({
        type: "selection",
        collaboratorId: "writer-2",
        fileId: "main",
        start: 1,
        end: 2,
        revision: 3,
      }),
    );
    socket?.message(encodeServerCollaborationMessage({ type: "selection-clear", collaboratorId: "writer-2" }));
    socket?.message(encodeServerCollaborationMessage({ type: "resources" }));

    const remote = new Y.Doc();
    remote.getText("source").insert(0, "remote");
    socket?.message(Y.encodeStateAsUpdate(remote).buffer as ArrayBuffer);
    connection.scheduleSelection();
    harness.runTimer(80);

    expect(socket?.sent.some((value) => value instanceof ArrayBuffer)).toBe(true);
    expect(parseClientSelectionMessage(String(socket?.sent.at(-1)))).toEqual({
      type: "selection",
      protocol: collaborationProtocolVersion,
      fileId: "main",
      start: 2,
      end: 4,
      revision: 3,
    });
    expect(harness.events).toContain("complete:1:0");
    expect(harness.events).toContain("complete:2:0");
    expect(harness.events).toContain("revision:3");
    expect(harness.events).toContain("selection:writer-2");
    expect(harness.events).toContain("selection-clear:writer-2");
    expect(harness.events).toContain("resources");
    expect(harness.events.slice(-3)).toEqual(["before-update", "restore-selection", "remote-update"]);
  });

  it("closes invalid frames and reconnects only while online", () => {
    const harness = createHarness();
    const connection = new CollaborationSocket(harness.session, harness.callbacks, harness.environment);
    connection.connect();
    const first = harness.sockets[0];
    first?.open();
    first?.message("invalid");
    expect(first?.closes).toContainEqual({ code: 1002, reason: "Invalid collaboration control" });
    harness.runTimer(1_200);
    expect(harness.sockets).toHaveLength(2);

    const second = harness.sockets[1];
    second?.open();
    second?.message(new Uint8Array([255]).buffer);
    expect(second?.closes).toContainEqual({ code: 1007, reason: "Invalid collaboration update" });
    expect(harness.events).toContain("disconnected");
  });

  it("stays offline without a socket and reloads after reset cleanup", async () => {
    const offline = createHarness(false);
    const offlineConnection = new CollaborationSocket(offline.session, offline.callbacks, offline.environment);
    offlineConnection.connect();
    offlineConnection.goOffline();
    expect(offline.sockets).toHaveLength(0);
    expect(offline.events.at(-1)).toContain("Offline");

    const harness = createHarness();
    const clearOffline = vi.spyOn(harness.callbacks, "clearOffline");
    const connection = new CollaborationSocket(harness.session, harness.callbacks, harness.environment);
    connection.connect();
    const socket = harness.sockets[0];
    socket?.open();
    socket?.message(encodeServerCollaborationMessage({ type: "reset", revision: 4 }));
    await Promise.resolve();
    await Promise.resolve();

    expect(clearOffline).toHaveBeenCalledOnce();
    expect(socket?.closes).toContainEqual({ code: 1000, reason: "Workspace reset" });
    expect(harness.events).toContain("reload");
  });

  it("owns online and offline browser lifecycle triggers", () => {
    const harness = createHarness();
    const browserEvents = new EventTarget();
    const connection = new CollaborationSocket(harness.session, harness.callbacks, {
      ...harness.environment,
      browserEvents,
    });
    const connect = vi.spyOn(connection, "connect");
    const goOffline = vi.spyOn(connection, "goOffline");
    connection.bindBrowserLifecycle();

    browserEvents.dispatchEvent(new Event("online"));
    browserEvents.dispatchEvent(new Event("offline"));
    expect(connect).toHaveBeenCalledOnce();
    expect(goOffline).toHaveBeenCalledOnce();

    connection.unbindBrowserLifecycle();
    browserEvents.dispatchEvent(new Event("online"));
    browserEvents.dispatchEvent(new Event("offline"));
    expect(connect).toHaveBeenCalledOnce();
    expect(goOffline).toHaveBeenCalledOnce();
  });
});
