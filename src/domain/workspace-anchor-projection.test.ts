import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createManuscriptAnchor, toManuscriptAnchorSelector } from "./manuscript-anchor";
import type { ModelCandidate, WorkspaceSnapshot } from "./workspace";
import { resolveWorkspaceSnapshotAnchors } from "./workspace-anchor-projection";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";

describe("workspace anchor projection", () => {
  it("resolves every manuscript-backed snapshot resource without changing claim drafts", () => {
    const document = new Y.Doc();
    document.getText("source").insert(0, "Before target after");
    const anchor = toManuscriptAnchorSelector(createManuscriptAnchor(document, 7, 13, 1));
    document.getText("source").insert(0, "New ");
    const revisionCandidate = {
      id: "candidate-1",
      operation: "revise-selection",
      promptVersion: "revise-selection-v1",
      providerAdapter: "openai-compatible",
      providerLabel: "Local model",
      model: "test-model",
      instruction: "Clarify",
      sourceRevision: 1,
      target: { anchor, resolution: { status: "stale" } },
      evidence: [],
      proposedReplacement: "replacement",
      status: "pending",
      createdAt: "created",
    } satisfies ModelCandidate;
    const claimCandidate = {
      id: "candidate-2",
      operation: "draft-claim",
      promptVersion: "draft-claim-v1",
      providerAdapter: "openai-compatible",
      providerLabel: "Local model",
      model: "test-model",
      instruction: "Draft",
      relation: "supports",
      evidence: [],
      proposedText: "claim",
      proposedNote: "",
      status: "pending",
      createdAt: "created",
    } satisfies ModelCandidate;
    const snapshot = {
      ...workspaceSnapshotFixture,
      links: [{ id: "link-1", annotationId: "annotation-1", anchor, resolution: { status: "stale" }, createdAt: "created" }],
      claimLinks: [{ id: "claim-link-1", claimId: "claim-1", anchor, resolution: { status: "stale" }, createdAt: "created" }],
      comments: [
        {
          id: "comment-1",
          authorId: "person-1",
          authorLabel: "Researcher",
          body: "Comment",
          anchor,
          resolution: { status: "stale" },
          status: "open",
          createdAt: "created",
          updatedAt: "updated",
        },
      ],
      candidates: [revisionCandidate, claimCandidate],
    } satisfies WorkspaceSnapshot;

    const resolved = resolveWorkspaceSnapshotAnchors(document, snapshot);
    const expected = { status: "resolved", start: 11, end: 17, text: "target", exactMatch: true };

    expect(resolved.links[0]?.resolution).toEqual(expected);
    expect(resolved.claimLinks[0]?.resolution).toEqual(expected);
    expect(resolved.comments[0]?.resolution).toEqual(expected);
    expect(resolved.candidates[0]?.operation === "revise-selection" ? resolved.candidates[0].target.resolution : null).toEqual(expected);
    expect(resolved.candidates[1]).toBe(claimCandidate);
    expect(snapshot.links[0]?.resolution).toEqual({ status: "stale" });
  });
});
