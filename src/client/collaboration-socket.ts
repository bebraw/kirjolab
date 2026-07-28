import {
  collaborationProtocolVersion,
  encodeClientSelectionMessage,
  parseServerCollaborationMessage,
  type ServerCollaborationMessage,
} from "../domain/collaboration";
import type * as Y from "yjs";
import type { CollaborationSession } from "./collaboration-session";
import type { ConnectionStatus, ConnectionWorkflowOwners } from "./connection-status";

export interface CollaborationSelectionState {
  readonly fileId: string;
  readonly start: number;
  readonly end: number;
  readonly revision: number;
}

export interface CollaborationSocketOwners extends ConnectionWorkflowOwners {
  readonly collaboratorSelections: {
    clear(): void;
    receive(selection: Extract<ServerCollaborationMessage, { readonly type: "selection" }>): void;
    removeSelection(collaboratorId: string): void;
  };
  readonly connectionStatus: Pick<ConnectionStatus, "bindWorkflow" | "presentWorkflow">;
  readonly editorStatus: { preserveSelections(): () => void; setSave(status: string): void };
  readonly projectFileDialog: { readonly activeFileId: string | null };
  readonly projectHistoryTrigger: { readonly value: number; observeRevision(revision: number): void };
  readonly toast: { show(message: string): void };
}

export interface CollaborationOfflineOwner {
  clear(): Promise<void>;
  schedule(): void;
}

export interface CollaborationRefreshOwner {
  request(): Promise<void>;
}

export interface CollaborationSocketEnvironment {
  readonly browserEvents?: EventTarget;
  readonly clearTimer: (timer: number | undefined) => void;
  readonly createSocket: (url: string) => CollaborationWebSocket;
  readonly online: () => boolean;
  readonly reload: () => void;
  readonly setTimer: (callback: () => void, delay: number) => number;
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
  readonly #socketUrl: string;
  readonly #offline: CollaborationOfflineOwner;
  readonly #refresh: CollaborationRefreshOwner;
  readonly #owners: CollaborationSocketOwners;
  readonly #environment: CollaborationSocketEnvironment;
  #socket: CollaborationWebSocket | null = null;
  #reconnectTimer: number | undefined;
  #selectionTimer: number | undefined;
  #releaseDocument: () => void = () => undefined;

  constructor(
    session: CollaborationSession,
    socketUrl: string,
    offline: CollaborationOfflineOwner,
    refresh: CollaborationRefreshOwner,
    owners: CollaborationSocketOwners,
    environment: CollaborationSocketEnvironment = browserEnvironment,
  ) {
    this.#session = session;
    this.#socketUrl = socketUrl;
    this.#offline = offline;
    this.#refresh = refresh;
    this.#owners = owners;
    this.#environment = environment;
    owners.connectionStatus.bindWorkflow(session, owners);
    environment.browserEvents?.addEventListener("online", this.#handleOnline);
    environment.browserEvents?.addEventListener("offline", this.#handleOffline);
  }

  connect(): void {
    if (this.#socket && this.#socket.readyState < socketClosing) return;
    if (!this.#environment.online()) {
      this.#session.connect(false);
      this.#owners.connectionStatus.presentWorkflow();
      return;
    }
    this.#environment.clearTimer(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
    this.#session.connect(true);
    this.#owners.connectionStatus.presentWorkflow();
    this.#session.beginSocket();
    const socket = this.#environment.createSocket(this.#socketUrl);
    socket.binaryType = "arraybuffer";
    this.#socket = socket;
    socket.addEventListener("open", () => this.#open(socket));
    socket.addEventListener("message", (event) => this.#message(socket, (event as MessageEvent<string | ArrayBuffer>).data));
    socket.addEventListener("close", () => this.#close(socket));
    socket.addEventListener("error", () => socket.close());
  }

  bindDocument(documentModel: Y.Doc, offlineOrigin: unknown): void {
    this.#releaseDocument();
    const update = (value: Uint8Array, origin: unknown): void => {
      this.#offline.schedule();
      if (!this.#session.enqueueLocal(value, origin, offlineOrigin)) return;
      this.#owners.editorStatus.setSave(this.#session.synced ? "Saving…" : "Saving offline…");
      this.#owners.assistantGenerationPresenter.refreshAvailability();
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
    this.#owners.connectionStatus.presentWorkflow();
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
      const selection = this.#selection();
      if (!this.#session.synced || !socket || socket.readyState !== socketOpen || !selection) return;
      socket.send(encodeClientSelectionMessage({ type: "selection", protocol: collaborationProtocolVersion, ...selection }));
    }, 80);
  }

  #open(socket: CollaborationWebSocket): void {
    if (this.#socket !== socket) return;
    this.#session.socketOpened();
    this.#owners.connectionStatus.presentWorkflow();
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
    if (this.#control(socket, value)) this.#owners.connectionStatus.presentWorkflow();
  }

  #update(socket: CollaborationWebSocket, message: ArrayBuffer): void {
    const restore = this.#owners.editorStatus.preserveSelections();
    try {
      this.#session.applyRemoteUpdate(message);
    } catch {
      socket.close(1007, "Invalid collaboration update");
      return;
    }
    restore();
    this.#owners.assistantGenerationPresenter.refreshAvailability();
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
        this.#owners.projectHistoryTrigger.observeRevision(value.revision);
        break;
      case "reset":
        this.#reset(socket);
        return false;
      case "presence":
        this.#session.setPresence(value.collaborators);
        break;
      case "selection":
        this.#owners.collaboratorSelections.receive(value);
        break;
      case "selection-clear":
        this.#owners.collaboratorSelections.removeSelection(value.collaboratorId);
        break;
      case "resources":
        void this.#refresh.request().catch((error: unknown) => {
          this.#owners.toast.show(error instanceof Error ? error.message : "Could not refresh project resources");
        });
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
    this.#owners.projectHistoryTrigger.observeRevision(revision);
    this.#owners.editorStatus.setSave(this.#session.pendingCount === 0 ? "Saved" : "Saving…");
    this.flush();
  }

  #reset(socket: CollaborationWebSocket): void {
    this.#session.reset();
    void this.#offline.clear().finally(() => {
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
    this.#owners.collaboratorSelections.clear();
    this.#owners.connectionStatus.presentWorkflow();
    if (!online) return;
    this.#reconnectTimer ??= this.#environment.setTimer(() => {
      this.#reconnectTimer = undefined;
      this.#session.reconnect();
      this.connect();
    }, 1_200);
  }

  readonly #handleOnline = (): void => this.connect();
  readonly #handleOffline = (): void => this.goOffline();

  #selection(): CollaborationSelectionState | null {
    const fileId = this.#owners.projectFileDialog.activeFileId;
    return fileId
      ? {
          fileId,
          start: this.#owners.source.selectionStart,
          end: this.#owners.source.selectionEnd,
          revision: this.#owners.projectHistoryTrigger.value,
        }
      : null;
  }
}
