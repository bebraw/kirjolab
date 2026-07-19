import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ReviewArtifactPin } from "../domain/workspace";

describe("review synthesis project artifact", () => {
  it("pins Markdown atomically in current state and project history", async () => {
    const room = env.DOCUMENT_ROOMS.getByName(`review-artifact-history-${crypto.randomUUID()}`);
    const initial = await room.getSnapshot("project");
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
      reviewRevision: 7,
      protocolRevision: 3,
      analysisDefinitionRevision: 2,
      generatedAt: "2026-07-19T11:00:00.000Z",
    });
    const replaced = await room.upsertReviewArtifact("project", secondPin.path, secondContent, edited.value.revision, secondPin);
    if (!replaced.ok) throw new Error(replaced.error);
    expect(replaced.value.reviewArtifactPins).toEqual([secondPin]);

    const restored = await room.restoreRevision("project", created.value.revision);
    expect(restored.reviewArtifactPins).toEqual([firstPin]);
    expect(restored.files.find((file) => file.path === firstPin.path)?.content).toBe(firstContent);
    await expect(room.getRevision(replaced.value.revision)).resolves.toMatchObject({ reviewArtifactPins: [secondPin] });
  });

  it("rejects stale or invalid pins without changing the project", async () => {
    const room = env.DOCUMENT_ROOMS.getByName(`review-artifact-validation-${crypto.randomUUID()}`);
    const initial = await room.getSnapshot("project");
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

  it("accepts revision seeds written before review artifact pins existed", async () => {
    const source = env.DOCUMENT_ROOMS.getByName(`review-artifact-old-source-${crypto.randomUUID()}`);
    const oldSeed = JSON.parse(await source.getRevisionSeed(0)) as { tables: Record<string, unknown> };
    delete oldSeed.tables.review_artifact_pins;

    const target = env.DOCUMENT_ROOMS.getByName(`review-artifact-old-target-${crypto.randomUUID()}`);
    const seeded = await target.seedFromRevision("target", "Imported history", JSON.stringify(oldSeed));
    expect(seeded.reviewArtifactPins).toEqual([]);
    expect((await target.getRevision(0)).reviewArtifactPins).toEqual([]);
  });
});

async function artifactPin(content: string, overrides: Partial<ReviewArtifactPin> = {}): Promise<ReviewArtifactPin> {
  return {
    path: "review/synthesis.md",
    reviewRevision: 1,
    protocolRevision: 1,
    analysisDefinitionId: "synthesis-default",
    analysisDefinitionRevision: 1,
    digest: await sha256(content),
    generatedAt: "2026-07-19T09:00:00.000Z",
    ...overrides,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
