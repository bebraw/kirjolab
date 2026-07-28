import * as Y from "yjs";
import * as v from "valibot";
import { resolveWorkspaceSnapshotAnchors } from "../domain/workspace-anchor-projection";
import { isWorkspaceSnapshot, type WorkspaceSnapshot } from "../domain/workspace";
import type { AppToast } from "./app-toast";
import { DebouncedAsyncQueue } from "./collaboration";
import type { CollaborationSession } from "./collaboration-session";
import { clearOfflineShellCaches } from "./offline-service-worker";

const databaseName = "kirjolab-offline-v1";
const databaseVersion = 1;
const workspaceStoreName = "workspaces";
const schemaVersion = 1 as const;
const maximumYjsStateBytes = 16 * 1024 * 1024;

const boundedStateBufferSchema = v.pipe(
  v.instance(ArrayBuffer),
  v.check((value) => value.byteLength <= maximumYjsStateBytes),
);
const offlineWorkspaceRecordSchema = v.object({
  schemaVersion: v.literal(schemaVersion),
  key: v.string(),
  identity: v.string(),
  workspaceId: v.string(),
  snapshot: v.unknown(),
  documentUpdate: boundedStateBufferSchema,
  serverStateVector: boundedStateBufferSchema,
  savedAt: v.string(),
});

export type OfflineWorkspaceRecord = Readonly<v.InferOutput<typeof offlineWorkspaceRecordSchema>>;

export interface OfflineWorkspaceRepository {
  read(key: string): Promise<unknown>;
  write(record: OfflineWorkspaceRecord): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface RestoredOfflineWorkspace {
  readonly savedAt: string;
  readonly serverStateVector: Uint8Array;
  readonly snapshot: WorkspaceSnapshot;
}

export class OfflineWorkspaceStore {
  readonly #repository: OfflineWorkspaceRepository;
  readonly #identity: string;
  readonly #workspaceId: string;
  readonly #key: string;

  constructor(repository: OfflineWorkspaceRepository, identity: string, workspaceId: string) {
    this.#repository = repository;
    this.#identity = identity;
    this.#workspaceId = workspaceId;
    this.#key = offlineWorkspaceKey(identity, workspaceId);
  }

  async load(): Promise<OfflineWorkspaceRecord | null> {
    const value = await this.#repository.read(this.#key);
    return isOfflineWorkspaceRecord(value, this.#key, this.#identity, this.#workspaceId) ? copyRecord(value) : null;
  }

  async save(snapshot: unknown, documentUpdate: Uint8Array, serverStateVector: Uint8Array): Promise<void> {
    if (documentUpdate.byteLength > maximumYjsStateBytes || serverStateVector.byteLength > maximumYjsStateBytes) {
      throw new Error("Offline manuscript state exceeds the 16 MiB browser limit");
    }
    await this.#repository.write({
      schemaVersion,
      key: this.#key,
      identity: this.#identity,
      workspaceId: this.#workspaceId,
      snapshot,
      documentUpdate: copyBytes(documentUpdate),
      serverStateVector: copyBytes(serverStateVector),
      savedAt: new Date().toISOString(),
    });
  }

  async clear(): Promise<void> {
    await this.#repository.delete(this.#key);
  }
}

export interface OfflineWorkspaceSessionOptions {
  readonly browser?: {
    readonly environment?: OfflineWorkspaceBrowserEnvironment;
    readonly logout: (EventTarget & { readonly href: string }) | null;
  };
  readonly collaboration: Pick<CollaborationSession, "document" | "offlineAvailable" | "origins" | "serverStateVector" | "synced">;
  readonly owners: {
    readonly editorStatus: { setSave(status: string): void };
    readonly projectFileDialog: { readonly project: WorkspaceSnapshot | null };
    readonly toast: Pick<AppToast, "show">;
  };
  readonly store: OfflineWorkspaceStore | null;
  readonly workspaceId: string;
}

export interface OfflineWorkspaceBrowserEnvironment {
  readonly cacheStorage: CacheStorage | undefined;
  readonly databaseFactory: IDBFactory | undefined;
  readonly events: EventTarget;
  readonly navigate: (href: string) => void;
}

interface OfflineWorkspaceBrowserBinding extends OfflineWorkspaceBrowserEnvironment {
  readonly logout: (EventTarget & { readonly href: string }) | null;
  readonly notices: Pick<AppToast, "show">;
}

export class OfflineWorkspaceSession {
  readonly #saves: DebouncedAsyncQueue;
  #browserBinding: OfflineWorkspaceBrowserBinding | null = null;

  constructor(private readonly options: OfflineWorkspaceSessionOptions) {
    const { collaboration, owners } = options;
    this.#saves = new DebouncedAsyncQueue(
      () => this.persist(),
      (version) => {
        Object.assign(document.body.dataset, { offlineCached: "true", offlineSavedAt: String(version) });
        if (!collaboration.synced) owners.editorStatus.setSave("Saved offline");
      },
      (error) => {
        if (!collaboration.synced) owners.editorStatus.setSave("Offline save failed");
        owners.toast.show(error instanceof Error ? error.message : "Could not save the manuscript offline");
      },
    );
    const browser = options.browser;
    if (browser) {
      const environment = browser.environment ?? browserOfflineWorkspaceEnvironment();
      this.#browserBinding = { ...environment, logout: browser.logout, notices: owners.toast };
      environment.events.addEventListener("pagehide", this.#handlePageHide);
      browser.logout?.addEventListener("click", this.#handleLogout);
    }
  }

  restore(): Promise<RestoredOfflineWorkspace | null> {
    const { collaboration, store, workspaceId } = this.options;
    return store
      ? restoreOfflineWorkspaceState(store, collaboration.document, collaboration.origins.offline, workspaceId)
      : Promise.resolve(null);
  }

  schedule(delay = 120): void {
    const { collaboration, owners, store } = this.options;
    if (!store || !owners.projectFileDialog.project || !collaboration.offlineAvailable) return;
    this.#saves.schedule(delay);
  }

  async persist(): Promise<void> {
    const { collaboration, owners, store } = this.options;
    const snapshot = owners.projectFileDialog.project;
    if (!store || !snapshot || !collaboration.offlineAvailable) return;
    await store.save(snapshot, Y.encodeStateAsUpdate(collaboration.document), collaboration.serverStateVector);
  }

  async clear(): Promise<void> {
    await this.options.store?.clear();
  }

  async clearBrowserData(factory: IDBFactory | undefined, storage: CacheStorage | undefined): Promise<void> {
    await this.#saves.flush();
    await Promise.all([clearAllOfflineWorkspaces(factory), clearOfflineShellCaches(storage)]);
  }

  unbindBrowserLifecycle(): void {
    const binding = this.#browserBinding;
    if (!binding) return;
    binding.events.removeEventListener("pagehide", this.#handlePageHide);
    binding.logout?.removeEventListener("click", this.#handleLogout);
    this.#browserBinding = null;
  }

  readonly #handlePageHide = (): void => this.schedule(0);

  readonly #handleLogout = (event: Event): void => {
    const binding = this.#browserBinding;
    if (!binding?.logout) return;
    event.preventDefault();
    const { href } = binding.logout;
    const { cacheStorage, databaseFactory, navigate } = binding;
    void this.clearBrowserData(databaseFactory, cacheStorage)
      .then(() => navigate(href))
      .catch((error: unknown) => binding.notices.show(error instanceof Error ? error.message : "Could not clear offline data"));
  };
}

export function createBrowserOfflineWorkspaceSession(
  identity: string,
  workspaceId: string,
  collaboration: OfflineWorkspaceSessionOptions["collaboration"],
  owners: OfflineWorkspaceSessionOptions["owners"],
): OfflineWorkspaceSession {
  return new OfflineWorkspaceSession({
    browser: { logout: document.querySelector<HTMLAnchorElement>("#log-out") },
    collaboration,
    owners,
    store: createOfflineWorkspaceStore(typeof indexedDB === "undefined" ? undefined : indexedDB, identity, workspaceId),
    workspaceId,
  });
}

function browserOfflineWorkspaceEnvironment(): OfflineWorkspaceBrowserEnvironment {
  return {
    cacheStorage: typeof caches === "undefined" ? undefined : caches,
    databaseFactory: typeof indexedDB === "undefined" ? undefined : indexedDB,
    events: window,
    navigate: (href) => location.assign(href),
  };
}

export function createOfflineWorkspaceStore(
  factory: IDBFactory | undefined,
  identity: string,
  workspaceId: string,
): OfflineWorkspaceStore | null {
  return factory ? new OfflineWorkspaceStore(new IndexedDbWorkspaceRepository(factory), identity, workspaceId) : null;
}

export async function restoreOfflineWorkspaceState(
  store: OfflineWorkspaceStore,
  document: Y.Doc,
  origin: unknown,
  workspaceId: string,
): Promise<RestoredOfflineWorkspace | null> {
  let record: OfflineWorkspaceRecord | null;
  try {
    record = await store.load();
  } catch {
    return null;
  }
  if (!record) return null;
  if (!isWorkspaceSnapshot(record.snapshot) || record.snapshot.id !== workspaceId) {
    await store.clear();
    return null;
  }
  try {
    const serverStateVector = new Uint8Array(record.serverStateVector);
    Y.decodeStateVector(serverStateVector);
    Y.applyUpdate(document, new Uint8Array(record.documentUpdate), origin);
    return {
      savedAt: record.savedAt,
      serverStateVector,
      snapshot: resolveWorkspaceSnapshotAnchors(document, record.snapshot),
    };
  } catch {
    await store.clear();
    return null;
  }
}

export async function clearAllOfflineWorkspaces(factory: IDBFactory | undefined): Promise<void> {
  if (!factory) return;
  await new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not clear offline manuscripts"));
    request.onblocked = () => reject(new Error("Close other Kirjolab tabs before logging out"));
  });
}

export function offlineDocumentDelta(document: Y.Doc, serverStateVector: Uint8Array): Uint8Array | null {
  const currentStateVector = Y.encodeStateVector(document);
  return bytesEqual(currentStateVector, serverStateVector) ? null : Y.encodeStateAsUpdate(document, serverStateVector);
}

function offlineWorkspaceKey(identity: string, workspaceId: string): string {
  return `${identity}\u0000${workspaceId}`;
}

function isOfflineWorkspaceRecord(value: unknown, key: string, identity: string, workspaceId: string): value is OfflineWorkspaceRecord {
  return v.is(offlineWorkspaceRecordSchema, value) && value.key === key && value.identity === identity && value.workspaceId === workspaceId;
}

function copyRecord(record: OfflineWorkspaceRecord): OfflineWorkspaceRecord {
  return {
    ...record,
    documentUpdate: record.documentUpdate.slice(0),
    serverStateVector: record.serverStateVector.slice(0),
  };
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

class IndexedDbWorkspaceRepository implements OfflineWorkspaceRepository {
  readonly #factory: IDBFactory;

  constructor(factory: IDBFactory) {
    this.#factory = factory;
  }

  async read(key: string): Promise<unknown> {
    const database = await openDatabase(this.#factory);
    try {
      const transaction = database.transaction(workspaceStoreName, "readonly");
      const value = await requestResult(transaction.objectStore(workspaceStoreName).get(key));
      await transactionComplete(transaction);
      return value;
    } finally {
      database.close();
    }
  }

  async write(record: OfflineWorkspaceRecord): Promise<void> {
    const database = await openDatabase(this.#factory);
    try {
      const transaction = database.transaction(workspaceStoreName, "readwrite");
      transaction.objectStore(workspaceStoreName).put(record);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }

  async delete(key: string): Promise<void> {
    const database = await openDatabase(this.#factory);
    try {
      const transaction = database.transaction(workspaceStoreName, "readwrite");
      transaction.objectStore(workspaceStoreName).delete(key);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }
}

async function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(workspaceStoreName)) {
        request.result.createObjectStore(workspaceStoreName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline manuscript storage"));
    request.onblocked = () => reject(new Error("Offline manuscript storage is blocked by another tab"));
  });
}

async function requestResult(request: IDBRequest): Promise<unknown> {
  return await new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read offline manuscript"));
  });
}

async function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not update offline manuscript"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline manuscript update was aborted"));
  });
}
