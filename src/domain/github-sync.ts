export interface GitHubSyncBaseFile {
  readonly fileId: string;
  readonly path: string;
  readonly blobSha: string;
  readonly content: string;
}

export interface GitHubSyncLocalFile {
  readonly fileId: string;
  readonly path: string;
  readonly content: string;
}

export interface GitHubSyncRemoteFile {
  readonly path: string;
  readonly blobSha: string;
  readonly content: string;
}

export type GitHubSyncChangeKind = "unchanged" | "local-only" | "local-untracked" | "remote-only" | "identical" | "conflict";

export interface GitHubSyncChange {
  readonly kind: GitHubSyncChangeKind;
  readonly base: GitHubSyncBaseFile | null;
  readonly local: GitHubSyncLocalFile | null;
  readonly remote: GitHubSyncRemoteFile | null;
}

export interface GitHubPublishPlan {
  readonly changes: readonly { readonly path: string; readonly content: string | null }[];
  readonly skippedLocalPaths: readonly string[];
  readonly blocking: readonly GitHubSyncChange[];
}

export interface GitHubPullPlan {
  readonly changes: readonly GitHubSyncChange[];
  readonly blocking: readonly GitHubSyncChange[];
}

export interface GitHubPullResolution {
  readonly conflict: number;
  readonly choice: "local" | "remote";
}

export type GitHubSyncRelationship = "synced" | "remote-changed" | "github-ahead" | "kirjolab-ahead" | "diverged" | "conflicted";

export interface GitHubSyncSummary {
  readonly relationship: GitHubSyncRelationship;
  readonly remoteHead: string;
  readonly remoteHeadChanged: boolean;
  readonly incomingChanges: number;
  readonly outgoingChanges: number;
  readonly conflicts: number;
}

export function summarizeGitHubSync(
  synchronizedCommit: string,
  remoteHead: string,
  comparison: readonly GitHubSyncChange[],
): GitHubSyncSummary {
  const incomingChanges = comparison.filter((change) => change.kind === "remote-only").length;
  const outgoingChanges = comparison.filter((change) => change.kind === "local-only").length;
  const conflicts = comparison.filter((change) => change.kind === "conflict").length;
  const remoteHeadChanged = synchronizedCommit !== remoteHead;
  const relationship: GitHubSyncRelationship = conflicts
    ? "conflicted"
    : incomingChanges && outgoingChanges
      ? "diverged"
      : incomingChanges
        ? "github-ahead"
        : outgoingChanges
          ? "kirjolab-ahead"
          : remoteHeadChanged
            ? "remote-changed"
            : "synced";
  return { relationship, remoteHead, remoteHeadChanged, incomingChanges, outgoingChanges, conflicts };
}

export function compareGitHubSync(
  baseFiles: readonly GitHubSyncBaseFile[],
  localFiles: readonly GitHubSyncLocalFile[],
  remoteFiles: readonly GitHubSyncRemoteFile[],
): readonly GitHubSyncChange[] {
  assertUnique(baseFiles, (file) => file.fileId, "base file id");
  assertUnique(baseFiles, (file) => file.path, "base path");
  assertUnique(localFiles, (file) => file.fileId, "local file id");
  assertUnique(localFiles, (file) => file.path, "local path");
  assertUnique(remoteFiles, (file) => file.path, "remote path");

  const localById = new Map(localFiles.map((file) => [file.fileId, file]));
  const remoteByPath = new Map(remoteFiles.map((file) => [file.path, file]));
  const baseBlobCounts = countBy(baseFiles, (file) => file.blobSha);
  const remoteBlobCounts = countBy(remoteFiles, (file) => file.blobSha);
  const remoteByUniqueBlob = new Map(
    remoteFiles.filter((file) => remoteBlobCounts.get(file.blobSha) === 1).map((file) => [file.blobSha, file]),
  );
  const claimedLocalIds = new Set<string>();
  const claimedRemotePaths = new Set<string>();
  const result: GitHubSyncChange[] = [];

  for (const base of baseFiles) {
    const local = localById.get(base.fileId) ?? null;
    if (local) claimedLocalIds.add(local.fileId);
    const directRemote = remoteByPath.get(base.path);
    const renamedRemote = directRemote ?? (baseBlobCounts.get(base.blobSha) === 1 ? remoteByUniqueBlob.get(base.blobSha) : undefined);
    const remote = renamedRemote && !claimedRemotePaths.has(renamedRemote.path) ? renamedRemote : null;
    if (remote) claimedRemotePaths.add(remote.path);
    result.push(classify(base, local, remote));
  }

  for (const local of localFiles) {
    if (claimedLocalIds.has(local.fileId)) continue;
    const remote = remoteByPath.get(local.path);
    if (remote && !claimedRemotePaths.has(remote.path)) {
      claimedRemotePaths.add(remote.path);
      result.push({ kind: local.content === remote.content ? "identical" : "conflict", base: null, local, remote });
    } else {
      result.push({ kind: "local-untracked", base: null, local, remote: null });
    }
  }
  for (const remote of remoteFiles) {
    if (!claimedRemotePaths.has(remote.path)) result.push({ kind: "remote-only", base: null, local: null, remote });
  }
  return result.sort(compareChanges);
}

export function buildGitHubPublishPlan(comparison: readonly GitHubSyncChange[]): GitHubPublishPlan {
  const blocking = comparison.filter((change) => change.kind === "remote-only" || change.kind === "conflict");
  const skippedLocalPaths = comparison
    .filter((change) => change.kind === "local-untracked")
    .flatMap((change) => (change.local ? [change.local.path] : []))
    .sort(compareText);
  if (blocking.length > 0) return { changes: [], skippedLocalPaths, blocking };

  const changes = new Map<string, string | null>();
  for (const change of comparison) {
    if (change.kind !== "local-only" || !change.base) continue;
    if (!change.local) {
      changes.set(change.base.path, null);
      continue;
    }
    if (change.local.path !== change.base.path) changes.set(change.base.path, null);
    changes.set(change.local.path, change.local.content);
  }
  return {
    changes: [...changes].sort(([left], [right]) => compareText(left, right)).map(([path, content]) => ({ path, content })),
    skippedLocalPaths,
    blocking,
  };
}

export function buildGitHubPullPlan(comparison: readonly GitHubSyncChange[]): GitHubPullPlan {
  return {
    changes: comparison.filter((change) => change.kind === "remote-only"),
    blocking: comparison.filter((change) => change.kind === "conflict"),
  };
}

export function resolveGitHubPullPlan(plan: GitHubPullPlan, resolutions: readonly GitHubPullResolution[]): readonly GitHubSyncChange[] {
  if (resolutions.length !== plan.blocking.length) throw new Error("Every GitHub pull conflict requires one resolution");
  const byConflict = new Map<number, GitHubPullResolution["choice"]>();
  for (const resolution of resolutions) {
    if (
      !Number.isSafeInteger(resolution.conflict) ||
      resolution.conflict < 0 ||
      resolution.conflict >= plan.blocking.length ||
      byConflict.has(resolution.conflict)
    ) {
      throw new Error("GitHub pull conflict resolution is invalid");
    }
    byConflict.set(resolution.conflict, resolution.choice);
  }
  return [
    ...plan.changes,
    ...plan.blocking.filter((_change, index) => {
      const choice = byConflict.get(index);
      if (choice !== "local" && choice !== "remote") throw new Error("GitHub pull conflict resolution is invalid");
      return choice === "remote";
    }),
  ];
}

function classify(base: GitHubSyncBaseFile, local: GitHubSyncLocalFile | null, remote: GitHubSyncRemoteFile | null): GitHubSyncChange {
  const localChanged = !local || local.path !== base.path || local.content !== base.content;
  const remoteChanged = !remote || remote.path !== base.path || remote.content !== base.content;
  let kind: GitHubSyncChangeKind;
  if (!localChanged && !remoteChanged) kind = "unchanged";
  else if (localChanged && !remoteChanged) kind = "local-only";
  else if (!localChanged) kind = "remote-only";
  else if ((!local && !remote) || (local && remote && local.path === remote.path && local.content === remote.content)) kind = "identical";
  else kind = "conflict";
  return { kind, base, local, remote };
}

function assertUnique<Value>(values: readonly Value[], key: (value: Value) => string, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const candidate = key(value);
    if (!candidate || seen.has(candidate)) throw new TypeError(`GitHub sync ${label} must be non-empty and unique`);
    seen.add(candidate);
  }
}

function countBy<Value>(values: readonly Value[], key: (value: Value) => string): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(key(value), (result.get(key(value)) ?? 0) + 1);
  return result;
}

function compareChanges(left: GitHubSyncChange, right: GitHubSyncChange): number {
  return compareText(changePath(left), changePath(right));
}

function changePath(change: GitHubSyncChange): string {
  return change.local?.path ?? change.remote?.path ?? change.base?.path ?? "";
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
