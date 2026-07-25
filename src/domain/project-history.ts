import * as v from "valibot";
import { compareWebSnapshotText, type WebSnapshotDiffHunk } from "./reference-library";
import { composeProject, type ProjectAsset, type ProjectFile, type ProjectFolder } from "./project-files";
import { countPublicationWords } from "./publication-statistics";
import type {
  AnnotationResource,
  ClaimResource,
  ManuscriptComment,
  PdfResource,
  ProjectReferenceLink,
  PublicationPdfLink,
  ReviewArtifactPin,
} from "./workspace";
import { isReviewArtifactPin } from "./workspace";
import type { ResearchShareSnapshot } from "./reference-library";

export interface ProjectMilestone {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly description: string;
  readonly createdAt: string;
}

export interface ProjectRevisionSummary {
  readonly revision: number;
  readonly title: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly fileCount: number;
  readonly milestones: readonly ProjectMilestone[];
}

export interface ProjectRelationshipCounts {
  readonly annotationPassages: number;
  readonly claimEvidence: number;
  readonly claimPassages: number;
  readonly comments: number;
}

export interface ProjectRevisionContent {
  readonly revision: number;
  readonly title: string;
  readonly entryFileId: string;
  readonly source: string;
  readonly bibliography: string;
  readonly files: readonly ProjectFile[];
  readonly folders: readonly ProjectFolder[];
  readonly assets: readonly ProjectAsset[];
  readonly projectReferences: readonly ProjectReferenceLink[];
  readonly researchShares: readonly ResearchShareSnapshot[];
  readonly pdfs: readonly PdfResource[];
  readonly publicationPdfLinks: readonly PublicationPdfLink[];
  readonly annotations: readonly AnnotationResource[];
  readonly claims: readonly ClaimResource[];
  readonly comments: readonly ManuscriptComment[];
  readonly reviewArtifactPins: readonly ReviewArtifactPin[];
  readonly relationships: ProjectRelationshipCounts;
}

export type ProjectFileDiffStatus = "added" | "removed" | "renamed" | "modified" | "unchanged";

export interface ProjectFileDiff {
  readonly id: string;
  readonly status: ProjectFileDiffStatus;
  readonly beforePath: string | null;
  readonly afterPath: string | null;
  readonly addedLines: number;
  readonly removedLines: number;
  readonly hunks: readonly WebSnapshotDiffHunk[];
}

export interface ProjectBinaryDiff {
  readonly id: string;
  readonly status: "added" | "removed" | "modified" | "unchanged";
  readonly before: { readonly name: string; readonly contentType: string; readonly size: number; readonly fingerprint: string } | null;
  readonly after: { readonly name: string; readonly contentType: string; readonly size: number; readonly fingerprint: string } | null;
}

export interface ProjectRevisionDiff {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly files: readonly ProjectFileDiff[];
  readonly composed: {
    readonly addedLines: number;
    readonly removedLines: number;
    readonly beforeWords: number;
    readonly afterWords: number;
    readonly wordDelta: number;
    readonly hunks: readonly WebSnapshotDiffHunk[];
  };
  readonly binaries: readonly ProjectBinaryDiff[];
}

interface BinaryProjection {
  readonly id: string;
  readonly name: string;
  readonly contentType: string;
  readonly size: number;
  readonly fingerprint: string;
}

const revisionSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const nonNegativeIntegerSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const projectMilestoneSchema = v.object({
  id: v.string(),
  revision: revisionSchema,
  name: v.string(),
  description: v.string(),
  createdAt: v.string(),
});
const projectRevisionSummariesSchema = v.array(
  v.object({
    revision: revisionSchema,
    title: v.string(),
    reason: v.string(),
    createdAt: v.string(),
    fileCount: nonNegativeIntegerSchema,
    milestones: v.array(projectMilestoneSchema),
  }),
);
const projectRevisionContentSchema = v.object({
  revision: revisionSchema,
  title: v.string(),
  entryFileId: v.string(),
  source: v.string(),
  bibliography: v.string(),
  files: v.array(
    v.object({
      id: v.string(),
      path: v.string(),
      mediaType: v.literal("text/markdown"),
      content: v.string(),
      createdAt: v.string(),
      updatedAt: v.string(),
    }),
  ),
  folders: v.array(
    v.object({
      id: v.string(),
      path: v.string(),
      createdAt: v.string(),
      updatedAt: v.string(),
    }),
  ),
  assets: v.array(
    v.object({
      id: v.string(),
      path: v.string(),
      mediaType: v.string(),
      size: v.number(),
      objectKey: v.string(),
      fingerprint: v.string(),
      createdAt: v.string(),
      updatedAt: v.string(),
    }),
  ),
  projectReferences: v.array(v.unknown()),
  researchShares: v.array(v.unknown()),
  pdfs: v.array(v.unknown()),
  publicationPdfLinks: v.array(v.unknown()),
  annotations: v.array(v.unknown()),
  claims: v.array(v.unknown()),
  comments: v.array(v.unknown()),
  reviewArtifactPins: v.array(v.custom<ReviewArtifactPin>(isReviewArtifactPin)),
  relationships: v.object({
    annotationPassages: nonNegativeIntegerSchema,
    claimEvidence: nonNegativeIntegerSchema,
    claimPassages: nonNegativeIntegerSchema,
    comments: nonNegativeIntegerSchema,
  }),
});
const projectRevisionDiffSchema = v.object({
  fromRevision: revisionSchema,
  toRevision: revisionSchema,
  files: v.array(
    v.object({
      id: v.string(),
      status: v.picklist(["added", "removed", "renamed", "modified", "unchanged"]),
      addedLines: v.pipe(v.number(), v.safeInteger()),
      removedLines: v.pipe(v.number(), v.safeInteger()),
      hunks: v.array(v.unknown()),
    }),
  ),
  composed: v.pipe(
    v.object({
      addedLines: v.pipe(v.number(), v.safeInteger()),
      removedLines: v.pipe(v.number(), v.safeInteger()),
      beforeWords: nonNegativeIntegerSchema,
      afterWords: nonNegativeIntegerSchema,
      wordDelta: v.pipe(v.number(), v.safeInteger()),
      hunks: v.array(v.unknown()),
    }),
    v.check((composed) => composed.wordDelta === composed.afterWords - composed.beforeWords),
  ),
  binaries: v.array(v.unknown()),
});

export function compareProjectRevisions(before: ProjectRevisionContent, after: ProjectRevisionContent): ProjectRevisionDiff {
  const files = stableUnion(
    before.files.map((file) => file.id),
    after.files.map((file) => file.id),
  ).map((id): ProjectFileDiff => {
    const previous = before.files.find((file) => file.id === id);
    const next = after.files.find((file) => file.id === id);
    const comparison = compareWebSnapshotText(previous?.content ?? "", next?.content ?? "");
    const status: ProjectFileDiffStatus = !previous
      ? "added"
      : !next
        ? "removed"
        : previous.path !== next.path
          ? "renamed"
          : comparison.identical
            ? "unchanged"
            : "modified";
    return {
      id,
      status,
      beforePath: previous?.path ?? null,
      afterPath: next?.path ?? null,
      addedLines: comparison.addedLines,
      removedLines: comparison.removedLines,
      hunks: comparison.hunks,
    };
  });

  const beforeComposed = composedSource(before);
  const afterComposed = composedSource(after);
  const composed = compareWebSnapshotText(beforeComposed, afterComposed);
  const beforeWords = countPublicationWords(beforeComposed);
  const afterWords = countPublicationWords(afterComposed);
  const beforeBinaries = [...before.pdfs, ...before.assets.map(assetAsBinary)];
  const afterBinaries = [...after.pdfs, ...after.assets.map(assetAsBinary)];
  const binaries = stableUnion(
    beforeBinaries.map((binary) => binary.id),
    afterBinaries.map((binary) => binary.id),
  ).map((id): ProjectBinaryDiff => {
    const previous = beforeBinaries.find((binary) => binary.id === id);
    const next = afterBinaries.find((binary) => binary.id === id);
    const beforeIdentity = previous ? binaryIdentity(previous) : null;
    const afterIdentity = next ? binaryIdentity(next) : null;
    return {
      id,
      status: !previous ? "added" : !next ? "removed" : binaryEqual(previous, next) ? "unchanged" : "modified",
      before: beforeIdentity,
      after: afterIdentity,
    };
  });

  return {
    fromRevision: before.revision,
    toRevision: after.revision,
    files,
    composed: {
      addedLines: composed.addedLines,
      removedLines: composed.removedLines,
      beforeWords,
      afterWords,
      wordDelta: afterWords - beforeWords,
      hunks: composed.hunks,
    },
    binaries,
  };
}

export function isProjectRevisionSummaries(value: unknown): value is ProjectRevisionSummary[] {
  return v.is(projectRevisionSummariesSchema, value);
}

export function isProjectRevisionContent(value: unknown): value is ProjectRevisionContent {
  return v.is(projectRevisionContentSchema, value);
}

function assetAsBinary(asset: ProjectAsset): BinaryProjection {
  return {
    id: asset.id,
    name: asset.path,
    contentType: asset.mediaType,
    size: asset.size,
    fingerprint: asset.fingerprint,
  };
}

export function isProjectRevisionDiff(value: unknown): value is ProjectRevisionDiff {
  return v.is(projectRevisionDiffSchema, value);
}

function composedSource(value: ProjectRevisionContent): string {
  return value.files.some((file) => file.id === value.entryFileId)
    ? composeProject(value.files, value.entryFileId, {}, value.reviewArtifactPins).content
    : value.source;
}

function binaryIdentity(value: BinaryProjection): Omit<BinaryProjection, "id"> {
  return { name: value.name, contentType: value.contentType, size: value.size, fingerprint: value.fingerprint };
}

function binaryEqual(left: BinaryProjection, right: BinaryProjection): boolean {
  return (
    left.name === right.name && left.contentType === right.contentType && left.size === right.size && left.fingerprint === right.fingerprint
  );
}

function stableUnion(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])].sort((a, b) => a.localeCompare(b));
}
