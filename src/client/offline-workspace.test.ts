import { describe, expect, it } from "vitest";
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
    expect(Array.from(new Uint8Array((await store.load())?.documentUpdate ?? new ArrayBuffer(0)))).toEqual([1, 2, 3]);
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
    await expect(store.save({}, new Uint8Array(16 * 1024 * 1024 + 1), new Uint8Array())).rejects.toThrow("16 MiB");
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
  });

  it("degrades cleanly when IndexedDB is unavailable", async () => {
    expect(createOfflineWorkspaceStore(undefined, "writer", "paper")).toBeNull();
    await expect(clearAllOfflineWorkspaces(undefined)).resolves.toBeUndefined();
  });
});
