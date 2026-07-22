import { assertEvent, assign, createActor, setup, type ActorRefFrom, type SnapshotFrom } from "xstate";

interface CollaborationWorkflowContext {
  readonly pendingUpdates: number;
  readonly awaitingRemoteRevision: boolean;
  readonly offlineAvailable: boolean;
  readonly collaborators: number | null;
}

type CollaborationWorkflowEvent =
  | { readonly type: "CONNECT"; readonly online: boolean }
  | { readonly type: "SOCKET_OPEN" }
  | { readonly type: "SYNC" }
  | { readonly type: "REMOTE_UPDATE" }
  | { readonly type: "REVISION" }
  | { readonly type: "QUEUE_CHANGED"; readonly pendingUpdates: number }
  | { readonly type: "OFFLINE_AVAILABLE"; readonly available: boolean }
  | { readonly type: "PRESENCE"; readonly collaborators: number }
  | { readonly type: "SOCKET_CLOSED"; readonly online: boolean }
  | { readonly type: "RECONNECT" }
  | { readonly type: "OFFLINE" }
  | { readonly type: "RESET" };

const initialContext: CollaborationWorkflowContext = {
  pendingUpdates: 0,
  awaitingRemoteRevision: false,
  offlineAvailable: false,
  collaborators: null,
};

const collaborationWorkflowMachine = setup({
  types: {
    context: {} as CollaborationWorkflowContext,
    events: {} as CollaborationWorkflowEvent,
  },
  actions: {
    updateQueue: assign(({ event }) => {
      assertEvent(event, "QUEUE_CHANGED");
      return { pendingUpdates: Math.max(0, event.pendingUpdates) };
    }),
    updateOfflineAvailability: assign(({ event }) => {
      assertEvent(event, "OFFLINE_AVAILABLE");
      return { offlineAvailable: event.available };
    }),
    markSynced: assign({ awaitingRemoteRevision: false, offlineAvailable: true, collaborators: null }),
    awaitRevision: assign({ awaitingRemoteRevision: true }),
    resolveRevision: assign({ awaitingRemoteRevision: false }),
    updatePresence: assign(({ event }) => {
      assertEvent(event, "PRESENCE");
      return { collaborators: event.collaborators };
    }),
    disconnect: assign({ awaitingRemoteRevision: false, collaborators: null }),
    reset: assign(({ context }) => ({
      pendingUpdates: context.pendingUpdates,
      awaitingRemoteRevision: false,
      offlineAvailable: false,
      collaborators: null,
    })),
  },
  guards: {
    isOnline: ({ event }) => {
      assertEvent(event, ["CONNECT", "SOCKET_CLOSED"]);
      return event.online;
    },
  },
}).createMachine({
  id: "collaborationWorkflow",
  initial: "disconnected",
  context: initialContext,
  on: {
    QUEUE_CHANGED: { actions: "updateQueue" },
    OFFLINE_AVAILABLE: { actions: "updateOfflineAvailability" },
    OFFLINE: { target: ".offline", actions: "disconnect" },
    RESET: { target: ".resetting", actions: "reset" },
  },
  states: {
    disconnected: {
      on: {
        CONNECT: [{ guard: "isOnline", target: "connecting" }, { target: "offline" }],
      },
    },
    connecting: {
      on: {
        SOCKET_OPEN: { target: "synchronizing" },
        SOCKET_CLOSED: [
          { guard: "isOnline", target: "reconnecting", actions: "disconnect" },
          { target: "offline", actions: "disconnect" },
        ],
      },
    },
    synchronizing: {
      on: {
        SYNC: { target: "live", actions: "markSynced" },
        SOCKET_CLOSED: [
          { guard: "isOnline", target: "reconnecting", actions: "disconnect" },
          { target: "offline", actions: "disconnect" },
        ],
      },
    },
    live: {
      on: {
        REMOTE_UPDATE: { actions: "awaitRevision" },
        REVISION: { actions: "resolveRevision" },
        PRESENCE: { actions: "updatePresence" },
        SOCKET_CLOSED: [
          { guard: "isOnline", target: "reconnecting", actions: "disconnect" },
          { target: "offline", actions: "disconnect" },
        ],
      },
    },
    reconnecting: {
      on: {
        RECONNECT: { target: "connecting" },
        CONNECT: [{ guard: "isOnline", target: "connecting" }, { target: "offline" }],
      },
    },
    offline: {
      on: {
        CONNECT: [{ guard: "isOnline", target: "connecting" }, { target: "offline" }],
      },
    },
    resetting: {},
  },
});

export type CollaborationWorkflowActor = ActorRefFrom<typeof collaborationWorkflowMachine>;
export type CollaborationWorkflowSnapshot = SnapshotFrom<typeof collaborationWorkflowMachine>;

export function createCollaborationWorkflowActor(): CollaborationWorkflowActor {
  return createActor(collaborationWorkflowMachine).start();
}

export function collaborationSynced(snapshot: CollaborationWorkflowSnapshot): boolean {
  return snapshot.matches("live");
}

export function collaborationStable(snapshot: CollaborationWorkflowSnapshot): boolean {
  return collaborationSynced(snapshot) && snapshot.context.pendingUpdates === 0 && !snapshot.context.awaitingRemoteRevision;
}

export function collaborationCanEdit(snapshot: CollaborationWorkflowSnapshot): boolean {
  return collaborationSynced(snapshot) || snapshot.context.offlineAvailable;
}

export function collaborationStatus(snapshot: CollaborationWorkflowSnapshot): { readonly label: string; readonly connected: boolean } {
  if (snapshot.matches("live")) {
    const count = snapshot.context.collaborators;
    return {
      label: count === null ? "Live" : `Live · ${count} ${count === 1 ? "writer" : "writers"}`,
      connected: true,
    };
  }
  if (snapshot.matches("synchronizing")) return { label: "Synchronizing", connected: false };
  if (snapshot.matches("connecting")) return { label: "Connecting", connected: false };
  if (snapshot.matches("reconnecting")) return { label: "Reconnecting", connected: false };
  if (snapshot.matches("resetting")) return { label: "Resetting", connected: false };
  return { label: "Offline · changes stay on this device", connected: false };
}
