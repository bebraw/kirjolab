import * as Y from "yjs";
import { PendingUpdateQueue } from "./collaboration";
import {
  collaborationCanEdit,
  collaborationStable,
  collaborationStatus,
  collaborationSynced,
  createCollaborationWorkflowActor,
  type CollaborationWorkflowSnapshot,
} from "./collaboration-workflow-machine";
import { offlineDocumentDelta } from "./offline-workspace";

export class CollaborationSession {
  readonly #document: Y.Doc;
  readonly #remoteOrigin: unknown;
  readonly #pendingUpdates = new PendingUpdateQueue();
  readonly #workflow = createCollaborationWorkflowActor();
  #serverDocument: Y.Doc | null = null;
  #serverStateVector: Uint8Array;

  constructor(document: Y.Doc, remoteOrigin: unknown) {
    this.#document = document;
    this.#remoteOrigin = remoteOrigin;
    this.#serverStateVector = Y.encodeStateVector(document);
  }

  private get snapshot(): CollaborationWorkflowSnapshot {
    return this.#workflow.getSnapshot();
  }

  get synced(): boolean {
    return collaborationSynced(this.snapshot);
  }

  get stable(): boolean {
    return collaborationStable(this.snapshot);
  }

  get canEdit(): boolean {
    return collaborationCanEdit(this.snapshot);
  }

  get offlineAvailable(): boolean {
    return this.snapshot.context.offlineAvailable;
  }

  get status(): { readonly label: string; readonly connected: boolean } {
    return collaborationStatus(this.snapshot);
  }

  get pendingCount(): number {
    return this.#pendingUpdates.size;
  }

  get serverStateVector(): Uint8Array {
    return this.#serverStateVector.slice();
  }

  connect(online: boolean): void {
    this.#workflow.send({ type: "CONNECT", online });
  }

  beginSocket(): void {
    this.#serverDocument?.destroy();
    this.#serverDocument = new Y.Doc();
    this.#pendingUpdates.resetForReconnect();
    this.syncQueue();
  }

  socketOpened(): void {
    this.#workflow.send({ type: "SOCKET_OPEN" });
  }

  socketClosed(online: boolean): void {
    this.#pendingUpdates.resetForReconnect();
    this.syncQueue();
    this.#workflow.send({ type: "SOCKET_CLOSED", online });
  }

  reconnect(): void {
    this.#workflow.send({ type: "RECONNECT" });
  }

  goOffline(): void {
    this.#workflow.send({ type: "OFFLINE" });
  }

  setOfflineAvailable(available: boolean): void {
    this.#workflow.send({ type: "OFFLINE_AVAILABLE", available });
  }

  setPresence(collaborators: number): void {
    this.#workflow.send({ type: "PRESENCE", collaborators });
  }

  observeRevision(): void {
    this.#workflow.send({ type: "REVISION" });
  }

  reset(): void {
    this.#workflow.send({ type: "RESET" });
  }

  enqueue(update: Uint8Array): void {
    this.#pendingUpdates.enqueue(update);
    this.syncQueue();
  }

  restoreOffline(serverStateVector: Uint8Array): boolean {
    this.#serverStateVector = serverStateVector.slice();
    const pending = offlineDocumentDelta(this.#document, this.#serverStateVector);
    if (pending) this.enqueue(pending);
    return pending !== null;
  }

  applyRemoteUpdate(message: ArrayBuffer): void {
    if (this.synced) this.#workflow.send({ type: "REMOTE_UPDATE" });
    const update = new Uint8Array(message);
    if (this.#serverDocument) {
      Y.applyUpdate(this.#serverDocument, update, this.#remoteOrigin);
      this.#serverStateVector = Y.encodeStateVector(this.#serverDocument);
    }
    Y.applyUpdate(this.#document, update, this.#remoteOrigin);
  }

  synchronize(): boolean {
    if (this.synced) return false;
    this.#workflow.send({ type: "SYNC" });
    if (this.#serverDocument) this.#serverStateVector = Y.encodeStateVector(this.#serverDocument);
    return true;
  }

  acknowledge(): boolean {
    try {
      const acknowledged = this.#pendingUpdates.acknowledge();
      if (this.#serverDocument) {
        Y.applyUpdate(this.#serverDocument, new Uint8Array(acknowledged.payload), this.#remoteOrigin);
        this.#serverStateVector = Y.encodeStateVector(this.#serverDocument);
      }
    } catch {
      return false;
    }
    this.syncQueue();
    return true;
  }

  flush(send: (payload: ArrayBuffer) => void): void {
    if (!this.synced) return;
    for (let update = this.#pendingUpdates.nextUnsent(); update; update = this.#pendingUpdates.nextUnsent()) {
      send(update.payload);
      this.#pendingUpdates.markSent(update.sequence);
    }
  }

  private syncQueue(): void {
    this.#workflow.send({ type: "QUEUE_CHANGED", pendingUpdates: this.#pendingUpdates.size });
  }
}
