import { describe, expect, it } from "vitest";
import { gitHubSyncPresentation, isGitHubSyncStatus, type GitHubSyncStatus } from "./github-sync-status";

const status = {
  owner: "bebraw",
  repository: "scalability_book",
  branch: "main",
  rootPath: "book",
  commitSha: "a".repeat(40),
  remoteHead: "b".repeat(40),
  remoteHeadChanged: true,
  relationship: "remote-changed",
  incomingChanges: 0,
  outgoingChanges: 0,
  conflicts: 0,
} satisfies GitHubSyncStatus;

describe("GitHub sync status", () => {
  it("validates the complete serialized status contract", () => {
    expect(isGitHubSyncStatus(status)).toBe(true);
    for (const value of [null, [], "status", 1]) expect(isGitHubSyncStatus(value)).toBe(false);
    for (const field of ["owner", "repository", "branch", "rootPath", "commitSha", "remoteHead"] as const) {
      expect(isGitHubSyncStatus({ ...status, [field]: undefined })).toBe(false);
    }
    expect(isGitHubSyncStatus({ ...status, remoteHeadChanged: "yes" })).toBe(false);
    for (const field of ["incomingChanges", "outgoingChanges", "conflicts"] as const) {
      expect(isGitHubSyncStatus({ ...status, [field]: -1 })).toBe(false);
      expect(isGitHubSyncStatus({ ...status, [field]: 1.5 })).toBe(false);
      expect(isGitHubSyncStatus({ ...status, [field]: "1" })).toBe(false);
    }
    expect(isGitHubSyncStatus({ ...status, relationship: "ahead" })).toBe(false);
  });

  it("explains branch movement outside tracked Markdown", () => {
    expect(gitHubSyncPresentation(status)).toEqual({
      label: "GitHub · Branch changed",
      detail: "GitHub moved to bbbbbbbbbb; tracked Markdown is unchanged.",
      tone: "attention",
      canPull: false,
      canPush: false,
    });
  });

  it("presents every actionable relationship", () => {
    expect(gitHubSyncPresentation({ ...status, relationship: "synced", remoteHeadChanged: false })).toEqual({
      label: "GitHub · Synced",
      detail: "Tracked Markdown matches main at bbbbbbbbbb.",
      tone: "quiet",
      canPull: false,
      canPush: false,
    });
    expect(gitHubSyncPresentation({ ...status, relationship: "github-ahead", incomingChanges: 2 })).toEqual({
      label: "GitHub · Pull available",
      detail: "2 incoming changes on GitHub.",
      tone: "attention",
      canPull: true,
      canPush: false,
    });
    expect(gitHubSyncPresentation({ ...status, relationship: "kirjolab-ahead", outgoingChanges: 1 })).toEqual({
      label: "GitHub · Push available",
      detail: "1 outgoing change ready to publish; the branch also moved outside tracked Markdown.",
      tone: "attention",
      canPull: false,
      canPush: true,
    });
    expect(
      gitHubSyncPresentation({ ...status, relationship: "kirjolab-ahead", remoteHeadChanged: false, outgoingChanges: 2 }),
    ).toMatchObject({ detail: "2 outgoing changes ready to publish." });
    expect(gitHubSyncPresentation({ ...status, relationship: "diverged", incomingChanges: 1, outgoingChanges: 2 })).toEqual({
      label: "GitHub · Pull + push",
      detail: "1 incoming change and 2 outgoing changes; pull before publishing.",
      tone: "warning",
      canPull: true,
      canPush: false,
    });
    expect(gitHubSyncPresentation({ ...status, relationship: "conflicted", conflicts: 2 })).toEqual({
      label: "GitHub · Conflict",
      detail: "2 tracked conflicts require review.",
      tone: "warning",
      canPull: true,
      canPush: false,
    });
    expect(gitHubSyncPresentation({ ...status, relationship: "conflicted", conflicts: 1 }).detail).toBe(
      "1 tracked conflict requires review.",
    );
  });
});
