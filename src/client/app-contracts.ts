import type { WebSnapshot, WebSnapshotComparison } from "../domain/reference-library";
import type { AnnotationResource } from "../domain/workspace";

export interface GitHubInstallationOption {
  readonly id: number;
  readonly accountId: string;
  readonly accountLogin: string;
  readonly accountType: "Organization" | "User";
}

export interface GitHubRepositoryOption {
  readonly id: number;
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly defaultBranch: string;
}

export interface LatexImportPreview {
  readonly digest: string;
  readonly archive: {
    readonly files: readonly { readonly path: string; readonly kind: string; readonly bytes: number }[];
    readonly rootCandidates: readonly string[];
  };
  readonly conversion: {
    readonly seed: { readonly files: readonly { readonly path: string; readonly content: string }[]; readonly bibliography: string };
    readonly assets: readonly { readonly path: string; readonly mediaType: string; readonly bytes: number }[];
    readonly report: {
      readonly rootPath: string;
      readonly bibliographyPath: string | null;
      readonly diagnostics: readonly { readonly severity: "error" | "warning" | "info"; readonly message: string }[];
    };
  } | null;
}

export interface WebSnapshotComparisonResponse {
  readonly before: WebSnapshot;
  readonly after: WebSnapshot;
  readonly comparison: WebSnapshotComparison;
}

export interface ShareLinkStatus {
  readonly active: boolean;
  readonly createdAt: string | null;
  readonly href: string | null;
}

export function isWebSnapshotComparisonResponse(value: unknown): value is WebSnapshotComparisonResponse {
  if (!isRecord(value) || !isRecord(value.before) || !isRecord(value.after) || !isRecord(value.comparison)) return false;
  return (
    typeof value.before.id === "string" &&
    typeof value.after.id === "string" &&
    typeof value.comparison.identical === "boolean" &&
    typeof value.comparison.addedLines === "number" &&
    typeof value.comparison.removedLines === "number" &&
    Array.isArray(value.comparison.hunks) &&
    value.comparison.hunks.every(isWebSnapshotComparisonHunk)
  );
}

export function isGitHubConnectionState(
  value: unknown,
): value is { connected: false } | { connected: true; user: { id: string; login: string }; connectedAt: string } {
  if (!isRecord(value) || typeof value.connected !== "boolean") return false;
  if (!value.connected) return true;
  return (
    isRecord(value.user) &&
    typeof value.user.id === "string" &&
    typeof value.user.login === "string" &&
    typeof value.connectedAt === "string"
  );
}

export function isGitHubInstallationList(value: unknown): value is { installations: GitHubInstallationOption[] } {
  return isRecord(value) && Array.isArray(value.installations) && value.installations.every(isGitHubInstallationOption);
}

export function isGitHubRepositoryList(value: unknown): value is { repositories: GitHubRepositoryOption[] } {
  return isRecord(value) && Array.isArray(value.repositories) && value.repositories.every(isGitHubRepositoryOption);
}

export function isGitHubBranchList(
  value: unknown,
): value is { repository: GitHubRepositoryOption; branches: { name: string; protected: boolean }[] } {
  return (
    isRecord(value) &&
    isGitHubRepositoryOption(value.repository) &&
    Array.isArray(value.branches) &&
    value.branches.every((branch) => isRecord(branch) && typeof branch.name === "string" && typeof branch.protected === "boolean")
  );
}

export function isGitHubImportPreview(value: unknown): value is {
  id: string;
  commitSha: string;
  entryPath: string;
  files: Array<{ path: string; bytes: number }>;
} {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.commitSha === "string" &&
    typeof value.entryPath === "string" &&
    Array.isArray(value.files) &&
    value.files.every((file) => isRecord(file) && typeof file.path === "string" && typeof file.bytes === "number")
  );
}

export function isGitHubSyncState(value: unknown): value is {
  owner: string;
  repository: string;
  branch: string;
  rootPath: string;
  commitSha: string;
} {
  return (
    isRecord(value) &&
    typeof value.owner === "string" &&
    typeof value.repository === "string" &&
    typeof value.branch === "string" &&
    typeof value.rootPath === "string" &&
    typeof value.commitSha === "string"
  );
}

export function isGitHubPullPreview(value: unknown): value is {
  id: string;
  plan: {
    changes: Array<{ base: { path: string } | null; remote: { path: string } | null }>;
    blocking: Array<{
      base: { path: string; content: string } | null;
      local: { path: string; content: string } | null;
      remote: { path: string; content: string } | null;
    }>;
  };
} {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.plan)) return false;
  return (
    Array.isArray(value.plan.changes) &&
    value.plan.changes.every(isGitHubPullChange) &&
    Array.isArray(value.plan.blocking) &&
    value.plan.blocking.every(isGitHubPullConflict)
  );
}

export function isGitHubPublishPreview(value: unknown): value is {
  id: string;
  expectedRemoteHead: string;
  plan: {
    changes: Array<{ path: string; content: string | null }>;
    skippedLocalPaths: string[];
    blocking: unknown[];
  };
} {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.expectedRemoteHead !== "string" || !isRecord(value.plan)) {
    return false;
  }
  return (
    Array.isArray(value.plan.changes) &&
    value.plan.changes.every(
      (change) => isRecord(change) && typeof change.path === "string" && (typeof change.content === "string" || change.content === null),
    ) &&
    Array.isArray(value.plan.skippedLocalPaths) &&
    value.plan.skippedLocalPaths.every((path) => typeof path === "string") &&
    Array.isArray(value.plan.blocking)
  );
}

export function isLatexImportPreview(value: unknown): value is LatexImportPreview {
  if (!isRecord(value) || typeof value.digest !== "string" || !/^[a-f0-9]{64}$/u.test(value.digest) || !isRecord(value.archive)) {
    return false;
  }
  if (!isLatexArchive(value.archive)) return false;
  if (value.conversion === null) return true;
  return isLatexConversion(value.conversion);
}

export function isCreatedAnnotation(value: unknown): value is AnnotationResource {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.pdfId === "string" &&
    typeof value.page === "number" &&
    typeof value.quote === "string" &&
    typeof value.prefix === "string" &&
    typeof value.suffix === "string" &&
    typeof value.comment === "string" &&
    Array.isArray(value.rects) &&
    Array.isArray(value.fragments) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function isShareLinkStatus(value: unknown): value is ShareLinkStatus {
  return isRecord(value) && typeof value.active === "boolean" && isNullableString(value.createdAt) && isNullableString(value.href);
}

function isWebSnapshotComparisonHunk(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.beforeLine === "number" &&
    typeof value.afterLine === "number" &&
    Array.isArray(value.removed) &&
    value.removed.every((line) => typeof line === "string") &&
    Array.isArray(value.added) &&
    value.added.every((line) => typeof line === "string") &&
    typeof value.truncated === "boolean"
  );
}

function isGitHubInstallationOption(value: unknown): value is GitHubInstallationOption {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    typeof value.accountId === "string" &&
    typeof value.accountLogin === "string" &&
    (value.accountType === "Organization" || value.accountType === "User")
  );
}

function isGitHubRepositoryOption(value: unknown): value is GitHubRepositoryOption {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    typeof value.owner === "string" &&
    typeof value.name === "string" &&
    typeof value.fullName === "string" &&
    typeof value.private === "boolean" &&
    typeof value.defaultBranch === "string"
  );
}

function isGitHubPullChange(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.base === null || (isRecord(value.base) && typeof value.base.path === "string")) &&
    (value.remote === null || (isRecord(value.remote) && typeof value.remote.path === "string"))
  );
}

function isGitHubPullConflict(value: unknown): boolean {
  return isRecord(value) && [value.base, value.local, value.remote].every(isGitHubConflictFile);
}

function isGitHubConflictFile(value: unknown): boolean {
  return value === null || (isRecord(value) && typeof value.path === "string" && typeof value.content === "string");
}

function isLatexArchive(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.files) &&
    value.files.every(isLatexArchiveFile) &&
    Array.isArray(value.rootCandidates) &&
    value.rootCandidates.every((path) => typeof path === "string")
  );
}

function isLatexArchiveFile(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.kind === "string" &&
    typeof value.bytes === "number" &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes >= 0
  );
}

function isLatexConversion(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.seed) || !isRecord(value.report)) return false;
  return (
    Array.isArray(value.seed.files) &&
    value.seed.files.every((file) => isRecord(file) && typeof file.path === "string" && typeof file.content === "string") &&
    typeof value.seed.bibliography === "string" &&
    Array.isArray(value.assets) &&
    value.assets.every(isLatexAsset) &&
    typeof value.report.rootPath === "string" &&
    (value.report.bibliographyPath === null || typeof value.report.bibliographyPath === "string") &&
    Array.isArray(value.report.diagnostics) &&
    value.report.diagnostics.every(isLatexDiagnostic)
  );
}

function isLatexAsset(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.mediaType === "string" &&
    typeof value.bytes === "number" &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes > 0
  );
}

function isLatexDiagnostic(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.severity === "error" || value.severity === "warning" || value.severity === "info") &&
    typeof value.message === "string"
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
