import type { GitHubSyncRelationship } from "../domain/github-sync";

export interface GitHubSyncStatus {
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
  readonly rootPath: string;
  readonly commitSha: string;
  readonly remoteHead: string;
  readonly remoteHeadChanged: boolean;
  readonly relationship: GitHubSyncRelationship;
  readonly incomingChanges: number;
  readonly outgoingChanges: number;
  readonly conflicts: number;
}

export interface GitHubSyncPresentation {
  readonly label: string;
  readonly detail: string;
  readonly tone: "quiet" | "attention" | "warning";
  readonly canPull: boolean;
  readonly canPush: boolean;
}

const relationships: readonly GitHubSyncRelationship[] = [
  "synced",
  "remote-changed",
  "github-ahead",
  "kirjolab-ahead",
  "diverged",
  "conflicted",
];

export function isGitHubSyncStatus(value: unknown): value is GitHubSyncStatus {
  return (
    isRecord(value) &&
    typeof value.owner === "string" &&
    typeof value.repository === "string" &&
    typeof value.branch === "string" &&
    typeof value.rootPath === "string" &&
    typeof value.commitSha === "string" &&
    typeof value.remoteHead === "string" &&
    typeof value.remoteHeadChanged === "boolean" &&
    isGitHubSyncRelationship(value.relationship) &&
    isCount(value.incomingChanges) &&
    isCount(value.outgoingChanges) &&
    isCount(value.conflicts)
  );
}

function isGitHubSyncRelationship(value: unknown): value is GitHubSyncRelationship {
  return typeof value === "string" && relationships.some((relationship) => relationship === value);
}

export function gitHubSyncPresentation(status: GitHubSyncStatus): GitHubSyncPresentation {
  const incoming = countLabel(status.incomingChanges, "incoming change");
  const outgoing = countLabel(status.outgoingChanges, "outgoing change");
  switch (status.relationship) {
    case "remote-changed":
      return {
        label: "GitHub · Branch changed",
        detail: `GitHub moved to ${shortSha(status.remoteHead)}; tracked Markdown is unchanged.`,
        tone: "attention",
        canPull: false,
        canPush: false,
      };
    case "github-ahead":
      return { label: "GitHub · Pull available", detail: `${incoming} on GitHub.`, tone: "attention", canPull: true, canPush: false };
    case "kirjolab-ahead":
      return {
        label: "GitHub · Push available",
        detail: `${outgoing} ready to publish${status.remoteHeadChanged ? "; the branch also moved outside tracked Markdown" : ""}.`,
        tone: "attention",
        canPull: false,
        canPush: true,
      };
    case "diverged":
      return {
        label: "GitHub · Pull + push",
        detail: `${incoming} and ${outgoing}; pull before publishing.`,
        tone: "warning",
        canPull: true,
        canPush: false,
      };
    case "conflicted":
      return {
        label: "GitHub · Conflict",
        detail: `${countLabel(status.conflicts, "tracked conflict")} ${status.conflicts === 1 ? "requires" : "require"} review.`,
        tone: "warning",
        canPull: true,
        canPush: false,
      };
    case "synced":
      return {
        label: "GitHub · Synced",
        detail: `Tracked Markdown matches ${status.branch} at ${shortSha(status.remoteHead)}.`,
        tone: "quiet",
        canPull: false,
        canPush: false,
      };
  }
}

function countLabel(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function shortSha(value: string): string {
  return value.slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
