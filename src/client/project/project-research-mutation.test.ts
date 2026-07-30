import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceSnapshotFixture } from "../../test-support/workspace-fixture";
import { mutateProjectResearch } from "./project-research-mutation";

afterEach(() => vi.restoreAllMocks());

describe("project research mutation", () => {
  it("pins and shares through stable project endpoints", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(Response.json(workspaceSnapshotFixture)));

    await mutateProjectResearch("/api/workspaces/workspace", {
      action: "pin",
      referenceId: "reference/1",
      snapshotId: "snapshot-1",
    });
    await mutateProjectResearch("/api/workspaces/workspace", {
      action: "share",
      kind: "highlight",
      referenceId: "reference-1",
      resourceId: "highlight-1",
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace/references/reference%2F1/web-snapshot",
      expect.objectContaining({ body: JSON.stringify({ snapshotId: "snapshot-1" }), method: "POST" }),
    );
    expect(request).toHaveBeenNthCalledWith(2, "/api/workspaces/workspace/research-shares", expect.objectContaining({ method: "POST" }));
  });

  it("revokes an encoded stable share target", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(workspaceSnapshotFixture));
    await expect(mutateProjectResearch("/api/workspaces/workspace", { action: "revoke", shareId: "share/1" })).resolves.toEqual(
      workspaceSnapshotFixture,
    );
    expect(request).toHaveBeenCalledWith("/api/workspaces/workspace/research-shares/share%2F1", {
      credentials: "same-origin",
      method: "DELETE",
    });
  });

  it("rejects invalid workspace responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id: "incomplete" }));
    await expect(mutateProjectResearch("/api/workspaces/workspace", { action: "revoke", shareId: "share-1" })).rejects.toThrow(
      "invalid workspace",
    );
  });
});
