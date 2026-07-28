import {
  collaborationProtocolVersion,
  encodeClientSelectionMessage,
  parseServerCollaborationMessage,
  type ServerCollaborationMessage,
} from "../domain/collaboration";
import type * as Y from "yjs";
import type { CollaborationSession } from "./collaboration-session";

export interface CollaborationSelectionState {
  readonly fileId: string;
  readonly start: number;
  readonly end: number;
  readonly revision: number;
}

export interface CollaborationSocketCallbacks {
  readonly beforeRemoteUpdate: () => () => void;
  readonly clearOffline: () => Promise<void>;
  readonly connectionChanged: () => void;
  readonly disconnected: () => void;
  readonly documentUpdated: () => void;
  readonly resourcesChanged: () => void;
  readonly revisionCompleted: (revision: number) => void;
  readonly revisionObserved: (revision: number) => void;
  readonly selection: () => CollaborationSelectionState | null;
  readonly selectionCleared: (collaboratorId: string) => void;
  readonly selectionReceived: (selection: Extract<ServerCollaborationMessage, { readonly type: "selection" }>) => void;
  readonly socketUrl: string;
}

export interface CollaborationSocketEnvironment {
  readonly browserEvents?: EventTarget;
  readonly clearTimer: (timer: number | undefined) => void;
  readonly createSocket: (url: string) => CollaborationWebSocket;
  readonly online: () => boolean;
  readonly reload: () => void;
  readonly setTimer: (callback: () => void, delay: number) => number;
}

export interface CollaborationDocumentBinding {
  readonly offline: { schedule(): void };
  readonly offlineOrigin: unknown;
  readonly save: (status: string) => void;
}

export interface CollaborationWebSocket {
  binaryType: BinaryType;
  readonly readyState: number;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  close(code?: number, reason?: string): void;
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
}

const browserEnvironment: CollaborationSocketEnvironment = {
  ...(typeof window === "undefined" ? {} : { browserEvents: window }),
  clearTimer: (timer) => window.clearTimeout(timer),
  createSocket: (url) => new WebSocket(url),
  online: () => navigator.onLine,
  reload: () => window.location.reload(),
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
};
const socketOpen = 1;
const socketClosing = 2;

export class CollaborationSocket {
  readonly #session: CollaborationSession;
  readonly #callbacks: CollaborationSocketCallbacks;
  readonly #environment: CollaborationSocketEnvironment;
  #socket: CollaborationWebSocket | null = null;
  #reconnectTimer: number | undefined;
  #selectionTimer: number | undefined;
  #releaseDocument: () => void = () => undefined;

  constructor(
    session: CollaborationSession,
    callbacks: CollaborationSocketCallbacks,
    environment: CollaborationSocketEnvironment = browserEnvironment,
  ) {
    this.#session = session;
    this.#callbacks = callbacks;
    this.#environment = environment;
  }

  connect(): void {
    if (this.#socket && this.#socket.readyState < socketClosing) return;
    if (!this.#environment.online()) {
      this.#session.connect(false);
      this.#callbacks.connectionChanged();
      return;
    }
    this.#environment.clearTimer(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
    this.#session.connect(true);
    this.#callbacks.connectionChanged();
    this.#session.beginSocket();
    const socket = this.#environment.createSocket(this.#callbacks.socketUrl);
    socket.binaryType = "arraybuffer";
    this.#socket = socket;
    socket.addEventListener("open", () => this.#open(socket));
    socket.addEventListener("message", (event) => this.#message(socket, (event as MessageEvent<string | ArrayBuffer>).data));
    socket.addEventListener("close", () => this.#close(socket));
    socket.addEventListener("error", () => socket.close());
  }

  bindBrowserLifecycle(): void {
    const events = this.#environment.browserEvents;
    if (!events) return;
    this.unbindBrowserLifecycle();
    events.addEventListener("online", this.#handleOnline);
    events.addEventListener("offline", this.#handleOffline);
  }

  bindDocument(documentModel: Y.Doc, binding: CollaborationDocumentBinding): void {
    this.#releaseDocument();
    const update = (value: Uint8Array, origin: unknown): void => {
      binding.offline.schedule();
      if (!this.#session.enqueueLocal(value, origin, binding.offlineOrigin)) return;
      binding.save(this.#session.synced ? "Saving…" : "Saving offline…");
      this.#callbacks.documentUpdated();
      this.flush();
    };
    documentModel.on("update", update);
    this.#releaseDocument = () => documentModel.off("update", update);
  }

  unbindDocument(): void {
    this.#releaseDocument();
    this.#releaseDocument = () => undefined;
  }

  unbindBrowserLifecycle(): void {
    const events = this.#environment.browserEvents;
    if (!events) return;
    events.removeEventListener("online", this.#handleOnline);
    events.removeEventListener("offline", this.#handleOffline);
  }

  goOffline(): void {
    this.#session.goOffline();
    this.#callbacks.connectionChanged();
  }

  flush(): void {
    const socket = this.#socket;
    if (!socket || socket.readyState !== socketOpen) return;
    this.#session.flush((payload) => socket.send(payload));
  }

  scheduleSelection(): void {
    this.#environment.clearTimer(this.#selectionTimer);
    this.#selectionTimer = this.#environment.setTimer(() => {
      this.#selectionTimer = undefined;
      const socket = this.#socket;
      const selection = this.#callbacks.selection();
      if (!this.#session.synced || !socket || socket.readyState !== socketOpen || !selection) return;
      socket.send(encodeClientSelectionMessage({ type: "selection", protocol: collaborationProtocolVersion, ...selection }));
    }, 80);
  }

  #open(socket: CollaborationWebSocket): void {
    if (this.#socket !== socket) return;
    this.#session.socketOpened();
    this.#callbacks.connectionChanged();
  }

  #message(socket: CollaborationWebSocket, message: string | ArrayBuffer): void {
    if (this.#socket !== socket) return;
    if (typeof message !== "string") {
      this.#update(socket, message);
      return;
    }
    const value = parseServerCollaborationMessage(message);
    if (!value) {
      socket.close(1002, "Invalid collaboration control");
      return;
    }
    if (this.#control(socket, value)) this.#callbacks.connectionChanged();
  }

  #update(socket: CollaborationWebSocket, message: ArrayBuffer): void {
    const restore = this.#callbacks.beforeRemoteUpdate();
    try {
      this.#session.applyRemoteUpdate(message);
    } catch {
      socket.close(1007, "Invalid collaboration update");
      return;
    }
    restore();
    this.#callbacks.documentUpdated();
  }

  #control(socket: CollaborationWebSocket, value: ServerCollaborationMessage): boolean {
    switch (value.type) {
      case "sync":
        this.#synchronize(socket, value.revision);
        break;
      case "ack":
        this.#acknowledge(socket, value.revision);
        break;
      case "revision":
        this.#session.observeRevision();
        this.#callbacks.revisionObserved(value.revision);
        break;
      case "reset":
        this.#reset(socket);
        return false;
      case "presence":
        this.#session.setPresence(value.collaborators);
        break;
      case "selection":
        this.#callbacks.selectionReceived(value);
        break;
      case "selection-clear":
        this.#callbacks.selectionCleared(value.collaboratorId);
        break;
      case "resources":
        this.#callbacks.resourcesChanged();
        break;
    }
    return true;
  }

  #synchronize(socket: CollaborationWebSocket, revision: number): void {
    if (!this.#session.synchronize()) {
      socket.close(1002, "Duplicate collaboration sync");
      return;
    }
    this.#completeRevision(revision);
  }

  #acknowledge(socket: CollaborationWebSocket, revision: number): void {
    if (!this.#session.acknowledge()) {
      socket.close(1002, "Unexpected collaboration acknowledgement");
      return;
    }
    this.#completeRevision(revision);
  }

  #completeRevision(revision: number): void {
    this.#callbacks.revisionCompleted(revision);
    this.flush();
  }

  #reset(socket: CollaborationWebSocket): void {
    this.#session.reset();
    void this.#callbacks.clearOffline().finally(() => {
      if (socket.readyState >= socketClosing) {
        this.#environment.reload();
        return;
      }
      socket.addEventListener("close", () => this.#environment.reload(), { once: true });
      socket.close(1000, "Workspace reset");
    });
  }

  #close(socket: CollaborationWebSocket): void {
    if (this.#socket !== socket) return;
    this.#socket = null;
    const online = this.#environment.online();
    this.#session.socketClosed(online);
    this.#callbacks.disconnected();
    this.#callbacks.connectionChanged();
    if (!online) return;
    this.#reconnectTimer ??= this.#environment.setTimer(() => {
      this.#reconnectTimer = undefined;
      this.#session.reconnect();
      this.connect();
    }, 1_200);
  }

  readonly #handleOnline = (): void => this.connect();
  readonly #handleOffline = (): void => this.goOffline();
}
