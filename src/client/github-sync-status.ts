import * as v from "valibot";

const nonNegativeIntegerSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const gitHubSyncStatusSchema = v.object({
  owner: v.string(),
  repository: v.string(),
  branch: v.string(),
  rootPath: v.string(),
  commitSha: v.string(),
  remoteHead: v.string(),
  remoteHeadChanged: v.boolean(),
  relationship: v.picklist(["synced", "remote-changed", "github-ahead", "kirjolab-ahead", "diverged", "conflicted"]),
  incomingChanges: nonNegativeIntegerSchema,
  outgoingChanges: nonNegativeIntegerSchema,
  conflicts: nonNegativeIntegerSchema,
});

export type GitHubSyncStatus = v.InferOutput<typeof gitHubSyncStatusSchema>;

export interface GitHubSyncPresentation {
  readonly label: string;
  readonly detail: string;
  readonly tone: "quiet" | "attention" | "warning";
  readonly canPull: boolean;
  readonly canPush: boolean;
}

export function isGitHubSyncStatus(value: unknown): value is GitHubSyncStatus {
  return v.is(gitHubSyncStatusSchema, value);
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
