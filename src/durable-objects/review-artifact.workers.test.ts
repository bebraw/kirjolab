import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DocumentRoom } from "./document-room";
import type { ReviewArtifactPin } from "../domain/workspace";

describe("review synthesis project artifact", () => {
  it("pins Markdown atomically in current state and project history", async () => {
    const room = env.DOCUMENT_ROOMS.getByName(`review-artifact-history-${crypto.randomUUID()}`);
    const initial = await room.getSnapshot("project");
    await linkReview(room);
    const firstContent = "# First synthesis\n";
    const firstPin = await artifactPin(firstContent, {
      reviewRevision: 4,
      protocolRevision: 2,
      analysisDefinitionRevision: 1,
      generatedAt: "2026-07-19T10:00:00.000Z",
    });

    const created = await room.upsertReviewArtifact("project", "review/synthesis.md", firstContent, initial.revision, firstPin);
    expect(created).toMatchObject({ ok: true, value: { revision: initial.revision + 1, reviewArtifactPins: [firstPin] } });
    if (!created.ok) throw new Error(created.error);
    expect(created.value.files.find((file) => file.path === firstPin.path)?.content).toBe(firstContent);
    const createdRevision = await room.getRevision(created.value.revision);
    expect(createdRevision.files.find((file) => file.path === firstPin.path)?.content).toBe(firstContent);
    expect(createdRevision.reviewArtifactPins).toEqual([firstPin]);

    const artifactFile = created.value.files.find((file) => file.path === firstPin.path)!;
    await expect(
      room.replaceProjectFileContent("project", artifactFile.id, "# Hand-edited synthesis\n", created.value.revision),
    ).resolves.toMatchObject({ ok: false, code: "pinned-artifact" });

    const entry = created.value.files.find((file) => file.id === created.value.entryFileId)!;
    const edited = await room.replaceProjectFileContent(
      "project",
      entry.id,
      "# Article\n\n::review-artifact[review/synthesis.md]\n",
      created.value.revision,
    );
    if (!edited.ok) throw new Error(edited.error);
    expect(edited.value.reviewArtifactPins).toEqual([firstPin]);
    expect(edited.value.composition.content).toContain(firstContent);
    expect((await room.getRevision(edited.value.revision)).reviewArtifactPins).toEqual([firstPin]);

    const secondContent = "# Revised synthesis\n";
    const secondPin = await artifactPin(secondContent, {
      publicationId: "publication-a-2",
      reviewRevision: 7,
      protocolRevision: 3,
      analysisDefinitionRevision: 2,
      generatedAt: "2026-07-19T11:00:00.000Z",
    });
    const replaced = await room.upsertReviewArtifact("project", secondPin.path, secondContent, edited.value.revision, secondPin);
    if (!replaced.ok) throw new Error(replaced.error);
    expect(replaced.value.reviewArtifactPins).toEqual([secondPin]);

    const unlinked = await room.unlinkReview("project", firstPin.linkId, "owner@example.test");
    expect(unlinked).toMatchObject({ id: firstPin.linkId, status: "unlinked", unlinkedBy: "owner@example.test" });
    expect((await room.getSnapshot("project")).revision).toBe(replaced.value.revision);

    const restored = await room.restoreRevision("project", created.value.revision);
    expect(restored.reviewArtifactPins).toEqual([firstPin]);
    expect(restored.files.find((file) => file.path === firstPin.path)?.content).toBe(firstContent);
    await expect(room.listReviewLinks("project")).resolves.toEqual([expect.objectContaining({ id: firstPin.linkId, status: "unlinked" })]);
    await expect(room.getRevision(replaced.value.revision)).resolves.toMatchObject({ reviewArtifactPins: [secondPin] });
  });

  it("rejects stale or invalid pins without changing the project", async () => {
    const room = env.DOCUMENT_ROOMS.getByName(`review-artifact-validation-${crypto.randomUUID()}`);
    const initial = await room.getSnapshot("project");
    await linkReview(room);
    const currentContent = "# Current synthesis\n";
    const currentPin = await artifactPin(currentContent, {
      reviewRevision: 6,
      protocolRevision: 3,
      analysisDefinitionRevision: 4,
      generatedAt: "2026-07-19T12:00:00.000Z",
    });
    const created = await room.upsertReviewArtifact("project", currentPin.path, currentContent, initial.revision, currentPin);
    if (!created.ok) throw new Error(created.error);

    const staleContent = "# Stale synthesis\n";
    const stalePin = await artifactPin(staleContent, {
      reviewRevision: 5,
      protocolRevision: 3,
      analysisDefinitionRevision: 3,
      generatedAt: "2026-07-19T11:00:00.000Z",
    });
    await expect(
      room.upsertReviewArtifact("project", stalePin.path, staleContent, created.value.revision, stalePin),
    ).resolves.toMatchObject({ ok: false, code: "stale-pin" });

    const invalidDigest = { ...currentPin, digest: "f".repeat(64), generatedAt: "2026-07-19T13:00:00.000Z" };
    await expect(
      room.upsertReviewArtifact("project", currentPin.path, "# Tampered\n", created.value.revision, invalidDigest),
    ).resolves.toMatchObject({ ok: false, code: "invalid-pin" });
    await expect(
      room.upsertReviewArtifact("project", currentPin.path, currentContent, created.value.revision, {
        ...currentPin,
        path: "review/other.md",
      }),
    ).resolves.toMatchObject({ ok: false, code: "invalid-pin" });
    await expect(
      room.upsertReviewArtifact("project", currentPin.path, currentContent, created.value.revision, {
        ...currentPin,
        generatedAt: "not-a-timestamp",
      }),
    ).resolves.toMatchObject({ ok: false, code: "invalid-pin" });
    await expect(
      room.upsertReviewArtifact("project", currentPin.path, currentContent, created.value.revision, {
        ...currentPin,
        reviewRevision: 0,
      }),
    ).resolves.toMatchObject({ ok: false, code: "invalid-pin" });
    await expect(room.upsertReviewArtifact("project", "main.md", "unsafe", created.value.revision, currentPin)).resolves.toMatchObject({
      ok: false,
      code: "invalid-path",
    });

    const unchanged = await room.getSnapshot("project");
    expect(unchanged.revision).toBe(created.value.revision);
    expect(unchanged.reviewArtifactPins).toEqual([currentPin]);
    expect(unchanged.files.find((file) => file.path === currentPin.path)?.content).toBe(currentContent);
  });

  it("requires an active shared link identity and rejects cross-review path collisions", async () => {
    const room = env.DOCUMENT_ROOMS.getByName(`review-artifact-links-${crypto.randomUUID()}`);
    const initial = await room.getSnapshot("project");
    await linkReview(room);
    await linkReview(room, {
      linkId: "link-b",
      reviewId: "review-b",
      reviewAccessLocator: "review-access:review-b",
      createdAt: "2026-07-19T09:30:00.000Z",
    });
    const firstContent = "# Review A\n";
    const firstPin = await artifactPin(firstContent);
    const created = await room.upsertReviewArtifact("project", firstPin.path, firstContent, initial.revision, firstPin);
    if (!created.ok) throw new Error(created.error);

    const otherContent = "# Review B\n";
    const otherPin = await artifactPin(otherContent, {
      reviewId: "review-b",
      linkId: "link-b",
      publicationId: "publication-b",
      reviewRevision: 99,
    });
    await expect(
      room.upsertReviewArtifact("project", otherPin.path, otherContent, created.value.revision, otherPin),
    ).resolves.toMatchObject({ ok: false, code: "artifact-path-conflict" });

    await room.unlinkReview("project", firstPin.linkId, "owner@example.test");
    const afterUnlinkContent = "# Review A after unlink\n";
    const afterUnlinkPin = await artifactPin(afterUnlinkContent, {
      publicationId: "publication-after-unlink",
      reviewRevision: 2,
      generatedAt: "2026-07-19T10:00:00.000Z",
    });
    await expect(
      room.upsertReviewArtifact("project", afterUnlinkPin.path, afterUnlinkContent, created.value.revision, afterUnlinkPin),
    ).resolves.toMatchObject({ ok: false, code: "review-link-unavailable" });
    await expect(room.getSnapshot("project")).resolves.toMatchObject({
      revision: created.value.revision,
      reviewArtifactPins: [firstPin],
    });
  });

  it("accepts revision seeds written before review artifact pins existed", async () => {
    const source = env.DOCUMENT_ROOMS.getByName(`review-artifact-old-source-${crypto.randomUUID()}`);
    const oldSeed = JSON.parse(await source.getRevisionSeed(0)) as { tables: Record<string, unknown> };
    delete oldSeed.tables.review_artifact_pins;

    const target = env.DOCUMENT_ROOMS.getByName(`review-artifact-old-target-${crypto.randomUUID()}`);
    const seeded = await target.seedFromRevision("target", "Imported history", JSON.stringify(oldSeed));
    expect(seeded.reviewArtifactPins).toEqual([]);
    expect((await target.getRevision(0)).reviewArtifactPins).toEqual([]);
  });

  it("normalizes legacy artifact-pin seeds without copying live review links", async () => {
    const source = env.DOCUMENT_ROOMS.getByName(`review-artifact-legacy-source-${crypto.randomUUID()}`);
    const initial = await source.getSnapshot("source");
    await linkReview(source, { projectId: "source" });
    const content = "# Legacy synthesis\n";
    const pin = await artifactPin(content);
    const published = await source.upsertReviewArtifact("source", pin.path, content, initial.revision, pin);
    if (!published.ok) throw new Error(published.error);
    const legacySeed = JSON.parse(await source.getRevisionSeed(published.value.revision)) as {
      tables: { review_artifact_pins: Array<Record<string, unknown>> };
    };
    for (const row of legacySeed.tables.review_artifact_pins) {
      for (const field of ["review_id", "link_id", "publication_id", "generator", "generator_schema", "published_by"]) delete row[field];
    }

    const target = env.DOCUMENT_ROOMS.getByName(`review-artifact-legacy-target-${crypto.randomUUID()}`);
    const seeded = await target.seedFromRevision("target", "Imported legacy review", JSON.stringify(legacySeed));
    expect(seeded.reviewArtifactPins).toEqual([
      expect.objectContaining({
        path: pin.path,
        reviewId: "legacy-project-review",
        linkId: `legacy-${pin.digest}`,
        publicationId: `legacy-${pin.digest}`,
        generator: "kirjolab-review-synthesis",
        generatorSchema: "kirjolab-review-analysis-v1",
        publishedBy: "legacy-unattributed",
      }),
    ]);
    await expect(target.listReviewLinks("target")).resolves.toEqual([]);
    await expect(target.getRevision(0)).resolves.toMatchObject({ reviewArtifactPins: seeded.reviewArtifactPins });
  });

  it("backfills legacy SQLite pins and tolerates a pending migration ledger", async () => {
    const room = env.DOCUMENT_ROOMS.getByName(`review-artifact-migration-${crypto.randomUUID()}`);
    await room.getSnapshot("project");
    await room.createProjectFile("project", "review/legacy.md", "# Legacy synthesis\n");
    const digest = "a".repeat(64);
    await runInDurableObject(room, (_instance: DocumentRoom, state) => {
      state.storage.sql.exec(`
        DROP TABLE review_artifact_pins;
        CREATE TABLE review_artifact_pins (
          path TEXT PRIMARY KEY REFERENCES project_files(path) ON UPDATE CASCADE ON DELETE CASCADE,
          review_revision INTEGER NOT NULL CHECK (review_revision > 0),
          protocol_revision INTEGER NOT NULL CHECK (protocol_revision > 0),
          analysis_definition_id TEXT NOT NULL,
          analysis_definition_revision INTEGER NOT NULL CHECK (analysis_definition_revision > 0),
          digest TEXT NOT NULL,
          generated_at TEXT NOT NULL
        );
      `);
      state.storage.sql.exec(
        `INSERT INTO review_artifact_pins
         (path, review_revision, protocol_revision, analysis_definition_id, analysis_definition_revision, digest, generated_at)
         VALUES ('review/legacy.md', 3, 2, 'legacy-synthesis', 1, ?, '2026-07-19T08:00:00.000Z')`,
        digest,
      );
      state.storage.sql.exec("DELETE FROM _kirjolab_migrations WHERE version = 27");
    });

    await evictDurableObject(room);
    await expect(room.getSnapshot("project")).resolves.toMatchObject({
      reviewArtifactPins: [
        {
          path: "review/legacy.md",
          reviewId: "legacy-project-review",
          linkId: `legacy-${digest}`,
          publicationId: `legacy-${digest}`,
          reviewRevision: 3,
          protocolRevision: 2,
          analysisDefinitionId: "legacy-synthesis",
          analysisDefinitionRevision: 1,
          generator: "kirjolab-review-synthesis",
          generatorSchema: "kirjolab-review-analysis-v1",
          digest,
          publishedBy: "legacy-unattributed",
          generatedAt: "2026-07-19T08:00:00.000Z",
        },
      ],
    });

    await runInDurableObject(room, (_instance: DocumentRoom, state) => {
      state.storage.sql.exec("DELETE FROM _kirjolab_migrations WHERE version = 27");
    });
    await evictDurableObject(room);
    await expect(room.getSnapshot("project")).resolves.toMatchObject({
      reviewArtifactPins: [expect.objectContaining({ linkId: `legacy-${digest}` })],
    });
  });
});

async function artifactPin(content: string, overrides: Partial<ReviewArtifactPin> = {}): Promise<ReviewArtifactPin> {
  return {
    path: "review/synthesis.md",
    reviewId: "review-a",
    linkId: "link-a",
    publicationId: "publication-a",
    reviewRevision: 1,
    protocolRevision: 1,
    analysisDefinitionId: "synthesis-default",
    analysisDefinitionRevision: 1,
    generator: "kirjolab-review-synthesis",
    generatorSchema: "kirjolab-review-analysis-v1",
    digest: await sha256(content),
    publishedBy: "owner@example.test",
    generatedAt: "2026-07-19T09:00:00.000Z",
    ...overrides,
  };
}

async function linkReview(
  room: DurableObjectStub<import("./document-room").DocumentRoom>,
  overrides: {
    projectId?: string;
    linkId?: string;
    reviewId?: string;
    reviewAccessLocator?: string;
    actor?: string;
    createdAt?: string;
  } = {},
): Promise<void> {
  await room.linkReview(
    overrides.projectId ?? "project",
    overrides.linkId ?? "link-a",
    overrides.reviewId ?? "review-a",
    overrides.reviewAccessLocator ?? "review-access:review-a",
    overrides.actor ?? "owner@example.test",
    overrides.createdAt ?? "2026-07-19T09:00:00.000Z",
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
