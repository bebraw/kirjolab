import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  OfflineWorkspaceStore,
  clearAllOfflineWorkspaces,
  createOfflineWorkspaceStore,
  offlineDocumentDelta,
  type OfflineWorkspaceRecord,
  type OfflineWorkspaceRepository,
} from "./offline-workspace";

class MemoryRepository implements OfflineWorkspaceRepository {
  readonly records = new Map<string, OfflineWorkspaceRecord>();

  async read(key: string): Promise<unknown> {
    return this.records.get(key);
  }

  async write(record: OfflineWorkspaceRecord): Promise<void> {
    this.records.set(record.key, record);
  }

  async delete(key: string): Promise<void> {
    this.records.delete(key);
  }
}

class StaticRepository implements OfflineWorkspaceRepository {
  constructor(readonly value: unknown) {}

  async read(): Promise<unknown> {
    return this.value;
  }

  async write(): Promise<void> {}

  async delete(): Promise<void> {}
}

type RequestHandler = (() => void) | null;

interface IndexedDbHarnessOptions {
  readonly open?: "success" | "error" | "blocked";
  readonly request?: "success" | "error";
  readonly transaction?: "complete" | "error" | "abort";
  readonly deleteDatabase?: "success" | "error" | "blocked";
  readonly useNativeErrors?: boolean;
  readonly storeExists?: boolean;
  readonly upgrade?: boolean;
}

function createIndexedDbHarness(options: IndexedDbHarnessOptions = {}) {
  const records = new Map<string, OfflineWorkspaceRecord>();
  const nativeError = new Error("Native IndexedDB failure");
  let storeExists = options.storeExists ?? false;
  let closedDatabases = 0;
  let createdStores = 0;
  const transactionModes: string[] = [];
  const createdStoreOptions: Array<{ readonly name: string; readonly keyPath: string }> = [];

  const request = <T>(result: T, error: Error | null = null) => ({
    result,
    error,
    onsuccess: null as RequestHandler,
    onerror: null as RequestHandler,
    onblocked: null as RequestHandler,
    onupgradeneeded: null as RequestHandler,
  });

  const finishTransaction = (transaction: { oncomplete: RequestHandler; onerror: RequestHandler; onabort: RequestHandler }) => {
    setTimeout(() => {
      if (options.transaction === "error") transaction.onerror?.();
      else if (options.transaction === "abort") transaction.onabort?.();
      else transaction.oncomplete?.();
    }, 0);
  };

  const database = {
    objectStoreNames: { contains: () => storeExists },
    createObjectStore: (name: string, configuration: { keyPath: string }) => {
      storeExists = true;
      createdStores += 1;
      createdStoreOptions.push({ name, keyPath: configuration.keyPath });
    },
    transaction: (_name: string, mode: string) => {
      transactionModes.push(mode);
      const transaction = {
        error: options.useNativeErrors ? nativeError : null,
        oncomplete: null as RequestHandler,
        onerror: null as RequestHandler,
        onabort: null as RequestHandler,
        objectStore: () => ({
          get: (key: string) => {
            const getRequest = request(records.get(key), options.useNativeErrors ? nativeError : null);
            queueMicrotask(() => {
              if (options.request === "error") getRequest.onerror?.();
              else getRequest.onsuccess?.();
              finishTransaction(transaction);
            });
            return getRequest;
          },
          put: (record: OfflineWorkspaceRecord) => {
            records.set(record.key, record);
            finishTransaction(transaction);
          },
          delete: (key: string) => {
            records.delete(key);
            finishTransaction(transaction);
          },
        }),
      };
      return transaction;
    },
    close: () => {
      closedDatabases += 1;
    },
  };

  const factory = {
    open: () => {
      const openRequest = request(database, options.useNativeErrors ? nativeError : null);
      queueMicrotask(() => {
        if (options.open === "error") openRequest.onerror?.();
        else if (options.open === "blocked") openRequest.onblocked?.();
        else {
          if (!storeExists || options.upgrade) openRequest.onupgradeneeded?.();
          openRequest.onsuccess?.();
        }
      });
      return openRequest;
    },
    deleteDatabase: () => {
      const deleteRequest = request(undefined, options.useNativeErrors ? nativeError : null);
      queueMicrotask(() => {
        if (options.deleteDatabase === "error") deleteRequest.onerror?.();
        else if (options.deleteDatabase === "blocked") deleteRequest.onblocked?.();
        else deleteRequest.onsuccess?.();
      });
      return deleteRequest;
    },
  };

  return {
    factory,
    records,
    nativeError,
    transactionModes,
    createdStoreOptions,
    get closedDatabases() {
      return closedDatabases;
    },
    get createdStores() {
      return createdStores;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("offline workspace persistence", () => {
  it("round-trips isolated copied state and clears one project", async () => {
    const repository = new MemoryRepository();
    const store = new OfflineWorkspaceStore(repository, "writer@example.test", "paper-a");
    const documentUpdate = new Uint8Array([1, 2, 3]);
    const serverStateVector = new Uint8Array([4, 5]);
    const snapshot = { id: "paper-a", title: "Offline paper" };

    await store.save(snapshot, documentUpdate, serverStateVector);
    documentUpdate[0] = 9;
    serverStateVector[0] = 9;
    const loaded = await store.load();
    expect(loaded).toMatchObject({ identity: "writer@example.test", workspaceId: "paper-a", snapshot });
    expect(Array.from(new Uint8Array(loaded?.documentUpdate ?? new ArrayBuffer(0)))).toEqual([1, 2, 3]);
    expect(Array.from(new Uint8Array(loaded?.serverStateVector ?? new ArrayBuffer(0)))).toEqual([4, 5]);

    if (loaded) new Uint8Array(loaded.documentUpdate)[0] = 8;
    if (loaded) new Uint8Array(loaded.serverStateVector)[0] = 8;
    expect(Array.from(new Uint8Array((await store.load())?.documentUpdate ?? new ArrayBuffer(0)))).toEqual([1, 2, 3]);
    expect(Array.from(new Uint8Array((await store.load())?.serverStateVector ?? new ArrayBuffer(0)))).toEqual([4, 5]);
    await store.clear();
    await expect(store.load()).resolves.toBeNull();
  });

  it("rejects mismatched and oversized records", async () => {
    const repository = new MemoryRepository();
    const store = new OfflineWorkspaceStore(repository, "writer@example.test", "paper-a");
    await store.save({}, new Uint8Array([1]), new Uint8Array([2]));
    const [key, record] = [...repository.records.entries()][0] ?? [];
    expect(key).toBeDefined();
    expect(record).toBeDefined();
    if (!key || !record) throw new Error("Expected stored offline record");

    repository.records.set(key, { ...record, workspaceId: "paper-b" });
    await expect(store.load()).resolves.toBeNull();
    repository.records.set(key, { ...record, documentUpdate: new ArrayBuffer(16 * 1024 * 1024 + 1) });
    await expect(store.load()).resolves.toBeNull();
    await expect(store.save({}, new Uint8Array(16 * 1024 * 1024), new Uint8Array(16 * 1024 * 1024))).resolves.toBeUndefined();
    await expect(store.load()).resolves.not.toBeNull();
    await expect(store.save({}, new Uint8Array(16 * 1024 * 1024 + 1), new Uint8Array())).rejects.toThrow("16 MiB");
    await expect(store.save({}, new Uint8Array(), new Uint8Array(16 * 1024 * 1024 + 1))).rejects.toThrow("16 MiB");
  });

  it("rejects malformed persisted record fields", async () => {
    const repository = new MemoryRepository();
    const store = new OfflineWorkspaceStore(repository, "writer@example.test", "paper-a");
    await store.save({}, new Uint8Array([1]), new Uint8Array([2]));
    const record = [...repository.records.values()][0];
    if (!record) throw new Error("Expected stored offline record");
    const { snapshot: _snapshot, ...withoutSnapshot } = record;

    for (const invalid of [
      null,
      { ...record, schemaVersion: 2 },
      { ...record, key: "other" },
      { ...record, identity: "other" },
      { ...record, workspaceId: "other" },
      withoutSnapshot,
      { ...record, documentUpdate: new Uint8Array([1]) },
      { ...record, serverStateVector: new Uint8Array([2]) },
      { ...record, serverStateVector: new ArrayBuffer(16 * 1024 * 1024 + 1) },
      { ...record, savedAt: 1 },
    ]) {
      const invalidStore = new OfflineWorkspaceStore(new StaticRepository(invalid), "writer@example.test", "paper-a");
      await expect(invalidStore.load()).resolves.toBeNull();
    }
  });

  it("derives only Yjs changes absent from the acknowledged server state", () => {
    const server = new Y.Doc();
    server.getText("source").insert(0, "Shared");
    const local = new Y.Doc();
    Y.applyUpdate(local, Y.encodeStateAsUpdate(server));
    const serverStateVector = Y.encodeStateVector(server);
    expect(offlineDocumentDelta(local, serverStateVector)).toBeNull();

    local.getText("source").insert(6, " offline");
    const delta = offlineDocumentDelta(local, serverStateVector);
    expect(delta).not.toBeNull();
    if (delta) Y.applyUpdate(server, delta);
    expect(server.getText("source").toString()).toBe("Shared offline");

    const vectorDocument = new Y.Doc();
    vectorDocument.clientID = 1;
    vectorDocument.getText("source").insert(0, "Local");
    const otherDocument = new Y.Doc();
    otherDocument.clientID = 2;
    otherDocument.getText("source").insert(0, "Other");
    const differentSameLengthVector = Y.encodeStateVector(otherDocument);
    expect(differentSameLengthVector.byteLength).toBe(Y.encodeStateVector(vectorDocument).byteLength);
    expect(offlineDocumentDelta(vectorDocument, differentSameLengthVector)).not.toBeNull();
    expect(offlineDocumentDelta(vectorDocument, Y.encodeStateVector(new Y.Doc()))).not.toBeNull();
  });

  it("degrades cleanly when IndexedDB is unavailable", async () => {
    expect(createOfflineWorkspaceStore(undefined, "writer", "paper")).toBeNull();
    await expect(clearAllOfflineWorkspaces(undefined)).resolves.toBeUndefined();
  });

  it("persists through IndexedDB and closes every opened database", async () => {
    const harness = createIndexedDbHarness();
    vi.stubGlobal("indexedDB", harness.factory);
    const store = createOfflineWorkspaceStore(indexedDB, "writer@example.test", "paper-a");
    if (!store) throw new Error("Expected IndexedDB-backed store");

    await store.save({ title: "Offline paper" }, new Uint8Array([1, 2]), new Uint8Array([3]));
    await expect(store.load()).resolves.toMatchObject({ identity: "writer@example.test", workspaceId: "paper-a" });
    await store.clear();
    await expect(store.load()).resolves.toBeNull();

    expect(harness.createdStores).toBe(1);
    expect(harness.createdStoreOptions).toEqual([{ name: "workspaces", keyPath: "key" }]);
    expect(harness.transactionModes).toEqual(["readwrite", "readonly", "readwrite", "readonly"]);
    expect(harness.closedDatabases).toBe(4);

    const existingSchema = createIndexedDbHarness({ storeExists: true, upgrade: true });
    vi.stubGlobal("indexedDB", existingSchema.factory);
    const existingStore = createOfflineWorkspaceStore(indexedDB, "writer@example.test", "paper-b");
    if (!existingStore) throw new Error("Expected IndexedDB-backed store");
    await existingStore.load();
    expect(existingSchema.createdStores).toBe(0);
  });

  it("reports IndexedDB open, request, and transaction failures", async () => {
    for (const [options, action, message] of [
      [{ open: "error" }, "load", "Could not open offline manuscript storage"],
      [{ open: "blocked" }, "load", "Offline manuscript storage is blocked by another tab"],
      [{ request: "error" }, "load", "Could not read offline manuscript"],
      [{ transaction: "error" }, "save", "Could not update offline manuscript"],
      [{ transaction: "abort" }, "save", "Offline manuscript update was aborted"],
    ] as const) {
      const harness = createIndexedDbHarness(options);
      vi.stubGlobal("indexedDB", harness.factory);
      const store = createOfflineWorkspaceStore(indexedDB, "writer@example.test", "paper-a");
      if (!store) throw new Error("Expected IndexedDB-backed store");
      const operation = action === "load" ? store.load() : store.save({}, new Uint8Array(), new Uint8Array());
      await expect(operation).rejects.toThrow(message);
    }

    const harness = createIndexedDbHarness({ request: "error", useNativeErrors: true });
    vi.stubGlobal("indexedDB", harness.factory);
    const store = createOfflineWorkspaceStore(indexedDB, "writer@example.test", "paper-a");
    if (!store) throw new Error("Expected IndexedDB-backed store");
    await expect(store.load()).rejects.toBe(harness.nativeError);
    expect(harness.closedDatabases).toBe(1);

    for (const options of [
      { open: "error", useNativeErrors: true },
      { transaction: "error", useNativeErrors: true },
      { transaction: "abort", useNativeErrors: true },
    ] as const) {
      const nativeFailure = createIndexedDbHarness(options);
      vi.stubGlobal("indexedDB", nativeFailure.factory);
      const nativeStore = createOfflineWorkspaceStore(indexedDB, "writer@example.test", "paper-a");
      if (!nativeStore) throw new Error("Expected IndexedDB-backed store");
      const operation = options.open === "error" ? nativeStore.load() : nativeStore.save({}, new Uint8Array(), new Uint8Array());
      await expect(operation).rejects.toBe(nativeFailure.nativeError);
    }
  });

  it("clears IndexedDB and reports deletion failures", async () => {
    const success = createIndexedDbHarness();
    vi.stubGlobal("indexedDB", success.factory);
    await expect(clearAllOfflineWorkspaces(indexedDB)).resolves.toBeUndefined();

    for (const [mode, message] of [
      ["error", "Could not clear offline manuscripts"],
      ["blocked", "Close other Kirjolab tabs before logging out"],
    ] as const) {
      const harness = createIndexedDbHarness({ deleteDatabase: mode });
      vi.stubGlobal("indexedDB", harness.factory);
      await expect(clearAllOfflineWorkspaces(indexedDB)).rejects.toThrow(message);
    }

    const nativeFailure = createIndexedDbHarness({ deleteDatabase: "error", useNativeErrors: true });
    vi.stubGlobal("indexedDB", nativeFailure.factory);
    await expect(clearAllOfflineWorkspaces(indexedDB)).rejects.toBe(nativeFailure.nativeError);
  });
});
