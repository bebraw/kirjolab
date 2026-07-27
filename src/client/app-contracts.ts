import * as v from "valibot";
import type { WebSnapshot, WebSnapshotComparison } from "../domain/reference-library";
import type { AnnotationResource } from "../domain/workspace";

const safeIntegerSchema = v.pipe(v.number(), v.safeInteger());
const nonNegativeIntegerSchema = v.pipe(safeIntegerSchema, v.minValue(0));
const positiveIntegerSchema = v.pipe(safeIntegerSchema, v.minValue(1));
const nullableStringSchema = v.nullable(v.string());
const appBootstrapSchema = v.object({
  workspaceId: v.pipe(v.string(), v.regex(/^[a-z0-9-]{1,64}$/iu)),
  identityEmail: v.pipe(v.string(), v.minLength(1), v.maxLength(320)),
  appMode: v.picklist(["workspace", "library"]),
});

const webSnapshotComparisonHunkSchema = v.object({
  beforeLine: v.number(),
  afterLine: v.number(),
  removed: v.array(v.string()),
  added: v.array(v.string()),
  truncated: v.boolean(),
});
const webSnapshotComparisonResponseSchema = v.object({
  before: v.object({ id: v.string() }),
  after: v.object({ id: v.string() }),
  comparison: v.object({
    identical: v.boolean(),
    addedLines: v.number(),
    removedLines: v.number(),
    hunks: v.array(webSnapshotComparisonHunkSchema),
  }),
});

const gitHubInstallationOptionSchema = v.object({
  id: safeIntegerSchema,
  accountId: v.string(),
  accountLogin: v.string(),
  accountType: v.picklist(["Organization", "User"]),
});
const gitHubRepositoryOptionSchema = v.object({
  id: safeIntegerSchema,
  owner: v.string(),
  name: v.string(),
  fullName: v.string(),
  private: v.boolean(),
  defaultBranch: v.string(),
});
const gitHubBranchOptionSchema = v.object({
  name: v.string(),
  protected: v.boolean(),
});
const gitHubConnectionStateSchema = v.variant("connected", [
  v.object({ connected: v.literal(false) }),
  v.object({
    connected: v.literal(true),
    user: v.object({ id: v.string(), login: v.string() }),
    connectedAt: v.string(),
  }),
]);
const gitHubInstallationListSchema = v.object({
  installations: v.array(gitHubInstallationOptionSchema),
});
const gitHubRepositoryListSchema = v.object({
  repositories: v.array(gitHubRepositoryOptionSchema),
});
const gitHubBranchListSchema = v.object({
  repository: gitHubRepositoryOptionSchema,
  branches: v.array(gitHubBranchOptionSchema),
});
const gitHubImportPreviewSchema = v.object({
  id: v.string(),
  commitSha: v.string(),
  entryPath: v.string(),
  files: v.array(v.object({ path: v.string(), bytes: v.number() })),
});
const gitHubImportResultSchema = v.object({
  workspace: v.object({ href: v.string() }),
});
const gitHubSyncStateSchema = v.object({
  owner: v.string(),
  repository: v.string(),
  branch: v.string(),
  rootPath: v.string(),
  commitSha: v.string(),
});
const gitHubPullPathSchema = v.nullable(v.object({ path: v.string() }));
const gitHubConflictFileSchema = v.nullable(v.object({ path: v.string(), content: v.string() }));
const gitHubPullPreviewSchema = v.object({
  id: v.string(),
  plan: v.object({
    changes: v.array(v.object({ base: gitHubPullPathSchema, remote: gitHubPullPathSchema })),
    blocking: v.array(
      v.object({
        base: gitHubConflictFileSchema,
        local: gitHubConflictFileSchema,
        remote: gitHubConflictFileSchema,
      }),
    ),
  }),
});
const gitHubPublishPreviewSchema = v.object({
  id: v.string(),
  expectedRemoteHead: v.string(),
  plan: v.object({
    changes: v.array(v.object({ path: v.string(), content: v.nullable(v.string()) })),
    skippedLocalPaths: v.array(v.string()),
    blocking: v.array(v.unknown()),
  }),
});

export type GitHubPullPreview = v.InferInput<typeof gitHubPullPreviewSchema>;
export type GitHubPublishPreview = v.InferInput<typeof gitHubPublishPreviewSchema>;

const latexArchiveSchema = v.object({
  files: v.array(
    v.object({
      path: v.string(),
      kind: v.string(),
      bytes: nonNegativeIntegerSchema,
    }),
  ),
  rootCandidates: v.array(v.string()),
});
const latexConversionSchema = v.object({
  seed: v.object({
    files: v.array(v.object({ path: v.string(), content: v.string() })),
    bibliography: v.string(),
  }),
  assets: v.array(
    v.object({
      path: v.string(),
      mediaType: v.string(),
      bytes: positiveIntegerSchema,
    }),
  ),
  report: v.object({
    rootPath: v.string(),
    bibliographyPath: nullableStringSchema,
    diagnostics: v.array(
      v.object({
        severity: v.picklist(["error", "warning", "info"]),
        message: v.string(),
      }),
    ),
  }),
});
const latexImportPreviewSchema = v.object({
  digest: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u)),
  archive: latexArchiveSchema,
  conversion: v.nullable(latexConversionSchema),
});
const latexImportResultSchema = v.object({
  workspace: v.object({ href: v.string() }),
});
const createdAnnotationSchema = v.object({
  id: v.string(),
  pdfId: v.string(),
  page: v.number(),
  quote: v.string(),
  prefix: v.string(),
  suffix: v.string(),
  comment: v.string(),
  rects: v.array(v.unknown()),
  fragments: v.array(v.unknown()),
  createdAt: v.string(),
  updatedAt: v.string(),
});
const shareLinkStatusSchema = v.object({
  active: v.boolean(),
  createdAt: nullableStringSchema,
  href: nullableStringSchema,
});
const shareLinkResultSchema = v.object({ href: v.string() });

export type GitHubInstallationOption = Readonly<v.InferInput<typeof gitHubInstallationOptionSchema>>;
export type GitHubRepositoryOption = Readonly<v.InferInput<typeof gitHubRepositoryOptionSchema>>;
export type GitHubBranchOption = Readonly<v.InferInput<typeof gitHubBranchOptionSchema>>;
export type GitHubImportPreview = Readonly<v.InferInput<typeof gitHubImportPreviewSchema>>;
export type LatexImportPreview = Readonly<v.InferInput<typeof latexImportPreviewSchema>>;
export type AppBootstrap = Readonly<v.InferInput<typeof appBootstrapSchema>>;

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

export function parseAppBootstrap(value: unknown): AppBootstrap {
  const result = v.safeParse(appBootstrapSchema, value);
  if (!result.success) throw new Error("Invalid application bootstrap");
  return result.output;
}

export function isWebSnapshotComparisonResponse(value: unknown): value is WebSnapshotComparisonResponse {
  return v.is(webSnapshotComparisonResponseSchema, value);
}

export function isGitHubConnectionState(value: unknown): value is v.InferInput<typeof gitHubConnectionStateSchema> {
  return v.is(gitHubConnectionStateSchema, value);
}

export function isGitHubInstallationList(value: unknown): value is v.InferInput<typeof gitHubInstallationListSchema> {
  return v.is(gitHubInstallationListSchema, value);
}

export function isGitHubRepositoryList(value: unknown): value is v.InferInput<typeof gitHubRepositoryListSchema> {
  return v.is(gitHubRepositoryListSchema, value);
}

export function isGitHubBranchList(value: unknown): value is v.InferInput<typeof gitHubBranchListSchema> {
  return v.is(gitHubBranchListSchema, value);
}

export function isGitHubImportPreview(value: unknown): value is v.InferInput<typeof gitHubImportPreviewSchema> {
  return v.is(gitHubImportPreviewSchema, value);
}

export function isGitHubImportResult(value: unknown): value is v.InferInput<typeof gitHubImportResultSchema> {
  return v.is(gitHubImportResultSchema, value);
}

export function isGitHubSyncState(value: unknown): value is v.InferInput<typeof gitHubSyncStateSchema> {
  return v.is(gitHubSyncStateSchema, value);
}

export function isGitHubPullPreview(value: unknown): value is v.InferInput<typeof gitHubPullPreviewSchema> {
  return v.is(gitHubPullPreviewSchema, value);
}

export function isGitHubPublishPreview(value: unknown): value is v.InferInput<typeof gitHubPublishPreviewSchema> {
  return v.is(gitHubPublishPreviewSchema, value);
}

export function isLatexImportPreview(value: unknown): value is LatexImportPreview {
  return v.is(latexImportPreviewSchema, value);
}

export function isLatexImportResult(value: unknown): value is v.InferInput<typeof latexImportResultSchema> {
  return v.is(latexImportResultSchema, value);
}

export function isCreatedAnnotation(value: unknown): value is AnnotationResource {
  return v.is(createdAnnotationSchema, value);
}

export function isShareLinkStatus(value: unknown): value is ShareLinkStatus {
  return v.is(shareLinkStatusSchema, value);
}

export function isShareLinkResult(value: unknown): value is { readonly href: string } {
  return v.is(shareLinkResultSchema, value);
}
