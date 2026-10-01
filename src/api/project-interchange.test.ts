import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildProjectArchive, inspectProjectArchive } from "../domain/project/project-archive";
import { projectArchiveFixture, projectArchiveResearchFixture } from "../test-support/project-archive";
import { exportNativeProject, handleProjectImportApi } from "./project-interchange";

const identity = { subject: "test", email: "test@example.test", mode: "local", ownerKey: "test" } as const;
const unavailable = (): never => {
  throw new Error("Unexpected persistence access");
};
function environment() {
  return {
    DOCUMENT_ROOMS: { getByName: unavailable },
    WORKSPACE_CATALOGS: { getByName: unavailable },
    WORKSPACE_ACCESS: { getByName: unavailable },
    PDF_BLOBS: { getByName: unavailable },
    REFERENCE_LIBRARIES: {
      getByName: () => ({
        previewProjectArchiveReferences: async () => [
          { sourceId: "reference", referenceId: null },
          { sourceId: "uncited", referenceId: "existing" },
        ],
        stageProjectArchiveReferences: unavailable,
        rollbackProjectArchiveReferences: unavailable,
      }),
    },
    PAPERS: { get: async (_key: string) => null, put: unavailable, list: unavailable, delete: unavailable },
  };
}
function request(path: string, bytes?: Uint8Array): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/zip" },
    body: bytes ? Uint8Array.from(bytes).buffer : null,
  });
}
describe("native project API boundaries", () => {
  it("rejects wrong routes, methods, media types, empty archives and declared oversized requests", async () => {
    const env = environment();
    expect((await handleProjectImportApi(request("/unknown"), env, identity)).status).toBe(404);
    expect((await handleProjectImportApi(new Request("https://example.test/api/project-imports"), env, identity)).status).toBe(405);
    expect(
      (await handleProjectImportApi(new Request("https://example.test/api/project-imports", { method: "POST" }), env, identity)).status,
    ).toBe(415);
    const oversized = request("/api/project-imports");
    oversized.headers.set("content-length", String(20 * 1024 * 1024 + 1));
    expect((await handleProjectImportApi(oversized, env, identity)).status).toBe(413);
    expect((await handleProjectImportApi(request("/api/project-imports"), env, identity)).status).toBe(413);
  });
  it("returns a read-only Library preview and rejects invalid confirmation before accessing project persistence", async () => {
    const archive = await buildProjectArchive(projectArchiveFixture(), new Map());
    const response = await handleProjectImportApi(request("/api/project-import-previews", archive), environment(), identity);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ kind: "native", reusedReferences: 1, newReferences: 1, summary: { references: 2 } });
    expect((await handleProjectImportApi(request("/api/project-imports", archive), environment(), identity)).status).toBe(400);
    const query = new URLSearchParams({
      title: "Paper",
      archiveSha256: "a".repeat(64),
      previewDigest: "b".repeat(64),
      attemptId: crypto.randomUUID(),
    });
    expect((await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), environment(), identity)).status).toBe(409);
  });
  it("reports Library ambiguity and refuses legacy confirmation", async () => {
    const archive = await buildProjectArchive(projectArchiveFixture(), new Map());
    const env = { ...environment(), REFERENCE_LIBRARIES: { getByName: unavailable } };
    expect((await handleProjectImportApi(request("/api/project-import-previews", archive), env, identity)).status).toBe(409);
    const legacy = zipSync({ "project/project-snapshot.json": strToU8("{}") });
    expect(
      await (await handleProjectImportApi(request("/api/project-import-previews", legacy), environment(), identity)).json(),
    ).toMatchObject({ kind: "legacy", previewDigest: null });
    expect((await handleProjectImportApi(request("/api/project-imports", legacy), environment(), identity)).status).toBe(422);
  });
  it("exports canonical state independently of publication rendering and fails closed on missing or changed binary data", async () => {
    const snapshot = projectArchiveFixture(),
      env = environment();
    const room = { getSnapshot: async () => snapshot, listLibrarySourceLinks: async () => [] };
    expect(await (await exportNativeProject("/export/project-preview", "source", room, env)).json()).toMatchObject({
      entryPath: "paper.md",
      references: 2,
    });
    const exported = await exportNativeProject("/export/project.zip", "source", room, env);
    expect(exported.status).toBe(200);
    expect((await inspectProjectArchive(new Uint8Array(await exported.arrayBuffer()))).kind).toBe("native");
    const rich = projectArchiveResearchFixture();
    const binaryRoom = { getSnapshot: async () => rich.snapshot, listLibrarySourceLinks: async () => [] };
    expect((await exportNativeProject("/export/project.zip", "source", binaryRoom, env)).status).toBe(409);
    const changed = { ...env, PAPERS: { ...env.PAPERS, get: async () => ({ size: 1, etag: "changed", body: new Blob(["x"]).stream() }) } };
    expect((await exportNativeProject("/export/project.zip", "source", binaryRoom, changed)).status).toBe(409);
  });
});
