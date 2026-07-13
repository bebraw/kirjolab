import { describe, expect, it } from "vitest";
import {
  backupBlobKey,
  isOwnedBinaryKey,
  ownerBackupDigest,
  ownerBackupManifestJson,
  ownerBackupManifestKey,
  referencedBinaryKeys,
  type BackupBinaryReferences,
  type BackupBinaryObject,
  type OwnerBackupManifest,
  type OwnerBackupState,
} from "./backups";

const emptyState = {
  ownerKey: "a".repeat(64),
  catalog: [],
  library: {
    references: [],
    referenceKeyStates: {},
    artifacts: [],
    webSources: [],
    webSnapshots: [],
    notes: [],
    highlights: [],
    tags: {},
    collections: {},
    reading: [],
  },
  workspaces: [],
} satisfies OwnerBackupState;

describe("owner backup projection", () => {
  it("computes a stable digest independent of object property insertion order", async () => {
    const reordered = {
      workspaces: [],
      library: { ...emptyState.library, tags: {}, references: [] },
      catalog: [],
      ownerKey: emptyState.ownerKey,
    } satisfies OwnerBackupState;
    expect(await ownerBackupDigest(emptyState, [])).toBe(await ownerBackupDigest(reordered, []));
    expect(await ownerBackupDigest({ ...emptyState, ownerKey: "b".repeat(64) }, [])).not.toBe(await ownerBackupDigest(emptyState, []));
  });

  it("derives opaque deterministic binary and chronological manifest keys", async () => {
    const first = await backupBlobKey(emptyState.ownerKey, "libraries/owner/paper.pdf", "etag-1", 42);
    expect(first).toMatch(new RegExp(`^backups/blobs/${emptyState.ownerKey}/[a-f0-9]{64}$`, "u"));
    expect(await backupBlobKey(emptyState.ownerKey, "libraries/owner/paper.pdf", "etag-1", 42)).toBe(first);
    expect(await backupBlobKey(emptyState.ownerKey, "libraries/owner/paper.pdf", "etag-2", 42)).not.toBe(first);
    expect(ownerBackupManifestKey(emptyState.ownerKey, "2026-07-13T17:20:30.456Z", "c".repeat(64))).toBe(
      `backups/manifests/${emptyState.ownerKey}/20260713172030456-${"c".repeat(64)}.json`,
    );
  });

  it("collects each referenced library, web, and workspace object once in sorted order", () => {
    const state = {
      library: {
        artifacts: [{ objectKey: "libraries/owner/z.pdf" }],
        webSnapshots: [
          { rawObjectKey: "libraries/owner/a/raw", readableObjectKey: "libraries/owner/a/readable.txt" },
          { rawObjectKey: "libraries/owner/z.pdf", readableObjectKey: null },
        ],
      },
      workspaces: [{ snapshot: { pdfs: [{ objectKey: "workspace/paper.pdf" }] } }],
    } satisfies BackupBinaryReferences;
    expect(referencedBinaryKeys(state)).toEqual([
      "libraries/owner/a/raw",
      "libraries/owner/a/readable.txt",
      "libraries/owner/z.pdf",
      "workspace/paper.pdf",
    ]);
  });

  it("accepts only authoritative owner and workspace object prefixes", () => {
    const ownerKey = emptyState.ownerKey;
    for (const key of [`libraries/${ownerKey}/paper.pdf`, "workspace-1/paper.pdf", `${ownerKey}:demo/paper.pdf`]) {
      expect(isOwnedBinaryKey(ownerKey, ["workspace-1", "demo"], key), key).toBe(true);
    }
    for (const key of ["", "/workspace-1/paper.pdf", "other/paper.pdf", "workspace-1/../secret", "workspace-1\\paper.pdf"]) {
      expect(isOwnedBinaryKey(ownerKey, ["workspace-1", "demo"], key), key).toBe(false);
    }
  });

  it("serializes manifests canonically with one trailing newline", async () => {
    const binary: BackupBinaryObject = {
      sourceKey: "workspace/paper.pdf",
      sourceEtag: "etag",
      size: 42,
      uploadedAt: "2026-07-13T00:00:00.000Z",
      backupKey: await backupBlobKey(emptyState.ownerKey, "workspace/paper.pdf", "etag", 42),
    };
    const manifest: OwnerBackupManifest = {
      schemaVersion: "kirjolab-owner-backup-v1",
      createdAt: "2026-07-13T00:00:00.000Z",
      digest: await ownerBackupDigest(emptyState, [binary]),
      state: emptyState,
      binaries: [binary],
      recovery: { catalog: null, library: null, workspaces: [] },
    };
    const serialized = ownerBackupManifestJson(manifest);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual(manifest);
    expect(serialized).toContain('"binaries"');
  });
});
