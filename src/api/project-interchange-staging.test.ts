import { describe, expect, it, vi } from "vitest";
import { buildProjectArchive } from "../domain/project/project-archive";
import type { PdfResource, ProjectReferenceLink, WorkspaceSummary } from "../domain/workspace/workspace";
import { projectArchiveFixture, projectArchiveResearchFixture } from "../test-support/project-archive";
import { handleProjectImportApi } from "./project-interchange";

type ImportEnvironment = Parameters<typeof handleProjectImportApi>[1];
const identity = { subject: "test", email: "owner@example.test", ownerKey: "owner", mode: "local" } as const;
function harness() {
  const projectId = crypto.randomUUID(),
    claimId = crypto.randomUUID();
  const workspace: WorkspaceSummary = {
    id: projectId,
    title: "Restored",
    href: `/editor/${projectId}`,
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    archivedAt: null,
  };
  const state = { mode: "claimed" as "claimed" | "busy" | "complete", lostPublication: false, failSeed: false, published: false };
  const objects = new Map<string, Uint8Array>(),
    reservations = new Set<string>();
  let pdfs: PdfResource[] = [];
  const catalog: ReturnType<ImportEnvironment["WORKSPACE_CATALOGS"]["getByName"]> = {
    getWorkspace: async () => (state.published ? workspace : null),
    claimNativeProjectImport: async () =>
      state.mode === "busy"
        ? { status: "busy" }
        : state.mode === "complete"
          ? { status: "complete", workspace }
          : { status: "claimed", projectId, claimId, abandonedProjectIds: [] },
    completeNativeProjectImport: async () => {
      state.published = true;
      if (state.lostPublication) throw new Error("Lost publication response");
      return workspace;
    },
    failNativeProjectImport: vi.fn(async () => undefined),
    acknowledgeNativeProjectImportCleanup: vi.fn(async () => undefined),
  };
  const room: ReturnType<ImportEnvironment["DOCUMENT_ROOMS"]["getByName"]> = {
    getSnapshot: async () => projectArchiveFixture(),
    listLibrarySourceLinks: async () => [],
    registerPdf: async (pdf) => {
      pdfs.push(pdf);
      return pdf;
    },
    listRetainedPdfResources: async () => pdfs.map(({ id, objectKey }) => ({ id, objectKey })),
    seedFromRevision: vi.fn(async () => {
      if (state.failSeed) throw new Error("Injected seed failure");
      return projectArchiveFixture();
    }),
    deleteWorkspaceData: vi.fn(async () => {
      pdfs = [];
    }),
  };
  const library: ReturnType<ImportEnvironment["REFERENCE_LIBRARIES"]["getByName"]> = {
    previewProjectArchiveReferences: async (links) => links.map(({ referenceId }) => ({ sourceId: referenceId, referenceId: null })),
    stageProjectArchiveReferences: vi.fn(async (_id: string, links: readonly ProjectReferenceLink[]) =>
      links.map(({ referenceId }) => ({ sourceId: referenceId, referenceId: `mapped-${referenceId}` })),
    ),
    rollbackProjectArchiveReferences: vi.fn(async () => undefined),
  };
  const access: ReturnType<ImportEnvironment["WORKSPACE_ACCESS"]["getByName"]> = {
    initializeOwner: async (email) => ({ id: "owner", email, role: "owner", addedAt: workspace.createdAt }),
    getRole: async () => "owner",
    deleteWorkspaceAccess: vi.fn(async () => undefined),
  };
  const env: ImportEnvironment = {
    WORKSPACE_CATALOGS: { getByName: () => catalog },
    DOCUMENT_ROOMS: { getByName: () => room },
    REFERENCE_LIBRARIES: { getByName: () => library },
    WORKSPACE_ACCESS: { getByName: () => access },
    PAPERS: {
      put: async (key, bytes) => {
        objects.set(key, bytes);
        return { etag: "stored" };
      },
      get: async (key) => {
        const bytes = objects.get(key);
        return bytes ? { size: bytes.length, etag: "stored", body: new Blob([Uint8Array.from(bytes).buffer]).stream() } : null;
      },
      list: async ({ prefix }) => ({
        objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
        truncated: false,
      }),
      delete: async (keys) => {
        for (const key of typeof keys === "string" ? [keys] : keys) objects.delete(key);
      },
    },
    PDF_BLOBS: {
      getByName: () => ({
        reserve: async (digest, key) => {
          reservations.add(key);
          return { objectKey: `pdf-blobs/sha256/${digest}.pdf`, fingerprint: `sha256:${digest}` };
        },
        commit: async () => undefined,
        release: async (key) => {
          reservations.delete(key);
        },
      }),
    },
  };
  return { env, state, catalog, room, library, access, objects, reservations, projectId };
}
function request(path: string, archive: Uint8Array): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    body: Uint8Array.from(archive).buffer,
    headers: { "content-type": "application/zip" },
  });
}
async function confirmation(env: ImportEnvironment, archive: Uint8Array): Promise<string> {
  const preview = await handleProjectImportApi(request("/api/project-import-previews", archive), env, identity);
  const value = (await preview.json()) as { archiveSha256: string; previewDigest: string };
  return `/api/project-imports?${new URLSearchParams({ ...value, title: "Restored", attemptId: crypto.randomUUID() })}`;
}
describe("native project staging coordination", () => {
  it("publishes after storing binaries and passes remapped canonical rows to the room", async () => {
    const test = harness(),
      { snapshot, binaries } = projectArchiveResearchFixture();
    const archive = await buildProjectArchive(snapshot, binaries),
      path = await confirmation(test.env, archive);
    const response = await handleProjectImportApi(request(path, archive), test.env, identity);
    expect(response.status).toBe(201);
    expect(test.state.published).toBe(true);
    expect(test.objects.size).toBe(4);
    expect(test.reservations.size).toBe(1);
    expect(test.room.seedFromRevision).toHaveBeenCalledWith(
      test.projectId,
      "Restored",
      expect.stringContaining("Explicitly shared note"),
      expect.objectContaining({ pdfs: [expect.objectContaining({ objectKey: expect.stringMatching(/^pdf-blobs\/sha256\//u) })] }),
    );
    expect(test.library.rollbackProjectArchiveReferences).not.toHaveBeenCalled();
  });
  it("releases new resources and access when canonical seeding fails", async () => {
    const test = harness(),
      { snapshot, binaries } = projectArchiveResearchFixture();
    test.state.failSeed = true;
    const archive = await buildProjectArchive(snapshot, binaries),
      path = await confirmation(test.env, archive);
    const response = await handleProjectImportApi(request(path, archive), test.env, identity);
    expect(response.status).toBe(503);
    expect(test.state.published).toBe(false);
    expect(test.objects.size).toBe(0);
    expect(test.reservations.size).toBe(0);
    expect(test.library.rollbackProjectArchiveReferences).toHaveBeenCalledWith(test.projectId);
    expect(test.room.deleteWorkspaceData).toHaveBeenCalled();
    expect(test.access.deleteWorkspaceAccess).toHaveBeenCalledWith(identity.email);
    expect(test.catalog.failNativeProjectImport).toHaveBeenCalled();
  });
  it("recovers a lost publication response and makes busy/completed retries read-only", async () => {
    const test = harness(),
      archive = await buildProjectArchive(projectArchiveFixture(), new Map());
    const path = await confirmation(test.env, archive);
    test.state.mode = "busy";
    expect((await handleProjectImportApi(request(path, archive), test.env, identity)).status).toBe(409);
    expect(test.library.stageProjectArchiveReferences).not.toHaveBeenCalled();
    test.state.mode = "complete";
    expect((await handleProjectImportApi(request(path, archive), test.env, identity)).status).toBe(200);
    test.state.mode = "claimed";
    test.state.lostPublication = true;
    expect((await handleProjectImportApi(request(path, archive), test.env, identity)).status).toBe(200);
    expect(test.library.rollbackProjectArchiveReferences).not.toHaveBeenCalled();
    expect(test.room.deleteWorkspaceData).not.toHaveBeenCalled();
  });
});
