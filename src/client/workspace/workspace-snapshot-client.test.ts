import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";
import { workspaceSnapshotFixture } from "../../test-support/workspace-fixture";
import { loadWorkspaceSnapshot, parseWorkspaceSnapshot, WorkspaceAccessError } from "./workspace-snapshot-client";

describe("workspace snapshot client", () => {
  it.each([401, 403, 404])("reports revoked access for status %i", async (status) => {
    const fetcher = vi.fn(async () => new Response(null, { status }));

    await expect(loadWorkspaceSnapshot("/api/workspaces/workspace", new Y.Doc(), false, fetcher)).rejects.toThrow(WorkspaceAccessError);
  });

  it("separates failed transport from invalid workspace payloads", async () => {
    await expect(
      loadWorkspaceSnapshot("/api/workspaces/workspace", new Y.Doc(), false, async () => new Response(null, { status: 500 })),
    ).rejects.toThrow("Could not load the project");
    await expect(
      loadWorkspaceSnapshot("/api/workspaces/workspace", new Y.Doc(), false, async () => Response.json({ id: "incomplete" })),
    ).rejects.toThrow("Project returned an invalid snapshot");
  });

  it("returns a validated canonical snapshot", async () => {
    const snapshot = await loadWorkspaceSnapshot("/api/workspaces/workspace", new Y.Doc(), false, async () =>
      Response.json(workspaceSnapshotFixture),
    );

    expect(snapshot).toEqual(workspaceSnapshotFixture);
    expect(() => parseWorkspaceSnapshot({}, "Invalid mutation")).toThrow("Invalid mutation");
  });
});
