import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildProjectArchive, inspectProjectArchive } from "../domain/project/project-archive";
import { sha256Bytes, sha256Text } from "../domain/sha256";
import type { WorkspaceCatalog } from "../durable-objects/workspace-catalog";
import { projectArchiveFixture, projectArchiveResearchFixture } from "../test-support/project-archive";
import type { AuthIdentity } from "../security/auth";
import { exportNativeProject, handleProjectImportApi } from "./project-interchange";
import { handleWorkspaceApi } from "./workspace";

const identity = {
  subject: "native-test",
  email: "native@example.test",
  ownerKey: "native-import-test",
  mode: "local",
} satisfies AuthIdentity;
const request = (path: string, bytes: Uint8Array) =>
  new Request(`http://example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/zip" },
    body: Uint8Array.from(bytes).buffer,
  });

describe("native project import", () => {
  it("normalizes a source project, checks setup changes and creates one exportable project with PDFs and linked references", async () => {
    const owner = { ...identity, ownerKey: crypto.randomUUID() };
    const rich = projectArchiveResearchFixture();
    const entries: Record<string, Uint8Array> = {
      "paper/manuscript.md": strToU8("# Imported source\n\nEvidence :cite[Writer2026]."),
      "paper/notes/results.md": strToU8("# Results\nOriginal notes."),
      "paper/bibliography.bib": strToU8(
        "@article{Writer2026,title={Source evidence},author={Writer, Ada},year={2026},doi={10.1000/source-import}}",
      ),
      "paper/references/source.pdf": rich.binaries.get("old/pdf")!,
      "paper/figures/result.png": rich.binaries.get("old/image")!,
    };
    for (let index = 0; index < 1_100; index++) entries[`paper/node_modules/p/${index}.js`] = strToU8("ignored");
    const archive = zipSync(entries);
    const catalog = env.WORKSPACE_CATALOGS.getByName(owner.ownerKey);
    const before = await catalog.listWorkspaces();
    const preview = await handleProjectImportApi(request("/api/project-import-previews", archive), env, owner);
    expect(preview.status).toBe(200);
    const value = await preview.json<{ archiveSha256: string; previewDigest: string }>();
    expect(await catalog.listWorkspaces()).toEqual(before);
    expect((await env.REFERENCE_LIBRARIES.getByName(owner.ownerKey).getSnapshot()).references).toEqual([]);
    const changed = new URLSearchParams({
      archiveSha256: value.archiveSha256,
      previewDigest: value.previewDigest,
      title: "Changed setup",
      attemptId: crypto.randomUUID(),
      entryPath: "notes/results.md",
    });
    expect((await handleProjectImportApi(request(`/api/project-imports?${changed}`, archive), env, owner)).status).toBe(409);
    expect(await catalog.listWorkspaces()).toEqual(before);
    const query = new URLSearchParams({
      archiveSha256: value.archiveSha256,
      previewDigest: value.previewDigest,
      title: "Reviewed source",
      attemptId: crypto.randomUUID(),
      entryPath: "manuscript.md",
      bibliographyPath: "bibliography.bib",
      includePdfs: "true",
    });
    const result = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner);
    expect(result.status).toBe(201);
    const created = await result.json<{ workspace: { id: string } }>();
    const room = env.DOCUMENT_ROOMS.getByName(created.workspace.id);
    const snapshot = await room.getSnapshot(created.workspace.id);
    expect(snapshot.title).toBe("Reviewed source");
    expect(snapshot.files.map(({ path }) => path)).toEqual(["manuscript.md", "notes/results.md"]);
    expect(snapshot.pdfs).toMatchObject([{ name: "references/source.pdf" }]);
    expect(snapshot.projectReferences).toMatchObject([{ citationAlias: "Writer2026", snapshot: { title: "Source evidence" } }]);
    expect(snapshot.assets).toMatchObject([{ path: "figures/result.png" }]);
    const retry = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner);
    expect(await retry.json()).toMatchObject({ workspace: { id: created.workspace.id } });
    const exported = await exportNativeProject("/export/project.zip", created.workspace.id, room, env);
    expect(exported.status).toBe(200);
    const restored = await inspectProjectArchive(new Uint8Array(await exported.arrayBuffer()));
    expect(restored.kind).toBe("native");
    expect(restored.summary).toMatchObject({ title: "Reviewed source", files: 2, references: 1, pdfs: 1, images: 1 });
  });
  it("previews without writes and persists exact project state with already-linked references", async () => {
    const archive = await buildProjectArchive(projectArchiveFixture(), new Map());
    const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
    const before = await catalog.listWorkspaces();
    const preview = await handleProjectImportApi(request("/api/project-import-previews", archive), env, identity);
    expect(preview.status).toBe(200);
    const value = await preview.json<{ archiveSha256: string; previewDigest: string }>();
    expect(await catalog.listWorkspaces()).toEqual(before);
    const query = new URLSearchParams({
      archiveSha256: value.archiveSha256,
      previewDigest: value.previewDigest,
      attemptId: crypto.randomUUID(),
      title: "Restored paper",
    });
    const result = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, identity);
    expect(result.status).toBe(201);
    const created = await result.json<{ workspace: { id: string } }>();
    const snapshot = await env.DOCUMENT_ROOMS.getByName(created.workspace.id).getSnapshot(created.workspace.id);
    expect(snapshot.title).toBe("Restored paper");
    expect(snapshot.files.map(({ path, content }) => ({ path, content }))).toEqual(
      projectArchiveFixture().files.map(({ path, content }) => ({ path, content })),
    );
    expect(snapshot.files.find(({ id }) => id === snapshot.entryFileId)?.path).toBe("paper.md");
    expect(snapshot.folders.map(({ path }) => path)).toEqual(["empty", "sections"]);
    expect(snapshot.projectReferences.map(({ citationAlias }) => citationAlias)).toEqual(["CustomAlias", "Uncited"]);
    expect(snapshot.comments[0]?.resolution).toMatchObject({ status: "resolved", text: "Result" });
    expect(snapshot.comments[0]?.anchor.fileId).toBe(snapshot.files.find(({ path }) => path === "sections/result.md")?.id);
    const retry = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, identity);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ workspace: { id: created.workspace.id } });
    expect((await catalog.listWorkspaces()).length).toBe(before.length + 1);
  });

  it("round-trips project-owned binaries, evidence, shared snapshots and pinned review outputs", async () => {
    const { snapshot: source, binaries } = projectArchiveResearchFixture();
    const archive = await buildProjectArchive(source, binaries);
    const owner = { ...identity, ownerKey: crypto.randomUUID() };
    const preview = await handleProjectImportApi(request("/api/project-import-previews", archive), env, owner);
    const value = await preview.json<{ archiveSha256: string; previewDigest: string }>();
    const query = new URLSearchParams({ ...value, attemptId: crypto.randomUUID(), title: source.title });
    const response = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner);
    expect(await response.clone().json()).toHaveProperty("workspace");
    expect(response.status).toBe(201);
    const { workspace } = await response.json<{ workspace: { id: string } }>();
    const room = env.DOCUMENT_ROOMS.getByName(workspace.id);
    const restored = await room.getSnapshot(workspace.id);
    expect(restored.annotations[0]).toMatchObject({
      quote: "Evidence",
      comment: "Annotation note",
      fragments: [{ quote: "Evidence", rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }] }],
    });
    expect(restored.claimEvidenceLinks[0]).toMatchObject({
      claimId: restored.claims[0]!.id,
      annotationId: restored.annotations[0]!.id,
      relation: "supports",
    });
    expect(restored.links[0]).toMatchObject({
      annotationId: restored.annotations[0]!.id,
      resolution: { status: "resolved", text: "Result" },
    });
    expect(restored.claimLinks[0]).toMatchObject({ claimId: restored.claims[0]!.id, resolution: { status: "resolved", text: "Result" } });
    expect(restored.publicationPdfLinks[0]).toMatchObject({
      publicationId: restored.projectReferences[0]!.referenceId,
      pdfId: restored.pdfs[0]!.id,
    });
    expect(restored.researchShares.map(({ content }) => content.kind).sort()).toEqual(["artifact", "highlight", "note", "web-snapshot"]);
    expect(restored.reviewArtifactPins).toEqual(source.reviewArtifactPins);
    expect(await env.WORKSPACE_ACCESS.getByName(workspace.id).listMembers(owner.email)).toEqual([
      expect.objectContaining({ email: owner.email, role: "owner" }),
    ]);
    expect(restored.bibliography).toContain("CustomAlias");
    expect(restored.bibliography).toContain("Uncited");
    const pdf = await env.PAPERS.get(restored.pdfs[0]!.objectKey);
    expect(new Uint8Array(await pdf!.arrayBuffer())).toEqual(binaries.get("old/pdf"));
    const exported = await exportNativeProject("/export/project.zip", workspace.id, room, env);
    expect(exported.status).toBe(200);
    const inspected = await inspectProjectArchive(new Uint8Array(await exported.arrayBuffer()));
    if (inspected.kind !== "native") throw new Error("Expected native archive");
    expect(inspected.project.files.map(({ path, content }) => ({ path, content })).sort((a, b) => a.path.localeCompare(b.path))).toEqual(
      source.files.map(({ path, content }) => ({ path, content })).sort((a, b) => a.path.localeCompare(b.path)),
    );
    expect(inspected.payloads.get(inspected.project.pdfs[0]!.objectKey)).toEqual(binaries.get("old/pdf"));
    expect(inspected.payloads.get(inspected.project.assets[0]!.objectKey)).toEqual(binaries.get("old/image"));
    expect(inspected.project.comments[0]!.resolution).toMatchObject({ status: "resolved", text: "Result" });
  });

  it("serves and revokes imported shared snapshots without restoring private Library research", async () => {
    const owner = { ...identity, ownerKey: crypto.randomUUID(), mode: "access" as const };
    const { snapshot, binaries } = projectArchiveResearchFixture();
    const archive = await buildProjectArchive(snapshot, binaries);
    const value = await (
      await handleProjectImportApi(request("/api/project-import-previews", archive), env, owner)
    ).json<{ archiveSha256: string; previewDigest: string }>();
    const query = new URLSearchParams({ ...value, attemptId: crypto.randomUUID(), title: snapshot.title });
    const response = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner);
    const { workspace } = await response.json<{ workspace: { id: string } }>();
    const room = env.DOCUMENT_ROOMS.getByName(workspace.id);
    const restored = await room.getSnapshot(workspace.id);
    const web = restored.researchShares.find(({ kind }) => kind === "web-snapshot")!;
    const raw = await handleWorkspaceApi(
      new Request(`http://example.com/api/workspaces/${workspace.id}/research-shares/${web.id}/content?representation=raw`),
      env,
      owner,
    );
    expect(raw.status).toBe(200);
    expect(new Uint8Array(await raw.arrayBuffer())).toEqual(binaries.get("old/web"));
    const artifact = restored.researchShares.find(({ kind }) => kind === "artifact")!;
    const pdf = await handleWorkspaceApi(
      new Request(`http://example.com/api/workspaces/${workspace.id}/research-shares/${artifact.id}/content`),
      env,
      owner,
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await pdf.arrayBuffer())).toEqual(binaries.get("old/shared-pdf"));
    for (const share of restored.researchShares) {
      const revoked = await handleWorkspaceApi(
        new Request(`http://example.com/api/workspaces/${workspace.id}/research-shares/${share.id}`, { method: "DELETE" }),
        env,
        owner,
      );
      expect(revoked.status).toBe(200);
    }
    expect((await room.getSnapshot(workspace.id)).researchShares).toEqual([]);
    const library = await env.REFERENCE_LIBRARIES.getByName(owner.ownerKey).getSnapshot();
    expect(library.notes).toEqual([]);
    expect(library.highlights).toEqual([]);
    expect(library.artifacts).toEqual([]);
    expect(library.webSnapshots).toEqual([]);
    const unavailable = await handleWorkspaceApi(
      new Request(`http://example.com/api/workspaces/${workspace.id}/research-shares/${web.id}/content?representation=raw`),
      env,
      owner,
    );
    expect(unavailable.status).toBe(400);
  });

  it("reuses existing Library records without changing their metadata or project snapshots", async () => {
    const owner = { ...identity, ownerKey: crypto.randomUUID() };
    const library = env.REFERENCE_LIBRARIES.getByName(owner.ownerKey);
    await library.importBibTeX(
      "@article{Existing, title={Better Library metadata}, doi={10.1000/portable}, author={Library, Writer}, year={2025}}",
      owner.email,
    );
    const before = await library.getSnapshot();
    const archive = await buildProjectArchive(projectArchiveFixture(), new Map());
    const preview = await handleProjectImportApi(request("/api/project-import-previews", archive), env, owner);
    const value = await preview.json<{ archiveSha256: string; previewDigest: string; reusedReferences: number }>();
    expect(value.reusedReferences).toBe(1);
    const query = new URLSearchParams({
      archiveSha256: value.archiveSha256,
      previewDigest: value.previewDigest,
      attemptId: crypto.randomUUID(),
      title: "Reuse",
    });
    const result = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner);
    expect(result.status).toBe(201);
    const { workspace } = await result.json<{ workspace: { id: string } }>();
    const snapshot = await env.DOCUMENT_ROOMS.getByName(workspace.id).getSnapshot(workspace.id);
    expect(snapshot.projectReferences[0]!.referenceId).toBe(before.references[0]!.id);
    expect(snapshot.projectReferences[0]!.snapshot.title).toBe("Pinned source");
    expect((await library.getSnapshot()).references.find(({ id }) => id === before.references[0]!.id)).toEqual(before.references[0]);
  });

  it("cleans failed staging and retries without duplicating references or publishing a partial project", async () => {
    const owner = { ...identity, ownerKey: crypto.randomUUID() };
    const { snapshot, binaries } = projectArchiveResearchFixture();
    const archive = await buildProjectArchive(snapshot, binaries);
    const value = await (
      await handleProjectImportApi(request("/api/project-import-previews", archive), env, owner)
    ).json<{ archiveSha256: string; previewDigest: string }>();
    const query = new URLSearchParams({ ...value, attemptId: crypto.randomUUID(), title: "Retry staging" });
    const before = await env.WORKSPACE_CATALOGS.getByName(owner.ownerKey).listWorkspaces();
    const papers = new Proxy(env.PAPERS, {
      get(target, property) {
        if (property === "put")
          return () => {
            throw new Error("Injected storage failure");
          };
        const value: unknown = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const failed = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), { ...env, PAPERS: papers }, owner);
    expect(failed.status).toBe(503);
    expect(await env.WORKSPACE_CATALOGS.getByName(owner.ownerKey).listWorkspaces()).toEqual(before);
    expect((await env.REFERENCE_LIBRARIES.getByName(owner.ownerKey).getSnapshot()).references).toEqual([]);
    const result = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner);
    expect(result.status).toBe(201);
    expect((await env.REFERENCE_LIBRARIES.getByName(owner.ownerKey).getSnapshot()).references).toHaveLength(2);
  });

  it("binds confirmation to the archive and Library preview, and serializes concurrent attempts", async () => {
    const owner = { ...identity, ownerKey: crypto.randomUUID() };
    const archive = await buildProjectArchive(projectArchiveFixture(), new Map());
    const value = await (
      await handleProjectImportApi(request("/api/project-import-previews", archive), env, owner)
    ).json<{ archiveSha256: string; previewDigest: string }>();
    const query = new URLSearchParams({ ...value, attemptId: crypto.randomUUID(), title: "Concurrent" });
    const changed = new URLSearchParams(query);
    changed.set("archiveSha256", "a".repeat(64));
    expect((await handleProjectImportApi(request(`/api/project-imports?${changed}`, archive), env, owner)).status).toBe(409);
    const results = await Promise.all([
      handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner),
      handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      (await env.WORKSPACE_CATALOGS.getByName(owner.ownerKey).listWorkspaces()).filter(({ title }) => title === "Concurrent"),
    ).toHaveLength(1);
    query.set("title", "Different intent");
    expect((await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner)).status).toBe(409);
    const otherOwner = { ...identity, ownerKey: crypto.randomUUID() };
    const stale = await (
      await handleProjectImportApi(request("/api/project-import-previews", archive), env, otherOwner)
    ).json<{ archiveSha256: string; previewDigest: string }>();
    await env.REFERENCE_LIBRARIES.getByName(otherOwner.ownerKey).importBibTeX(
      "@misc{Source,title={New match},doi={10.1000/portable}}",
      otherOwner.email,
    );
    const staleQuery = new URLSearchParams({ ...stale, attemptId: crypto.randomUUID(), title: "Stale preview" });
    expect((await handleProjectImportApi(request(`/api/project-imports?${staleQuery}`, archive), env, otherOwner)).status).toBe(409);
    expect(
      (await env.WORKSPACE_CATALOGS.getByName(otherOwner.ownerKey).listWorkspaces()).filter(({ title }) => title === "Stale preview"),
    ).toEqual([]);
  });

  it("rejects tampering and legacy confirmation before creating a project", async () => {
    const archive = unzipSync(await buildProjectArchive(projectArchiveFixture(), new Map()));
    archive["project.json"] = strToU8("{}");
    expect((await handleProjectImportApi(request("/api/project-import-previews", zipSync(archive)), env, identity)).status).toBe(400);
    const legacy = zipSync({ "project/project-snapshot.json": strToU8("{}") });
    const preview = await handleProjectImportApi(request("/api/project-import-previews", legacy), env, identity);
    expect(await preview.json()).toMatchObject({ kind: "legacy", previewDigest: null });
    expect((await handleProjectImportApi(request("/api/project-imports", legacy), env, identity)).status).toBe(422);
  });

  it("recovers a crashed staging attempt and retains abandoned identities when cleanup itself fails", async () => {
    const owner = { ...identity, ownerKey: crypto.randomUUID() };
    const { snapshot, binaries } = projectArchiveResearchFixture();
    const archive = await buildProjectArchive(snapshot, binaries);
    const value = await (
      await handleProjectImportApi(request("/api/project-import-previews", archive), env, owner)
    ).json<{ archiveSha256: string; previewDigest: string }>();
    const attemptId = crypto.randomUUID(),
      title = "Crash recovery";
    const digest = await sha256Text(JSON.stringify({ expectedHash: value.archiveSha256, expectedPreview: value.previewDigest, title }));
    const catalog = env.WORKSPACE_CATALOGS.getByName(owner.ownerKey);
    const claim = await catalog.claimNativeProjectImport(attemptId, digest);
    if (claim.status !== "claimed") throw new Error("Expected fresh claim");
    const oldId = claim.projectId,
      pdfId = crypto.randomUUID(),
      bytes = binaries.get("old/pdf")!;
    const pdfDigest = await sha256Bytes(bytes),
      refKey = `project:${oldId}:${pdfId}`;
    await env.WORKSPACE_ACCESS.getByName(oldId).initializeOwner(owner.email);
    await env.DOCUMENT_ROOMS.getByName(oldId).registerPdf({
      ...snapshot.pdfs[0]!,
      id: pdfId,
      objectKey: `pdf-blobs/sha256/${pdfDigest}.pdf`,
      fingerprint: `sha256:${pdfDigest}`,
    });
    await env.PDF_BLOBS.getByName(pdfDigest).reserve(pdfDigest, refKey, bytes);
    await env.PAPERS.put(`${oldId}/archive/orphan`, binaries.get("old/image")!);
    const library = env.REFERENCE_LIBRARIES.getByName(owner.ownerKey);
    await library.stageProjectArchiveReferences(
      oldId,
      snapshot.projectReferences,
      owner.email,
      await library.previewProjectArchiveReferences(snapshot.projectReferences),
    );
    await runInDurableObject(catalog, (_instance: WorkspaceCatalog, state) => {
      state.storage.sql.exec("UPDATE native_project_imports SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", attemptId);
    });
    const query = new URLSearchParams({ archiveSha256: value.archiveSha256, previewDigest: value.previewDigest, attemptId, title });
    const papers = new Proxy(env.PAPERS, {
      get(target, property) {
        if (property === "list")
          return async (options: R2ListOptions) => {
            if (options.prefix === `${oldId}/`) throw new Error("Injected cleanup failure");
            return await target.list(options);
          };
        const member: unknown = Reflect.get(target, property);
        return typeof member === "function" ? member.bind(target) : member;
      },
    });
    expect(
      (await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), { ...env, PAPERS: papers }, owner)).status,
    ).toBe(503);
    const pending = await runInDurableObject(catalog, (_instance: WorkspaceCatalog, state) =>
      state.storage.sql
        .exec<{ abandoned_ids_json: string }>("SELECT abandoned_ids_json FROM native_project_imports WHERE id = ?", attemptId)
        .one(),
    );
    expect(JSON.parse(pending.abandoned_ids_json)).toEqual([oldId]);
    const restored = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner);
    expect(restored.status).toBe(201);
    expect((await env.PAPERS.list({ prefix: `${oldId}/` })).objects).toEqual([]);
    expect(await env.WORKSPACE_ACCESS.getByName(oldId).getRole(owner.email)).toBeNull();
    expect(await env.PDF_BLOBS.getByName(pdfDigest).references()).not.toContainEqual({ refKey, state: "pending" });
    const receipt = await runInDurableObject(catalog, (_instance: WorkspaceCatalog, state) =>
      state.storage.sql
        .exec<{ archive_sha256: string; source_identity_map_json: string; abandoned_ids_json: string }>(
          "SELECT archive_sha256, source_identity_map_json, abandoned_ids_json FROM native_project_imports WHERE id = ?",
          attemptId,
        )
        .one(),
    );
    expect(receipt.archive_sha256).toBe(value.archiveSha256);
    expect(JSON.parse(receipt.source_identity_map_json)).toContainEqual(["reference", "reference", expect.any(String)]);
    expect(receipt.abandoned_ids_json).toBe("[]");
  });

  it("keeps a completed project when publication succeeds but its RPC response is lost", async () => {
    const owner = { ...identity, ownerKey: crypto.randomUUID() };
    const archive = await buildProjectArchive(projectArchiveFixture(), new Map());
    const value = await (
      await handleProjectImportApi(request("/api/project-import-previews", archive), env, owner)
    ).json<{ archiveSha256: string; previewDigest: string }>();
    const catalog = env.WORKSPACE_CATALOGS.getByName(owner.ownerKey);
    const wrapped = {
      getWorkspace: async (...args: Parameters<WorkspaceCatalog["getWorkspace"]>) => await catalog.getWorkspace(...args),
      claimNativeProjectImport: async (...args: Parameters<WorkspaceCatalog["claimNativeProjectImport"]>) =>
        await catalog.claimNativeProjectImport(...args),
      completeNativeProjectImport: async (...args: Parameters<WorkspaceCatalog["completeNativeProjectImport"]>) => {
        await catalog.completeNativeProjectImport(...args);
        throw new Error("Injected lost publication response");
      },
      failNativeProjectImport: async (...args: Parameters<WorkspaceCatalog["failNativeProjectImport"]>) =>
        await catalog.failNativeProjectImport(...args),
      acknowledgeNativeProjectImportCleanup: async (...args: Parameters<WorkspaceCatalog["acknowledgeNativeProjectImportCleanup"]>) =>
        await catalog.acknowledgeNativeProjectImportCleanup(...args),
    };
    const query = new URLSearchParams({ ...value, attemptId: crypto.randomUUID(), title: "Published safely" });
    const response = await handleProjectImportApi(
      request(`/api/project-imports?${query}`, archive),
      { ...env, WORKSPACE_CATALOGS: { getByName: () => wrapped } },
      owner,
    );
    expect(response.status).toBe(200);
    const { workspace } = await response.json<{ workspace: { id: string } }>();
    expect((await env.DOCUMENT_ROOMS.getByName(workspace.id).getSnapshot(workspace.id)).projectReferences).toHaveLength(2);
    expect(await env.WORKSPACE_ACCESS.getByName(workspace.id).getRole(owner.email)).toBe("owner");
    const retry = await handleProjectImportApi(request(`/api/project-imports?${query}`, archive), env, owner);
    expect(await retry.json()).toMatchObject({ workspace: { id: workspace.id } });
  });
});
