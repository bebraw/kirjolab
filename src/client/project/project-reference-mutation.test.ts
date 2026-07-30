import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceSnapshotFixture } from "../../test-support/workspace-fixture";
import { mutateProjectReference } from "./project-reference-mutation";

afterEach(() => vi.restoreAllMocks());

describe("project reference mutation", () => {
  it("links with a stable project endpoint and validated snapshot", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(workspaceSnapshotFixture));

    await expect(
      mutateProjectReference("/api/workspaces/workspace", {
        action: "link",
        citationAlias: "source2026",
        referenceId: "reference/1",
      }),
    ).resolves.toEqual(workspaceSnapshotFixture);

    expect(request).toHaveBeenCalledWith(
      "/api/workspaces/workspace/references",
      expect.objectContaining({
        body: JSON.stringify({ referenceId: "reference/1", citationAlias: "source2026" }),
        method: "POST",
      }),
    );
  });

  it("unlinks an encoded stable reference target", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(workspaceSnapshotFixture));

    await expect(mutateProjectReference("/api/workspaces/workspace", { action: "unlink", referenceId: "reference/1" })).resolves.toEqual(
      workspaceSnapshotFixture,
    );

    expect(request).toHaveBeenCalledWith("/api/workspaces/workspace/references/reference%2F1", {
      credentials: "same-origin",
      method: "DELETE",
    });
  });

  it("rejects provider failures and invalid workspace responses", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ id: "incomplete" }));

    await expect(
      mutateProjectReference("/api/workspaces/workspace", {
        action: "link",
        citationAlias: "source2026",
        referenceId: "reference-1",
      }),
    ).rejects.toThrow("Denied");
    await expect(mutateProjectReference("/api/workspaces/workspace", { action: "unlink", referenceId: "reference-1" })).rejects.toThrow(
      "invalid workspace",
    );
  });
});
