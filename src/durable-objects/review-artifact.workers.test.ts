import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("review synthesis project artifact", () => {
  it("creates and replaces only revision-checked review Markdown", async () => {
    const room = env.DOCUMENT_ROOMS.getByName(`review-artifact-${crypto.randomUUID()}`);
    const initial = await room.getSnapshot("project");
    const created = await room.upsertReviewArtifact("project", "review/synthesis.md", "# First\n", initial.revision);
    expect(created).toMatchObject({ ok: true, value: { revision: initial.revision + 1 } });
    if (!created.ok) throw new Error(created.error);
    expect(created.value.files.find((file) => file.path === "review/synthesis.md")?.content).toBe("# First\n");

    const stale = await room.upsertReviewArtifact("project", "review/synthesis.md", "# Stale\n", initial.revision);
    expect(stale).toMatchObject({ ok: false, code: "revision-conflict" });
    const replaced = await room.upsertReviewArtifact("project", "review/synthesis.md", "# Revised\n", created.value.revision);
    expect(replaced).toMatchObject({ ok: true });
    if (!replaced.ok) throw new Error(replaced.error);
    expect(replaced.value.files.find((file) => file.path === "review/synthesis.md")?.content).toBe("# Revised\n");
    expect(await room.upsertReviewArtifact("project", "main.md", "unsafe", replaced.value.revision)).toMatchObject({
      ok: false,
      code: "invalid-path",
    });
  });
});
