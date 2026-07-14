import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { type CreateCandidateInput, type PublicationEnrichment, type WorkspaceSnapshot } from "../domain/workspace";
import { DocumentRoom, sendWebSocketMessage, type DocumentRoomOperationResult } from "./document-room";

interface WorkspaceStateRow extends Record<string, SqlStorageValue> {
  y_state: ArrayBuffer;
}

interface MigrationLedgerRow extends Record<string, SqlStorageValue> {
  name: string;
  version: number;
}

interface TableColumnRow extends Record<string, SqlStorageValue> {
  name: string;
}

const acceptedMetadata = {
  type: "article",
  title: "Accepted metadata title",
  authors: ["Lovelace, Ada", "Hopper, Grace"],
  year: "2025",
  venue: "Journal of Durable Knowledge",
  doi: "10.5555/KIRJOLAB.1",
  url: "https://example.test/accepted",
  abstract: "Metadata accepted from the explicit enrichment flow.",
} satisfies PublicationEnrichment;

function operationValue<Value, Code extends string>(result: DocumentRoomOperationResult<Value, Code>): Value {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("DocumentRoom in the Workers runtime", () => {
  it("suppresses only WebSocket disconnect send failures", () => {
    let closedSendCalled = false;
    expect(
      sendWebSocketMessage(
        {
          readyState: WebSocket.CLOSED,
          send: () => {
            closedSendCalled = true;
          },
        },
        "closed",
      ),
    ).toBe(false);
    expect(closedSendCalled).toBe(false);

    expect(
      sendWebSocketMessage(
        {
          readyState: WebSocket.OPEN,
          send: () => {
            throw new Error("Network connection lost.");
          },
        },
        "disconnecting",
      ),
    ).toBe(false);

    expect(() =>
      sendWebSocketMessage(
        {
          readyState: WebSocket.OPEN,
          send: () => {
            throw new Error("Unexpected serialization failure");
          },
        },
        "broken",
      ),
    ).toThrow("Unexpected serialization failure");
  });

  it("limits edit-link sockets to ephemeral collaboration metadata", async () => {
    const workspaceId = "edit-link-presence";
    const stub = roomStub(workspaceId);
    await stub.getSnapshot(workspaceId);

    await runInDurableObject(stub, async (instance: DocumentRoom) => {
      const response = await instance.fetch(
        new Request("http://example.com/socket", {
          headers: { upgrade: "websocket", "x-kirjolab-edit-presence": "1" },
        }),
      );
      const client = response.webSocket;
      expect(client).not.toBeNull();
      if (!client) throw new Error("Expected edit-link WebSocket");
      const initialMessages = new Promise<unknown[]>((resolve) => {
        const messages: unknown[] = [];
        client.addEventListener("message", (event) => {
          messages.push(event.data);
          if (messages.length === 2) resolve(messages);
        });
      });
      client.accept();
      const messages = await initialMessages;
      expect(messages.every((message) => typeof message === "string")).toBe(true);
      expect(messages.map((message) => JSON.parse(String(message)).type).sort()).toEqual(["presence", "sync"]);

      const closed = new Promise<CloseEvent>((resolve) => client.addEventListener("close", resolve, { once: true }));
      client.send(new Uint8Array([1, 2, 3]));
      await expect(closed).resolves.toMatchObject({ code: 1008 });
      expect(instance.getSnapshot(workspaceId).source).toContain("Evidence becomes prose");
    });
  });

  it("versions publication profiles and restores them with project history", async () => {
    const workspaceId = "publication-profile";
    const stub = roomStub(workspaceId);
    expect((await stub.getSnapshot(workspaceId)).publicationProfile).toEqual({
      citationStyle: "apa",
      locale: "en-US",
      submissionTemplate: "article",
      paperSize: "a4",
    });
    const updated = await stub.updatePublicationProfile({
      citationStyle: "ieee",
      locale: "fi-FI",
      submissionTemplate: "anonymous-review",
      paperSize: "letter",
    });
    expect(updated.publicationProfile).toEqual({
      citationStyle: "ieee",
      locale: "fi-FI",
      submissionTemplate: "anonymous-review",
      paperSize: "letter",
    });
    expect((await stub.listRevisions())[0]).toMatchObject({ reason: "publication-profile-update" });
    const restored = await stub.restoreRevision(workspaceId, 0);
    expect(restored.publicationProfile).toEqual({ citationStyle: "apa", locale: "en-US", submissionTemplate: "article", paperSize: "a4" });
  });

  it("preserves atomic project history, immutable milestones, non-destructive restore, and revision seeds", async () => {
    const workspaceId = "project-history";
    const stub = roomStub(workspaceId);
    const initial = await stub.getSnapshot(workspaceId);
    expect(await stub.listRevisions()).toEqual([
      expect.objectContaining({ revision: 0, reason: "history-adoption", fileCount: 2, milestones: [] }),
    ]);

    const historicalPdf = pdfResource("historical.pdf");
    await stub.registerPdf(historicalPdf);
    expect((await stub.getSnapshot(workspaceId)).revision).toBe(initial.revision);
    const excerpt = "the path from an annotation to a claim";
    const start = initial.source.indexOf(excerpt);
    expect(start).toBeGreaterThanOrEqual(0);
    const linked = await stub.createAnnotationLink({
      annotation: {
        pdfId: historicalPdf.id,
        page: 2,
        quote: "Historical evidence",
        prefix: "before",
        suffix: "after",
        comment: "Retain this relationship",
        rects: [],
      },
      passage: {
        fileId: initial.entryFileId,
        start,
        end: start + excerpt.length,
        excerpt,
        sourceRevision: initial.revision,
      },
    });
    const claim = await stub.createClaim({
      text: "History retains evidence relationships.",
      note: "Milestone evidence",
      evidence: [{ annotationId: linked.annotation.id, relation: "supports" }],
    });
    expect(
      await stub.updateClaim(claim.id, {
        text: "This update must not persist.",
        note: "",
        evidence: [{ annotationId: crypto.randomUUID(), relation: "supports" }],
      }),
    ).toEqual({ ok: false, code: "annotation-not-found", error: "Annotation not found" });
    await stub.createClaimPassageLink({
      claimId: claim.id,
      fileId: initial.entryFileId,
      start,
      end: start + excerpt.length,
      excerpt,
      sourceRevision: initial.revision,
    });
    const withChapter = await stub.createProjectFile(workspaceId, "chapters/history.md", "Old historical claim\n");
    const chapter = withChapter.files.find((file) => file.path === "chapters/history.md");
    expect(chapter).toBeDefined();
    await stub.renameProjectFile(workspaceId, chapter!.id, "chapters/revisions.md");

    const revisions = await stub.listRevisions();
    expect(revisions.map((revision) => revision.reason)).toEqual([
      "project-file-rename",
      "project-file-create",
      "claim-passage-link",
      "claim-create",
      "annotation-passage-link",
      "pdf-register",
      "history-adoption",
    ]);
    const head = revisions[0]!;
    const milestone = await stub.createMilestone(head.revision, "first submission", "Exact state sent for review");
    expect(milestone).toMatchObject({ revision: head.revision, name: "first submission" });
    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.createMilestone(head.revision, "first submission")).toThrow();
    });
    await applyAuthoredSource(stub, `${initial.source}\n\nFirst rapid edit.\n`);
    const firstWorkingRevision = (await stub.listRevisions())[0]!;
    await applyAuthoredSource(stub, `${initial.source}\n\nSecond rapid edit.\n`);
    const secondWorkingRevision = (await stub.listRevisions())[0]!;
    expect(firstWorkingRevision).toMatchObject({ reason: "document-edit" });
    expect(secondWorkingRevision.revision).toBe(firstWorkingRevision.revision);
    expect((await stub.getRevision(secondWorkingRevision.revision)).source).toContain("Second rapid edit.");

    const historical = await stub.getRevision(head.revision);
    expect(historical.files).toContainEqual(expect.objectContaining({ id: chapter!.id, path: "chapters/revisions.md" }));
    expect(historical.pdfs).toHaveLength(1);
    expect(historical.claims).toContainEqual(claim);
    expect(historical.relationships).toEqual({ annotationPassages: 1, claimEvidence: 1, claimPassages: 1, comments: 0 });
    const comparison = await stub.compareRevisions(0, head.revision);
    expect(comparison.files).toContainEqual(expect.objectContaining({ id: chapter!.id, status: "added" }));
    expect(comparison.binaries).toContainEqual(expect.objectContaining({ status: "added" }));

    const beforeRestore = await stub.getSnapshot(workspaceId);
    const restored = await stub.restoreRevision(workspaceId, 0);
    expect(restored.revision).toBe(beforeRestore.revision + 1);
    expect(restored.files).toHaveLength(2);
    expect(restored.pdfs).toEqual([]);
    const afterRestore = await stub.listRevisions();
    expect(afterRestore[0]).toMatchObject({ reason: "restore:r0" });
    expect(afterRestore.find((revision) => revision.revision === head.revision)?.milestones).toEqual([milestone]);

    const seedWorkspaceId = "project-history-seed";
    const seedStub = roomStub(seedWorkspaceId);
    await seedStub.seedFromRevision(seedWorkspaceId, "Submission branch", await stub.getRevisionSeed(head.revision));
    const seeded = await seedStub.getSnapshot(seedWorkspaceId);
    expect(seeded).toMatchObject({ title: "Submission branch", revision: 0 });
    expect(seeded.files).toContainEqual(expect.objectContaining({ id: chapter!.id, path: "chapters/revisions.md" }));
    expect(seeded.links).toContainEqual(
      expect.objectContaining({ annotationId: linked.annotation.id, resolution: expect.objectContaining({ status: "resolved" }) }),
    );
    expect(seeded.claimLinks).toContainEqual(
      expect.objectContaining({ claimId: claim.id, resolution: expect.objectContaining({ status: "resolved" }) }),
    );
    expect(await seedStub.listRevisions()).toEqual([
      expect.objectContaining({ revision: 0, title: "Submission branch", reason: "seed-from-revision" }),
    ]);
  });

  it("anchors attributed comments through edits and preserves their resolved history", async () => {
    const workspaceId = "manuscript-comments";
    const stub = roomStub(workspaceId);
    const initial = await stub.getSnapshot(workspaceId);
    const excerpt = "Evidence becomes prose";
    const start = initial.source.indexOf(excerpt);
    const comment = await stub.createManuscriptComment(
      {
        fileId: initial.entryFileId,
        start,
        end: start + excerpt.length,
        excerpt,
        sourceRevision: initial.revision,
        body: "Clarify how this transition works.",
      },
      "member-1",
      "writer@example.test",
    );
    expect(comment).toMatchObject({
      authorId: "member-1",
      authorLabel: "writer@example.test",
      body: "Clarify how this transition works.",
      status: "open",
      resolution: { status: "resolved", text: excerpt, exactMatch: true },
    });

    await applyAuthoredInsertion(stub, "source", 0, "Preface.\n\n");
    const shifted = (await stub.getSnapshot(workspaceId)).comments.find((item) => item.id === comment.id);
    expect(shifted?.resolution).toMatchObject({ status: "resolved", text: excerpt, exactMatch: true });
    expect(shifted?.resolution.status === "resolved" ? shifted.resolution.start : -1).toBe(start + "Preface.\n\n".length);

    const resolved = await stub.resolveManuscriptComment(comment.id);
    expect(resolved.status).toBe("resolved");
    const commentRevision = (await stub.listRevisions()).find((revision) => revision.reason === "comment-resolve");
    expect(commentRevision).toBeDefined();
    expect((await stub.getRevision(commentRevision!.revision)).comments).toContainEqual(
      expect.objectContaining({ id: comment.id, status: "resolved" }),
    );
  });

  it("upgrades pre-comment history snapshots through migration v16", async () => {
    const workspaceId = "comment-history-migration";
    const stub = roomStub(workspaceId);
    await stub.getSnapshot(workspaceId);
    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      const revisions = state.storage.sql
        .exec<{ revision: number; snapshot_json: string }>("SELECT revision, snapshot_json FROM project_revisions")
        .toArray();
      for (const revision of revisions) {
        const snapshot = JSON.parse(revision.snapshot_json) as { tables: Record<string, unknown> };
        delete snapshot.tables.manuscript_comments;
        state.storage.sql.exec(
          "UPDATE project_revisions SET snapshot_json = ? WHERE revision = ?",
          JSON.stringify(snapshot),
          revision.revision,
        );
      }
      state.storage.sql.exec("DROP TABLE manuscript_comments");
      state.storage.sql.exec("DELETE FROM _kirjolab_migrations WHERE version >= 16");
    });

    await evictDurableObject(stub);
    expect((await stub.getSnapshot(workspaceId)).comments).toEqual([]);
    expect(await stub.getRevision(0)).toMatchObject({ comments: [], relationships: { comments: 0 } });
    expect(await migrationVersion(stub, 16)).toEqual({ version: 16, name: "anchor-collaborative-comments" });
  });

  it("persists a composed project tree and keeps inbound includes valid across renames", async () => {
    const workspaceId = "composed-project";
    const stub = roomStub(workspaceId);
    const initial = await stub.getSnapshot(workspaceId);
    const created = await stub.createProjectFile(workspaceId, "chapters/01_intro.md", "## Introduction\n\nEvidence.\n");
    const supporting = created.files.find((file) => file.path === "chapters/01_intro.md");
    expect(supporting).toBeDefined();
    const replaced = operationValue(
      await stub.replaceProjectFileContent(workspaceId, supporting!.id, "## Revised\n\nCurrent evidence.\n", created.revision),
    );
    expect(replaced.files.find((file) => file.id === supporting!.id)?.content).toBe("## Revised\n\nCurrent evidence.\n");
    expect(await stub.replaceProjectFileContent(workspaceId, supporting!.id, "stale overwrite", created.revision)).toEqual({
      ok: false,
      code: "revision-conflict",
      error: "Project changed since this edit loaded",
    });
    await applyAuthoredSource(stub, "# Study\n\n::include[chapters/01_intro.md]\n");

    const composed = await stub.getSnapshot(workspaceId);
    expect(composed.entryFileId).toBe(initial.entryFileId);
    expect(composed.composition.content).toBe("# Study\n\n## Revised\n\nCurrent evidence.\n");
    expect(composed.composition.sourceMap.some((span) => span.fileId === supporting?.id)).toBe(true);

    const renamed = await stub.renameProjectFile(workspaceId, supporting!.id, "sections/introduction.md");
    expect(renamed.source).toContain("::include[sections/introduction.md]");
    expect(renamed.composition.diagnostics).toEqual([]);
    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.deleteProjectFile(workspaceId, supporting!.id)).toThrow("inbound include");
    });

    await applyAuthoredSource(stub, "# Study\n");
    const deleted = await stub.deleteProjectFile(workspaceId, supporting!.id);
    expect(deleted.files.map((file) => file.id)).not.toContain(supporting!.id);
  });

  it("persists empty folders and moves folder trees atomically", async () => {
    const workspaceId = "foldered-project";
    const stub = roomStub(workspaceId);
    const createdFolder = await stub.createProjectFolder(workspaceId, "drafts/notes");
    const drafts = createdFolder.folders.find((folder) => folder.path === "drafts");
    expect(createdFolder.folders.map((folder) => folder.path)).toEqual(["drafts", "drafts/notes", "sections"]);
    expect(drafts).toBeDefined();

    const withFile = await stub.createProjectFile(workspaceId, "drafts/notes/detail.md", "Detail\n");
    await applyAuthoredSource(stub, "::include[drafts/notes/detail.md]\n");
    const moved = await stub.renameProjectFolder(workspaceId, drafts!.id, "chapters");
    expect(moved.folders.map((folder) => folder.path)).toEqual(["chapters", "chapters/notes", "sections"]);
    expect(moved.files.some((file) => file.path === "chapters/notes/detail.md")).toBe(true);
    expect(moved.source).toBe("::include[chapters/notes/detail.md]\n");
    expect(moved.composition.diagnostics).toEqual([]);

    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.deleteProjectFolder(workspaceId, drafts!.id)).toThrow("empty folders");
    });
    const detail = withFile.files.find((file) => file.path === "drafts/notes/detail.md");
    await applyAuthoredSource(stub, "");
    await stub.deleteProjectFile(workspaceId, detail!.id);
    const nested = (await stub.getSnapshot(workspaceId)).folders.find((folder) => folder.path === "chapters/notes");
    await stub.deleteProjectFolder(workspaceId, nested!.id);
    const cleaned = await stub.deleteProjectFolder(workspaceId, drafts!.id);
    expect(cleaned.folders.map((folder) => folder.path)).toEqual(["sections"]);
  });

  it("materializes existing path prefixes when folder migration is pending", async () => {
    const workspaceId = "project-folder-migration";
    const stub = roomStub(workspaceId);
    await stub.getSnapshot(workspaceId);
    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      const revisions = state.storage.sql
        .exec<{ revision: number; snapshot_json: string }>("SELECT revision, snapshot_json FROM project_revisions")
        .toArray();
      for (const revision of revisions) {
        const snapshot = JSON.parse(revision.snapshot_json) as { tables: Record<string, unknown> };
        delete snapshot.tables.project_folders;
        state.storage.sql.exec(
          "UPDATE project_revisions SET snapshot_json = ? WHERE revision = ?",
          JSON.stringify(snapshot),
          revision.revision,
        );
      }
      state.storage.sql.exec("DROP TABLE project_folders");
      state.storage.sql.exec("DELETE FROM _kirjolab_migrations WHERE version >= 18");
    });

    await evictDurableObject(stub);
    expect((await stub.getSnapshot(workspaceId)).folders.map((folder) => folder.path)).toEqual(["sections"]);
    expect((await stub.getRevision(0)).folders).toEqual([]);
    expect(await migrationVersion(stub, 18)).toEqual({ version: 18, name: "persist-project-folders" });
  });

  it("derives project aliases and bibliography from shared reference snapshots", async () => {
    const workspaceId = "shared-reference-project";
    const stub = roomStub(workspaceId);
    const initial = await stub.getSnapshot(workspaceId);
    const now = "2026-07-11T10:00:00.000Z";
    const reference = {
      id: crypto.randomUUID(),
      referenceKey: "doe2026",
      type: "article",
      title: "Shared Research Memory",
      authors: ["Doe, Jane"],
      year: "2026",
      venue: "Open Research",
      doi: "10.1000/shared",
      url: "https://example.test/shared",
      abstract: "Private library metadata",
      provenance: {},
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    } as const;
    const linked = await stub.linkProjectReference(workspaceId, reference, "doe2026");
    expect(linked.projectReferences[0]).toMatchObject({ referenceId: reference.id, citationAlias: "doe2026" });
    expect(linked.bibliography).toContain("@article{doe2026");
    expect(linked.projectReferences[0]?.snapshot).not.toHaveProperty("abstract");

    await applyAuthoredSource(stub, `${initial.source}\n\n:cite[doe2026]\n`);
    const renamed = await stub.renameProjectReferenceAlias(workspaceId, reference.id, "sharedMemory");
    expect(renamed.source).toContain(":cite[sharedMemory]");
    expect(renamed.bibliography).toContain("@article{sharedMemory");
    expect(await stub.unlinkProjectReference(workspaceId, reference.id)).toEqual({
      ok: false,
      code: "citation-alias-in-use",
      error: "Remove citations using this alias before unlinking the reference",
    });
    await applyAuthoredSource(stub, initial.source);
    expect(operationValue(await stub.unlinkProjectReference(workspaceId, reference.id)).projectReferences).toEqual([]);
  });

  it("pins an exact web capture and changes it only through explicit repinning", async () => {
    const workspaceId = "versioned-web-reference";
    const stub = roomStub(workspaceId);
    const now = "2026-07-12T08:00:00.000Z";
    const reference = {
      id: crypto.randomUUID(),
      referenceKey: "writer2026",
      type: "misc",
      title: "Versioned web evidence",
      authors: ["Writer, Ada"],
      year: "2026",
      venue: "Research Notes",
      doi: "",
      url: "https://example.com/article",
      abstract: "",
      provenance: {},
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    } as const;
    const first = webSnapshot(reference.id, "web-1", now, "sha256:first");
    const linked = await stub.linkProjectReference(workspaceId, reference, "webEvidence", first);
    expect(linked.projectReferences[0]?.snapshot.webSnapshot).toMatchObject({ id: "web-1", contentHash: "sha256:first" });
    expect(linked.bibliography).toContain("urldate = {2026-07-12}");

    const synced = await stub.syncProjectReference(workspaceId, { ...reference, title: "Mutable library title", updatedAt: "later" });
    expect(synced.projectReferences[0]?.snapshot).toEqual(linked.projectReferences[0]?.snapshot);

    const second = webSnapshot(reference.id, "web-2", "2026-07-13T09:30:00.000Z", "sha256:second");
    const repinned = await stub.pinProjectWebSnapshot(workspaceId, { ...reference, title: "Mutable library title" }, second);
    expect(repinned.projectReferences[0]?.snapshot).toMatchObject({
      title: "Versioned web evidence",
      webSnapshot: { id: "web-2", accessedAt: "2026-07-13T09:30:00.000Z", contentHash: "sha256:second" },
    });
    expect(repinned.bibliography).toContain("urldate = {2026-07-13}");
  });

  it("pins explicit private research snapshots and removes future access on revocation", async () => {
    const workspaceId = "explicit-research-share";
    const stub = roomStub(workspaceId);
    const share = {
      id: crypto.randomUUID(),
      projectId: workspaceId,
      referenceId: crypto.randomUUID(),
      resourceId: crypto.randomUUID(),
      kind: "note",
      content: { kind: "note", body: "Explicitly shared interpretation" },
      createdAt: "2026-07-11T10:00:00.000Z",
      revokedAt: null,
    } as const;
    const pinned = await stub.pinResearchShare(workspaceId, share);
    expect(pinned.researchShares).toEqual([share]);
    expect(await stub.getActiveResearchShare(workspaceId, share.id)).toEqual(share);
    const revoked = await stub.revokeResearchShare(workspaceId, share.id, "2026-07-11T11:00:00.000Z");
    expect(revoked.researchShares).toEqual([]);
    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.getActiveResearchShare(workspaceId, share.id)).toThrow("revoked");
    });
  });

  it("upgrades legacy offset links once and marks mismatches stale", async () => {
    const workspaceId = "legacy-anchor-migration";
    const stub = roomStub(workspaceId);
    const initial = await stub.getSnapshot(workspaceId);
    const matchingExcerpt = "Kirjolab keeps the path from an annotation to a claim";
    const matchingStart = initial.source.indexOf(matchingExcerpt);
    expect(matchingStart).toBeGreaterThanOrEqual(0);

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      state.storage.transactionSync(() => {
        state.storage.sql.exec(
          `INSERT INTO pdfs (id, name, content_type, size, object_key, fingerprint, created_at)
           VALUES ('legacy-pdf', 'legacy.pdf', 'application/pdf', 42, 'legacy/object', 'legacy-fingerprint',
                   '2025-01-01T00:00:00.000Z')`,
        );
        state.storage.sql.exec(
          `INSERT INTO annotations
           (id, pdf_id, page, quote, prefix, suffix, comment, rects_json, created_at)
           VALUES ('legacy-annotation', 'legacy-pdf', 1, 'legacy quote', '', '', '', '[]',
                   '2025-01-01T00:00:00.000Z')`,
        );
        state.storage.sql.exec(
          `INSERT INTO claims (id, text, note, created_at, updated_at)
           VALUES ('legacy-claim', 'Legacy claim', '', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')`,
        );

        state.storage.sql.exec("DROP TABLE passage_links");
        state.storage.sql.exec("DROP TABLE claim_passage_links");
        state.storage.sql.exec(`
          CREATE TABLE passage_links (
            id TEXT PRIMARY KEY,
            annotation_id TEXT NOT NULL REFERENCES annotations(id),
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            excerpt TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE TABLE claim_passage_links (
            id TEXT PRIMARY KEY,
            claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            excerpt TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
        `);
        state.storage.sql.exec(
          `INSERT INTO passage_links
           (id, annotation_id, start_offset, end_offset, excerpt, created_at)
           VALUES ('matching-link', 'legacy-annotation', ?, ?, ?, '2025-01-01T00:00:00.000Z')`,
          matchingStart,
          matchingStart + matchingExcerpt.length,
          matchingExcerpt,
        );
        state.storage.sql.exec(
          `INSERT INTO claim_passage_links
           (id, claim_id, start_offset, end_offset, excerpt, created_at)
           VALUES ('mismatching-link', 'legacy-claim', 0, 8, 'not here', '2025-01-01T00:00:00.000Z')`,
        );
        state.storage.sql.exec("DELETE FROM _kirjolab_migrations WHERE version >= 4");
      });
    });

    await evictDurableObject(stub);
    const migrated = await stub.getSnapshot(workspaceId);
    expect(migrated.links).toHaveLength(1);
    expect(migrated.links[0]).toMatchObject({
      id: "matching-link",
      anchor: {
        version: 1,
        exact: matchingExcerpt,
        originalRange: { start: matchingStart, end: matchingStart + matchingExcerpt.length },
        anchoredRevision: initial.revision,
      },
      resolution: {
        status: "resolved",
        start: matchingStart,
        end: matchingStart + matchingExcerpt.length,
        text: matchingExcerpt,
        exactMatch: true,
      },
    });
    expect(migrated.links[0]?.anchor.relativeStart).not.toBeNull();
    expect(migrated.links[0]?.anchor.relativeEnd).not.toBeNull();

    expect(migrated.claimLinks).toHaveLength(1);
    expect(migrated.claimLinks[0]).toMatchObject({
      id: "mismatching-link",
      anchor: {
        version: 1,
        relativeStart: null,
        relativeEnd: null,
        exact: "not here",
        originalRange: { start: 0, end: 8 },
        anchoredRevision: initial.revision,
      },
      resolution: { status: "stale" },
    });

    const firstMigrationState = await inspectAnchorMigrationState(stub);
    expect(firstMigrationState.versions).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(firstMigrationState.passageColumns).toEqual(expect.arrayContaining(anchorColumnNames));
    expect(firstMigrationState.claimColumns).toEqual(expect.arrayContaining(anchorColumnNames));

    await evictDurableObject(stub);
    const reloaded = await stub.getSnapshot(workspaceId);
    expect(reloaded.links).toEqual(migrated.links);
    expect(reloaded.claimLinks).toEqual(migrated.claimLinks);
    expect(await inspectAnchorMigrationState(stub)).toEqual(firstMigrationState);
  });

  it("projects the default canonical bibliography on first activation", async () => {
    const snapshot = await roomStub("default-bibliography").getSnapshot("default-bibliography");

    expect(snapshot.publications).toEqual([
      expect.objectContaining({
        citationKey: "merton1942",
        type: "article",
        title: "The Normative Structure of Science",
        authors: ["Merton, Robert K."],
        year: "1942",
        venue: "The Sociology of Science",
        doi: "",
        metadataSource: "bibtex",
      }),
    ]);
  });

  it("adds the publication-PDF link table when migration v7 is pending", async () => {
    const workspaceId = "publication-pdf-link-migration";
    const stub = roomStub(workspaceId);
    await stub.getSnapshot(workspaceId);

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      state.storage.transactionSync(() => {
        state.storage.sql.exec("DROP TABLE publication_pdf_links");
        state.storage.sql.exec("DELETE FROM _kirjolab_migrations WHERE version >= 7");
      });
    });

    await evictDurableObject(stub);
    expect((await stub.getSnapshot(workspaceId)).publicationPdfLinks).toEqual([]);
    expect(await migrationVersion(stub, 7)).toEqual({ version: 7, name: "add-publication-pdf-links" });
    expect(await runInDurableObject(stub, (_instance: DocumentRoom, state) => tableColumns(state, "publication_pdf_links"))).toEqual([
      "id",
      "publication_id",
      "pdf_id",
      "created_at",
    ]);
  });

  it("replaces legacy whole-document candidates when migration v8 is pending", async () => {
    const workspaceId = "targeted-candidate-migration";
    const stub = roomStub(workspaceId);
    await stub.getSnapshot(workspaceId);

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      state.storage.transactionSync(() => {
        state.storage.sql.exec(`
          DROP TABLE candidates;
          CREATE TABLE candidates (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            source_revision INTEGER NOT NULL,
            source_ids TEXT NOT NULL,
            proposed_source TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
            created_at TEXT NOT NULL
          );
          INSERT INTO candidates
          (id, provider, model, source_revision, source_ids, proposed_source, status, created_at)
          VALUES ('legacy-candidate', 'legacy-provider', 'legacy-model', 0, '[]', '# Legacy whole document', 'pending',
                  '2025-01-01T00:00:00.000Z');
          DELETE FROM _kirjolab_migrations WHERE version >= 8;
        `);
      });
    });

    await evictDurableObject(stub);
    expect((await stub.getSnapshot(workspaceId)).candidates).toEqual([]);
    expect(await migrationVersion(stub, 8)).toEqual({ version: 8, name: "replace-whole-document-candidates" });
    expect(await runInDurableObject(stub, (_instance: DocumentRoom, state) => tableColumns(state, "candidates"))).toEqual([
      "id",
      "operation",
      "prompt_version",
      "provider_adapter",
      "provider_label",
      "model",
      "instruction",
      "source_revision",
      "start_offset",
      "end_offset",
      "excerpt",
      "anchor_version",
      "relative_start",
      "relative_end",
      "quote_prefix",
      "quote_suffix",
      "anchored_revision",
      "evidence_json",
      "proposed_replacement",
      "status",
      "created_at",
      "project_file_id",
    ]);
  });

  it("persists explicit many-to-many publication-PDF links and unlinks only the association", async () => {
    const workspaceId = "publication-pdf-links";
    const stub = roomStub(workspaceId);
    const imported = await stub.importBibliography(
      workspaceId,
      `@article{second2026,
        title = {A second publication},
        author = {Hopper, Grace},
        year = {2026}
      }`,
    );
    const firstPublication = publicationByKey(imported, "merton1942");
    const secondPublication = publicationByKey(imported, "second2026");
    const firstPdf = pdfResource("first-paper.pdf");
    const secondPdf = pdfResource("supplement.pdf");
    await stub.registerPdf(firstPdf);
    await stub.registerPdf(secondPdf);

    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.createPublicationPdfLink({ publicationId: crypto.randomUUID(), pdfId: firstPdf.id })).toThrow(
        "Publication not found",
      );
      expect(() => instance.createPublicationPdfLink({ publicationId: firstPublication.id, pdfId: crypto.randomUUID() })).toThrow(
        "PDF not found",
      );
    });

    const primaryLink = await stub.createPublicationPdfLink({ publicationId: firstPublication.id, pdfId: firstPdf.id });
    const supplementLink = await stub.createPublicationPdfLink({ publicationId: firstPublication.id, pdfId: secondPdf.id });
    const sharedArtifactLink = await stub.createPublicationPdfLink({ publicationId: secondPublication.id, pdfId: firstPdf.id });
    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.createPublicationPdfLink({ publicationId: firstPublication.id, pdfId: firstPdf.id })).toThrow(
        "Publication/PDF link already exists",
      );
    });

    const annotation = await stub.createAnnotation({
      pdfId: firstPdf.id,
      page: 1,
      quote: "Durable evidence",
      prefix: "",
      suffix: "",
      comment: "Preserve this annotation",
      rects: [],
    });
    await evictDurableObject(stub);
    const persisted = await stub.getSnapshot(workspaceId);
    expect(persisted.publicationPdfLinks).toEqual(expect.arrayContaining([primaryLink, supplementLink, sharedArtifactLink]));

    await stub.deletePublicationPdfLink(primaryLink.id);
    const unlinked = await stub.getSnapshot(workspaceId);
    expect(unlinked.publicationPdfLinks).toEqual(expect.arrayContaining([supplementLink, sharedArtifactLink]));
    expect(unlinked.publicationPdfLinks).not.toContainEqual(primaryLink);
    expect(unlinked.publications).toEqual(expect.arrayContaining([firstPublication, secondPublication]));
    expect(unlinked.pdfs).toEqual(expect.arrayContaining([firstPdf, secondPdf]));
    expect(unlinked.annotations).toContainEqual(annotation);
    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.deletePublicationPdfLink(primaryLink.id)).toThrow("Publication/PDF link not found");
    });
  });

  it("atomically identifies a PDF by DOI and treats retries as idempotent", async () => {
    const workspaceId = "doi-intake";
    const stub = roomStub(workspaceId);
    const pdf = pdfResource("identified.pdf");
    await stub.registerPdf(pdf);

    const preview = await stub.previewPublicationIntake(pdf.id, acceptedMetadata, "a".repeat(64));
    expect(preview).toMatchObject({
      pdfId: pdf.id,
      doi: "10.5555/kirjolab.1",
      citationKey: "lovelace2025",
      existingPublicationId: null,
    });

    const created = await stub.acceptPublicationIntake(pdf.id, preview.citationKey, acceptedMetadata);
    expect(created).toMatchObject({ publicationCreated: true, linkCreated: true });
    expect(created.publication).toMatchObject({
      citationKey: "lovelace2025",
      type: "article",
      doi: "10.5555/kirjolab.1",
      metadataSource: "crossref",
    });
    expect(created.link).toMatchObject({ publicationId: created.publication.id, pdfId: pdf.id });

    const accepted = await stub.getSnapshot(workspaceId);
    expect(accepted.bibliography).toContain("@article{lovelace2025,");
    expect(accepted.publicationPdfLinks).toEqual([created.link]);
    const retry = await stub.acceptPublicationIntake(pdf.id, "ignored-on-existing-doi", acceptedMetadata);
    expect(retry).toEqual({
      publication: created.publication,
      link: created.link,
      publicationCreated: false,
      linkCreated: false,
    });
    expect(await stub.getSnapshot(workspaceId)).toEqual(accepted);

    await evictDurableObject(stub);
    expect(await stub.getSnapshot(workspaceId)).toEqual(accepted);
  });

  it("reuses DOI identity without overwriting authored metadata", async () => {
    const workspaceId = "doi-intake-existing";
    const stub = roomStub(workspaceId);
    const imported = await stub.importBibliography(
      workspaceId,
      `@article{authored2024,
        title = {Researcher-authored title},
        author = {Author, Human},
        year = {2024},
        doi = {10.5555/kirjolab.1}
      }`,
    );
    const authored = publicationByKey(imported, "authored2024");
    const pdf = pdfResource("existing.pdf");
    await stub.registerPdf(pdf);
    const before = await stub.getSnapshot(workspaceId);

    const accepted = await stub.acceptPublicationIntake(pdf.id, "new-key-is-ignored", acceptedMetadata);
    expect(accepted).toMatchObject({
      publication: { id: authored.id, citationKey: "authored2024", title: "Researcher-authored title", metadataSource: "bibtex" },
      publicationCreated: false,
      linkCreated: true,
    });
    const after = await stub.getSnapshot(workspaceId);
    expect(after.revision).toBe(before.revision);
    expect(after.bibliography).toBe(before.bibliography);
    expect(after.publications).toContainEqual(accepted.publication);
  });

  it("rolls DOI intake back when the atomic artifact link fails", async () => {
    const workspaceId = "doi-intake-rollback";
    const stub = roomStub(workspaceId);
    const pdf = pdfResource("rollback.pdf");
    await stub.registerPdf(pdf);
    const before = await stub.getSnapshot(workspaceId);

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER reject_doi_intake_link
        BEFORE INSERT ON publication_pdf_links
        WHEN NEW.pdf_id = '${pdf.id}'
        BEGIN
          SELECT RAISE(ABORT, 'blocked DOI intake link');
        END;
      `);
    });

    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.acceptPublicationIntake(pdf.id, "rollback2025", acceptedMetadata)).toThrow("blocked DOI intake link");
    });
    expect(await stub.getSnapshot(workspaceId)).toEqual(before);
    await evictDurableObject(stub);
    expect(await stub.getSnapshot(workspaceId)).toEqual(before);
  });

  it("rejects DOI intake citation-key collisions without mutation", async () => {
    const workspaceId = "doi-intake-collision";
    const stub = roomStub(workspaceId);
    const pdf = pdfResource("collision.pdf");
    await stub.registerPdf(pdf);
    const before = await stub.getSnapshot(workspaceId);
    const metadata = { ...acceptedMetadata, doi: "10.5555/different" };

    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.acceptPublicationIntake(pdf.id, "merton1942", metadata)).toThrow("Citation key already exists");
    });
    expect(await stub.getSnapshot(workspaceId)).toEqual(before);
  });

  it("creates an annotation and manuscript passage link in one durable mutation", async () => {
    const workspaceId = "atomic-annotation-link";
    const stub = roomStub(workspaceId);
    const initial = await stub.getSnapshot(workspaceId);
    const pdf = pdfResource("atomic-evidence.pdf");
    await stub.registerPdf(pdf);
    const excerpt = "Kirjolab keeps the path from an annotation to a claim";
    const start = initial.source.indexOf(excerpt);
    expect(start).toBeGreaterThanOrEqual(0);

    const created = await stub.createAnnotationLink({
      annotation: {
        pdfId: pdf.id,
        page: 2,
        quote: "Evidence remains inspectable.",
        prefix: "Before",
        suffix: "After",
        comment: "Atomic evidence",
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
      },
      passage: {
        fileId: initial.entryFileId,
        start,
        end: start + excerpt.length,
        excerpt,
        sourceRevision: initial.revision,
      },
    });

    expect(created.link.annotationId).toBe(created.annotation.id);
    expect(created.link.resolution).toMatchObject({
      status: "resolved",
      start,
      end: start + excerpt.length,
      text: excerpt,
      exactMatch: true,
    });
    const snapshot = await stub.getSnapshot(workspaceId);
    expect(snapshot.annotations).toContainEqual(created.annotation);
    expect(snapshot.links).toContainEqual(created.link);
  });

  it("adds, edits, erases, and deletes auto-saved highlight strokes", async () => {
    const workspaceId = "editable-highlight-strokes";
    const stub = roomStub(workspaceId);
    const pdf = pdfResource("editable-highlights.pdf");
    await stub.registerPdf(pdf);
    const annotation = await stub.createAnnotation({
      pdfId: pdf.id,
      page: 1,
      quote: "First selected idea.",
      prefix: "Before first",
      suffix: "After first",
      comment: "",
      rects: [{ x: 0.1, y: 0.2, width: 0.25, height: 0.04 }],
    });
    expect(annotation.fragments).toHaveLength(1);

    const extended = await stub.appendAnnotationFragment(annotation.id, {
      page: 1,
      quote: "Second selected idea.",
      prefix: "Before second",
      suffix: "After second",
      rects: [{ x: 0.1, y: 0.25, width: 0.3, height: 0.04 }],
    });
    expect(extended.quote).toBe("First selected idea. … Second selected idea.");
    expect(extended.rects).toHaveLength(2);
    expect(extended.fragments).toHaveLength(2);
    expect(extended.updatedAt).not.toBe("");

    const noted = await stub.updateAnnotation(annotation.id, { comment: "Reusable synthesis note" });
    expect(noted.comment).toBe("Reusable synthesis note");
    const adjusted = await stub.updateAnnotationFragment(annotation.id, extended.fragments[0]!.id, {
      quote: "Corrected first idea.",
      prefix: "Before first",
      suffix: "After first",
      rects: [{ x: 0.095, y: 0.2, width: 0.26, height: 0.04 }],
    });
    expect(adjusted.fragments[0]).toMatchObject({ quote: "Corrected first idea.", rects: [{ x: 0.095, width: 0.26 }] });
    const erased = await stub.removeAnnotationFragment(annotation.id, extended.fragments[1]?.id ?? "missing");
    expect(erased?.quote).toBe("Corrected first idea.");
    expect(erased?.fragments).toHaveLength(1);

    await stub.deleteAnnotation(annotation.id);
    expect((await stub.getSnapshot(workspaceId)).annotations).toEqual([]);
  });

  it("persists neither resource when an atomic annotation link uses a stale passage", async () => {
    const workspaceId = "stale-atomic-annotation-link";
    const stub = roomStub(workspaceId);
    const initial = await stub.getSnapshot(workspaceId);
    const pdf = pdfResource("stale-evidence.pdf");
    await stub.registerPdf(pdf);
    const accepted = await stub.getSnapshot(workspaceId);
    const excerpt = "Kirjolab keeps the path from an annotation to a claim";
    const start = initial.source.indexOf(excerpt);
    expect(start).toBeGreaterThanOrEqual(0);

    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() =>
        instance.createAnnotationLink({
          annotation: {
            pdfId: pdf.id,
            page: 1,
            quote: "This row must not persist.",
            prefix: "",
            suffix: "",
            comment: "Stale evidence",
            rects: [],
          },
          passage: {
            fileId: initial.entryFileId,
            start,
            end: start + excerpt.length,
            excerpt,
            sourceRevision: initial.revision + 1,
          },
        }),
      ).toThrow("Document selection is stale");
    });

    const rejected = await stub.getSnapshot(workspaceId);
    expect(rejected.annotations).toEqual(accepted.annotations);
    expect(rejected.links).toEqual(accepted.links);
  });

  it("persists a targeted candidate with server-derived typed evidence and a durable Yjs target", async () => {
    const workspaceId = "targeted-candidate-persistence";
    const stub = roomStub(workspaceId);
    const fixture = await modelCandidateFixture(stub, workspaceId);
    const before = await stub.getSnapshot(workspaceId);

    const candidate = operationValue(await stub.createCandidate(fixture.input));

    expect(candidate).toMatchObject({
      operation: "revise-selection",
      promptVersion: "revise-selection-v1",
      providerAdapter: "openai-compatible",
      providerLabel: "Workers test provider",
      model: "workers-test-model",
      instruction: "Make this passage more precise.",
      sourceRevision: before.revision,
      proposedReplacement: fixture.replacement,
      status: "pending",
      target: {
        anchor: {
          version: 1,
          exact: fixture.excerpt,
          originalRange: { start: fixture.start, end: fixture.start + fixture.excerpt.length },
          anchoredRevision: before.revision,
        },
        resolution: {
          status: "resolved",
          start: fixture.start,
          end: fixture.start + fixture.excerpt.length,
          text: fixture.excerpt,
          exactMatch: true,
        },
      },
    });
    expect(candidate.target.anchor.relativeStart).not.toBeNull();
    expect(candidate.target.anchor.relativeEnd).not.toBeNull();
    const { fragments: _fragments, updatedAt: annotationVersion, ...annotationEvidence } = fixture.annotation;
    expect(candidate.evidence).toEqual([
      { kind: "annotation", version: annotationVersion, updatedAt: annotationVersion, ...annotationEvidence },
      { kind: "claim", version: fixture.claim.updatedAt, ...fixture.claim },
    ]);

    const created = await stub.getSnapshot(workspaceId);
    expect(created.source).toBe(before.source);
    expect(created.revision).toBe(before.revision);
    expect(created.candidates).toEqual([candidate]);

    await evictDurableObject(stub);
    expect((await stub.getSnapshot(workspaceId)).candidates).toEqual([candidate]);
  });

  it("persists no candidate for stale evidence, target text, or revision", async () => {
    const workspaceId = "targeted-candidate-stale-input";
    const stub = roomStub(workspaceId);
    const fixture = await modelCandidateFixture(stub, workspaceId);
    const annotationEvidence = fixture.input.evidence[0];
    const claimEvidence = fixture.input.evidence[1];
    if (!annotationEvidence || !claimEvidence) throw new Error("Expected model evidence references");

    for (const result of [
      await stub.createCandidate({
        ...fixture.input,
        evidence: [{ ...annotationEvidence, version: "stale-annotation-version" }],
      }),
      await stub.createCandidate({
        ...fixture.input,
        evidence: [{ ...claimEvidence, version: "stale-claim-version" }],
      }),
    ]) {
      expect(result).toEqual({ ok: false, code: "evidence-stale", error: "Model evidence is stale; generate a new revision" });
    }
    expect(
      await stub.createCandidate({
        ...fixture.input,
        evidence: [{ kind: "annotation", id: crypto.randomUUID(), version: "missing" }],
      }),
    ).toEqual({ ok: false, code: "evidence-not-found", error: "Model evidence annotation not found" });
    for (const target of [
      { ...fixture.input.target, excerpt: "The target no longer matches." },
      { ...fixture.input.target, sourceRevision: fixture.input.target.sourceRevision + 1 },
    ]) {
      expect(await stub.createCandidate({ ...fixture.input, target })).toEqual({
        ok: false,
        code: "source-stale",
        error: "Candidate source is stale; generate a new revision",
      });
    }

    expect((await stub.getSnapshot(workspaceId)).candidates).toEqual([]);
    expect(await runInDurableObject(stub, (_instance: DocumentRoom, state) => candidateRowCount(state))).toBe(0);
  });

  it("applies only the targeted splice and preserves surrounding manuscript anchors", async () => {
    const workspaceId = "targeted-candidate-apply";
    const stub = roomStub(workspaceId);
    const fixture = await modelCandidateFixture(stub, workspaceId);
    const beforeAnchorText = "Kirjolab keeps";
    const afterAnchorText = "into cited prose visible";
    const beforeAnchorStart = fixture.snapshot.source.indexOf(beforeAnchorText);
    const afterAnchorStart = fixture.snapshot.source.indexOf(afterAnchorText);
    const beforeLink = await stub.createPassageLink({
      annotationId: fixture.annotation.id,
      fileId: fixture.snapshot.entryFileId,
      start: beforeAnchorStart,
      end: beforeAnchorStart + beforeAnchorText.length,
      excerpt: beforeAnchorText,
      sourceRevision: fixture.snapshot.revision,
    });
    const afterLink = await stub.createPassageLink({
      annotationId: fixture.annotation.id,
      fileId: fixture.snapshot.entryFileId,
      start: afterAnchorStart,
      end: afterAnchorStart + afterAnchorText.length,
      excerpt: afterAnchorText,
      sourceRevision: fixture.snapshot.revision,
    });
    const candidate = operationValue(await stub.createCandidate(fixture.input));
    const expectedSource = `${fixture.snapshot.source.slice(0, fixture.start)}${fixture.replacement}${fixture.snapshot.source.slice(
      fixture.start + fixture.excerpt.length,
    )}`;

    const applied = await stub.applyCandidate(workspaceId, candidate.id);

    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error);
    expect(applied.snapshot.source).toBe(expectedSource);
    expect(applied.snapshot.revision).toBe(fixture.snapshot.revision + 1);
    expect(applied.snapshot.candidates.find((item) => item.id === candidate.id)?.status).toBe("accepted");
    expect(applied.snapshot.links.find((link) => link.id === beforeLink.id)?.resolution).toMatchObject({
      status: "resolved",
      start: beforeAnchorStart,
      end: beforeAnchorStart + beforeAnchorText.length,
      text: beforeAnchorText,
      exactMatch: true,
    });
    const shiftedAfterStart = afterAnchorStart + fixture.replacement.length - fixture.excerpt.length;
    expect(applied.snapshot.links.find((link) => link.id === afterLink.id)?.resolution).toMatchObject({
      status: "resolved",
      start: shiftedAfterStart,
      end: shiftedAfterStart + afterAnchorText.length,
      text: afterAnchorText,
      exactMatch: true,
    });
  });

  it("rejects stale application and permits rejecting the unchanged pending candidate", async () => {
    const workspaceId = "targeted-candidate-stale-apply";
    const stub = roomStub(workspaceId);
    const fixture = await modelCandidateFixture(stub, workspaceId);
    const candidate = operationValue(await stub.createCandidate(fixture.input));
    const remotelyEditedSource = `${fixture.snapshot.source}\nA collaborator changes unrelated prose.\n`;
    await applyAuthoredSource(stub, remotelyEditedSource);
    const afterRemoteEdit = await stub.getSnapshot(workspaceId);

    await expect(stub.applyCandidate(workspaceId, candidate.id)).resolves.toEqual({
      ok: false,
      error: "Candidate is stale; generate a new revision",
    });
    const afterFailedApply = await stub.getSnapshot(workspaceId);
    expect(afterFailedApply.source).toBe(remotelyEditedSource);
    expect(afterFailedApply.revision).toBe(afterRemoteEdit.revision);
    expect(afterFailedApply.candidates.find((item) => item.id === candidate.id)?.status).toBe("pending");

    const rejected = await stub.rejectCandidate(candidate.id);
    expect(rejected.status).toBe("rejected");
    const afterReject = await stub.getSnapshot(workspaceId);
    expect(afterReject.source).toBe(remotelyEditedSource);
    expect(afterReject.revision).toBe(afterRemoteEdit.revision);
    expect(afterReject.candidates.find((item) => item.id === candidate.id)?.status).toBe("rejected");
  });

  it("accepts a no-op targeted candidate without advancing the manuscript revision", async () => {
    const workspaceId = "targeted-candidate-no-op";
    const stub = roomStub(workspaceId);
    const fixture = await modelCandidateFixture(stub, workspaceId);
    const candidate = operationValue(await stub.createCandidate({ ...fixture.input, proposedReplacement: fixture.excerpt }));

    const applied = await stub.applyCandidate(workspaceId, candidate.id);

    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error);
    expect(applied.snapshot.source).toBe(fixture.snapshot.source);
    expect(applied.snapshot.revision).toBe(fixture.snapshot.revision);
    expect(applied.snapshot.candidates.find((item) => item.id === candidate.id)?.status).toBe("accepted");
  });

  it("rolls Yjs, materialized source, revision, and status back when candidate acceptance fails", async () => {
    const workspaceId = "targeted-candidate-rollback";
    const stub = roomStub(workspaceId);
    const fixture = await modelCandidateFixture(stub, workspaceId);
    const candidate = operationValue(await stub.createCandidate(fixture.input));
    const beforeApply = await stub.getSnapshot(workspaceId);
    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER reject_candidate_acceptance
        BEFORE UPDATE OF status ON candidates
        WHEN NEW.status = 'accepted'
        BEGIN
          SELECT RAISE(ABORT, 'blocked candidate acceptance');
        END;
      `);
    });

    await runInDurableObject(stub, (instance: DocumentRoom) => {
      expect(() => instance.applyCandidate(workspaceId, candidate.id)).toThrow("blocked candidate acceptance");
    });
    expect(await stub.getSnapshot(workspaceId)).toEqual(beforeApply);

    await evictDurableObject(stub);
    expect(await stub.getSnapshot(workspaceId)).toEqual(beforeApply);
  });

  it("projects a persisted canonical bibliography when migration v6 is pending", async () => {
    const workspaceId = "persisted-bibliography-migration";
    const stub = roomStub(workspaceId);
    const customBibliography = `@article{durable2026,
      title = {Durable canonical bibliography},
      author = {Hopper, Grace},
      year = {2026},
      journal = {Persistent Knowledge},
      doi = {https://doi.org/10.5555/DURABLE.2026}
    }
`;
    await stub.getSnapshot(workspaceId);

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      const row = state.storage.sql.exec<WorkspaceStateRow>("SELECT y_state FROM workspace WHERE id = 1").one();
      const document = new Y.Doc();
      Y.applyUpdate(document, new Uint8Array(row.y_state), "test-bootstrap");
      const bibliography = document.getText("bibliography");
      document.transact(() => {
        if (bibliography.length > 0) bibliography.delete(0, bibliography.length);
        bibliography.insert(0, customBibliography);
      }, "pre-v6-state");
      const persistedState = copyArrayBuffer(Y.encodeStateAsUpdate(document));

      state.storage.transactionSync(() => {
        state.storage.sql.exec("UPDATE workspace SET y_state = ?, bibliography = ? WHERE id = 1", persistedState, customBibliography);
        state.storage.sql.exec("DELETE FROM publications");
        state.storage.sql.exec("DELETE FROM _kirjolab_migrations WHERE version >= 6");
      });
      document.destroy();
    });

    await evictDurableObject(stub);
    const migrated = await stub.getSnapshot(workspaceId);
    expect(migrated.bibliography).toBe(customBibliography);
    expect(migrated.publications).toEqual([
      expect.objectContaining({
        citationKey: "durable2026",
        type: "article",
        title: "Durable canonical bibliography",
        authors: ["Hopper, Grace"],
        year: "2026",
        venue: "Persistent Knowledge",
        doi: "10.5555/durable.2026",
        metadataSource: "bibtex",
      }),
    ]);
    const firstLedger = await migrationVersion(stub, 6);
    expect(firstLedger).toEqual({ version: 6, name: "project-canonical-bibliography" });

    await evictDurableObject(stub);
    expect(await stub.getSnapshot(workspaceId)).toEqual(migrated);
    expect(await migrationVersion(stub, 6)).toEqual(firstLedger);
  });

  it("rolls the document and projection back atomically when publication storage fails", async () => {
    const workspaceId = "projection-rollback";
    const stub = roomStub(workspaceId);
    const accepted = await stub.getSnapshot(workspaceId);

    await runInDurableObject(stub, (_instance: DocumentRoom, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER reject_blocked_publication
        BEFORE INSERT ON publications
        WHEN NEW.citation_key = 'blocked2026'
        BEGIN
          SELECT RAISE(ABORT, 'blocked publication projection');
        END;
      `);
    });

    await applyAuthoredBibliography(
      stub,
      `${accepted.bibliography}
      @article{blocked2026,
        title = {This projection must roll back},
        author = {Rollback, Atomic},
        year = {2026}
      }`,
    );

    expect(await stub.getSnapshot(workspaceId)).toEqual(accepted);
    await evictDurableObject(stub);
    expect(await stub.getSnapshot(workspaceId)).toEqual(accepted);
  });

  it("keeps publication identity and preserves an exact Crossref no-op until an authored edit", async () => {
    const workspaceId = "publication-provenance";
    const stub = roomStub(workspaceId);
    const imported = await stub.importBibliography(
      workspaceId,
      `@article{lovelace2025,
        title = {Initial authored title},
        author = {Lovelace, Ada},
        year = {2024},
        journal = {Notes},
        doi = {10.5555/kirjolab.1}
      }`,
    );
    const original = publicationByKey(imported, "lovelace2025");

    const enriched = publicationByKey(await stub.enrichPublication(workspaceId, original.id, acceptedMetadata), "lovelace2025");
    expect(enriched.id).toBe(original.id);
    expect(enriched.metadataSource).toBe("crossref");
    expect(Date.parse(enriched.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));

    const exactNoOp = publicationByKey(await stub.enrichPublication(workspaceId, original.id, acceptedMetadata), "lovelace2025");
    expect(exactNoOp).toEqual(enriched);

    await applyAuthoredBibliography(
      stub,
      `@article{lovelace2025,
        title = {Author corrected title},
        author = {Lovelace, Ada and Hopper, Grace},
        year = {2025},
        journal = {Journal of Durable Knowledge},
        doi = {10.5555/kirjolab.1},
        url = {https://example.test/accepted},
        abstract = {Metadata accepted from the explicit enrichment flow.}
      }`,
    );
    const authored = publicationByKey(await stub.getSnapshot(workspaceId), "lovelace2025");
    expect(authored.id).toBe(original.id);
    expect(authored.title).toBe("Author corrected title");
    expect(authored.metadataSource).toBe("bibtex");
    expect(Date.parse(authored.updatedAt)).toBeGreaterThan(Date.parse(exactNoOp.updatedAt));
  });

  it("does not retain Crossref provenance when a later duplicate DOI projection overwrites it", async () => {
    const workspaceId = "duplicate-doi-provenance";
    const stub = roomStub(workspaceId);
    await stub.getSnapshot(workspaceId);
    await applyAuthoredBibliography(
      stub,
      `@article{accepted2025,
        title = {First authored value},
        author = {Lovelace, Ada},
        year = {2024},
        journal = {Notes},
        doi = {10.5555/kirjolab.1}
      }

      @article{Accepted2025,
        title = {Later authored duplicate},
        author = {Turing, Alan},
        year = {2026},
        journal = {Authored Proceedings},
        doi = {10.5555/kirjolab.1}
      }`,
    );

    const beforeEnrichment = publicationByKey(await stub.getSnapshot(workspaceId), "Accepted2025");
    expect(beforeEnrichment.metadataSource).toBe("bibtex");

    const snapshot = await stub.enrichPublication(workspaceId, beforeEnrichment.id, acceptedMetadata);
    const duplicateDoiPublications = snapshot.publications.filter((publication) => publication.doi === "10.5555/kirjolab.1");
    expect(duplicateDoiPublications).toEqual([
      expect.objectContaining({
        id: beforeEnrichment.id,
        citationKey: "Accepted2025",
        title: "Later authored duplicate",
        metadataSource: "bibtex",
      }),
    ]);
    expect(snapshot.bibliography).toContain("@article{accepted2025,");
    expect(snapshot.bibliography).toContain("title = {Accepted metadata title}");
    expect(snapshot.bibliography).toContain("@article{Accepted2025,");
    expect(Date.parse(duplicateDoiPublications[0]?.updatedAt ?? "")).toBeGreaterThan(Date.parse(beforeEnrichment.updatedAt));
  });
});

function webSnapshot(referenceId: string, id: string, accessedAt: string, contentHash: string) {
  return {
    id,
    referenceId,
    requestedUrl: "https://example.com/article",
    finalUrl: "https://example.com/article",
    accessedAt,
    status: 200,
    contentType: "text/html",
    rawObjectKey: `libraries/owner/web/${id}/raw`,
    readableObjectKey: `libraries/owner/web/${id}/readable.txt`,
    rawSize: 100,
    readableSize: 50,
    contentHash,
    title: "Versioned web evidence",
    authors: ["Writer, Ada"],
    publisher: "Research Notes",
    publishedAt: "2026-07-12",
    complete: true,
    diagnostics: [],
    redirectChain: [],
    etag: `"${id}"`,
    lastModified: accessedAt,
  } as const;
}

const anchorColumnNames = ["anchor_version", "relative_start", "relative_end", "quote_prefix", "quote_suffix", "anchored_revision"];

function roomStub(name: string): DurableObjectStub<DocumentRoom> {
  return env.DOCUMENT_ROOMS.getByName(`${name}-${crypto.randomUUID()}`);
}

function migrationRows(state: DurableObjectState): MigrationLedgerRow[] {
  return state.storage.sql.exec<MigrationLedgerRow>("SELECT version, name FROM _kirjolab_migrations ORDER BY version ASC").toArray();
}

async function migrationVersion(stub: DurableObjectStub<DocumentRoom>, version: number): Promise<MigrationLedgerRow | undefined> {
  return await runInDurableObject(stub, (_instance: DocumentRoom, state) => migrationRows(state).find((row) => row.version === version));
}

async function inspectAnchorMigrationState(stub: DurableObjectStub<DocumentRoom>): Promise<{
  versions: number[];
  passageColumns: string[];
  claimColumns: string[];
}> {
  return await runInDurableObject(stub, (_instance: DocumentRoom, state) => ({
    versions: migrationRows(state)
      .filter((row) => row.version <= 7)
      .map((row) => row.version),
    passageColumns: tableColumns(state, "passage_links"),
    claimColumns: tableColumns(state, "claim_passage_links"),
  }));
}

function tableColumns(
  state: DurableObjectState,
  table: "passage_links" | "claim_passage_links" | "publication_pdf_links" | "candidates",
): string[] {
  return state.storage.sql
    .exec<TableColumnRow>(`PRAGMA table_info(${table})`)
    .toArray()
    .map((row) => row.name);
}

async function modelCandidateFixture(
  stub: DurableObjectStub<DocumentRoom>,
  workspaceId: string,
): Promise<{
  snapshot: WorkspaceSnapshot;
  annotation: WorkspaceSnapshot["annotations"][number];
  claim: WorkspaceSnapshot["claims"][number];
  excerpt: string;
  replacement: string;
  start: number;
  input: CreateCandidateInput;
}> {
  const initial = await stub.getSnapshot(workspaceId);
  const pdf = pdfResource("model-evidence.pdf");
  await stub.registerPdf(pdf);
  const annotation = await stub.createAnnotation({
    pdfId: pdf.id,
    page: 3,
    quote: "Inspectable evidence supports a focused revision.",
    prefix: "Before the evidence",
    suffix: "after the evidence",
    comment: "Ground the model operation",
    rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
  });
  const claim = await stub.createClaim({
    text: "Focused evidence makes revisions reviewable.",
    note: "A human-authored synthesis",
    evidence: [{ annotationId: annotation.id, relation: "supports" }],
  });
  const snapshot = await stub.getSnapshot(workspaceId);
  const excerpt = "the path from an annotation to a claim";
  const replacement = "the path from inspectable evidence to a defensible claim";
  const start = snapshot.source.indexOf(excerpt);
  if (start < 0) throw new Error("Expected the targeted manuscript passage");
  const input: CreateCandidateInput = {
    providerAdapter: "openai-compatible",
    providerLabel: "Workers test provider",
    model: "workers-test-model",
    promptVersion: "revise-selection-v1",
    instruction: "Make this passage more precise.",
    target: {
      fileId: snapshot.entryFileId,
      start,
      end: start + excerpt.length,
      excerpt,
      sourceRevision: snapshot.revision,
    },
    evidence: [
      { kind: "annotation", id: annotation.id, version: annotation.createdAt },
      { kind: "claim", id: claim.id, version: claim.updatedAt },
    ],
    proposedReplacement: replacement,
  };
  expect(snapshot.source).toBe(initial.source);
  expect(snapshot.revision).toBe(initial.revision);
  return { snapshot, annotation, claim, excerpt, replacement, start, input };
}

function candidateRowCount(state: DurableObjectState): number {
  return state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM candidates").one().count;
}

function pdfResource(name: string): WorkspaceSnapshot["pdfs"][number] {
  const id = crypto.randomUUID();
  return {
    id,
    name,
    contentType: "application/pdf",
    size: 42,
    objectKey: `publication-pdf-links/${id}.pdf`,
    fingerprint: `test:${id}`,
    createdAt: new Date().toISOString(),
  };
}

function publicationByKey(snapshot: WorkspaceSnapshot, citationKey: string): WorkspaceSnapshot["publications"][number] {
  const publication = snapshot.publications.find((candidate) => candidate.citationKey === citationKey);
  if (!publication) throw new Error(`Expected publication ${citationKey}`);
  return publication;
}

async function applyAuthoredBibliography(stub: DurableObjectStub<DocumentRoom>, nextBibliography: string): Promise<void> {
  await applyAuthoredText(stub, "bibliography", nextBibliography);
}

async function applyAuthoredSource(stub: DurableObjectStub<DocumentRoom>, nextSource: string): Promise<void> {
  await applyAuthoredText(stub, "source", nextSource);
}

async function applyAuthoredText(stub: DurableObjectStub<DocumentRoom>, name: string, nextValue: string): Promise<void> {
  await runInDurableObject(stub, (instance: DocumentRoom, state) => {
    const row = state.storage.sql.exec<WorkspaceStateRow>("SELECT y_state FROM workspace WHERE id = 1").one();
    const document = new Y.Doc();
    Y.applyUpdate(document, new Uint8Array(row.y_state), "test-bootstrap");
    const stateVector = Y.encodeStateVector(document);
    const text = document.getText(name);
    document.transact(() => {
      if (text.length > 0) text.delete(0, text.length);
      text.insert(0, nextValue);
    }, "authored-test-edit");
    const update = copyArrayBuffer(Y.encodeStateAsUpdate(document, stateVector));

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    state.acceptWebSocket(server);
    client.accept();
    instance.webSocketMessage(server, update);
    if (server.readyState === WebSocket.OPEN) server.close(1000, "test edit complete");
    if (client.readyState === WebSocket.OPEN) client.close(1000, "test edit complete");
    document.destroy();
  });
}

async function applyAuthoredInsertion(stub: DurableObjectStub<DocumentRoom>, name: string, index: number, value: string): Promise<void> {
  await runInDurableObject(stub, (instance: DocumentRoom, state) => {
    const row = state.storage.sql.exec<WorkspaceStateRow>("SELECT y_state FROM workspace WHERE id = 1").one();
    const document = new Y.Doc();
    Y.applyUpdate(document, new Uint8Array(row.y_state), "test-bootstrap");
    const stateVector = Y.encodeStateVector(document);
    document.getText(name).insert(index, value);
    const update = copyArrayBuffer(Y.encodeStateAsUpdate(document, stateVector));
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    state.acceptWebSocket(server);
    client.accept();
    instance.webSocketMessage(server, update);
    if (server.readyState === WebSocket.OPEN) server.close(1000, "test edit complete");
    if (client.readyState === WebSocket.OPEN) client.close(1000, "test edit complete");
    document.destroy();
  });
}

function copyArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
