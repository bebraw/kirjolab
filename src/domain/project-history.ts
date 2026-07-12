import { compareWebSnapshotText, type WebSnapshotDiffHunk } from "./reference-library";
import { composeProject, type ProjectFile } from "./project-files";
import type { AnnotationResource, ClaimResource, PdfResource, ProjectReferenceLink, PublicationPdfLink } from "./workspace";
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
}

export interface ProjectRevisionContent {
  readonly revision: number;
  readonly title: string;
  readonly entryFileId: string;
  readonly source: string;
  readonly bibliography: string;
  readonly files: readonly ProjectFile[];
  readonly projectReferences: readonly ProjectReferenceLink[];
  readonly researchShares: readonly ResearchShareSnapshot[];
  readonly pdfs: readonly PdfResource[];
  readonly publicationPdfLinks: readonly PublicationPdfLink[];
  readonly annotations: readonly AnnotationResource[];
  readonly claims: readonly ClaimResource[];
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
  readonly before: Pick<PdfResource, "name" | "contentType" | "size" | "fingerprint"> | null;
  readonly after: Pick<PdfResource, "name" | "contentType" | "size" | "fingerprint"> | null;
}

export interface ProjectRevisionDiff {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly files: readonly ProjectFileDiff[];
  readonly composed: {
    readonly addedLines: number;
    readonly removedLines: number;
    readonly hunks: readonly WebSnapshotDiffHunk[];
  };
  readonly binaries: readonly ProjectBinaryDiff[];
}

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

  const composed = compareWebSnapshotText(composedSource(before), composedSource(after));
  const binaries = stableUnion(
    before.pdfs.map((pdf) => pdf.id),
    after.pdfs.map((pdf) => pdf.id),
  ).map((id): ProjectBinaryDiff => {
    const previous = before.pdfs.find((pdf) => pdf.id === id);
    const next = after.pdfs.find((pdf) => pdf.id === id);
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
    composed: { addedLines: composed.addedLines, removedLines: composed.removedLines, hunks: composed.hunks },
    binaries,
  };
}

export function isProjectRevisionSummaries(value: unknown): value is ProjectRevisionSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        isRevision(item.revision) &&
        typeof item.title === "string" &&
        typeof item.reason === "string" &&
        typeof item.createdAt === "string" &&
        Number.isSafeInteger(item.fileCount) &&
        typeof item.fileCount === "number" &&
        item.fileCount >= 0 &&
        Array.isArray(item.milestones) &&
        item.milestones.every(isProjectMilestone),
    )
  );
}

export function isProjectRevisionContent(value: unknown): value is ProjectRevisionContent {
  return (
    isRecord(value) &&
    isRevision(value.revision) &&
    typeof value.title === "string" &&
    typeof value.entryFileId === "string" &&
    typeof value.source === "string" &&
    typeof value.bibliography === "string" &&
    Array.isArray(value.files) &&
    value.files.every(
      (file) =>
        isRecord(file) &&
        typeof file.id === "string" &&
        typeof file.path === "string" &&
        file.mediaType === "text/markdown" &&
        typeof file.content === "string" &&
        typeof file.createdAt === "string" &&
        typeof file.updatedAt === "string",
    ) &&
    Array.isArray(value.projectReferences) &&
    Array.isArray(value.researchShares) &&
    Array.isArray(value.pdfs) &&
    Array.isArray(value.publicationPdfLinks) &&
    Array.isArray(value.annotations) &&
    Array.isArray(value.claims) &&
    isRecord(value.relationships) &&
    Number.isSafeInteger(value.relationships.annotationPassages) &&
    Number.isSafeInteger(value.relationships.claimEvidence) &&
    Number.isSafeInteger(value.relationships.claimPassages)
  );
}

export function isProjectRevisionDiff(value: unknown): value is ProjectRevisionDiff {
  return (
    isRecord(value) &&
    isRevision(value.fromRevision) &&
    isRevision(value.toRevision) &&
    Array.isArray(value.files) &&
    value.files.every(
      (file) =>
        isRecord(file) &&
        typeof file.id === "string" &&
        ["added", "removed", "renamed", "modified", "unchanged"].includes(String(file.status)) &&
        Number.isSafeInteger(file.addedLines) &&
        Number.isSafeInteger(file.removedLines) &&
        Array.isArray(file.hunks),
    ) &&
    isRecord(value.composed) &&
    Number.isSafeInteger(value.composed.addedLines) &&
    Number.isSafeInteger(value.composed.removedLines) &&
    Array.isArray(value.composed.hunks) &&
    Array.isArray(value.binaries)
  );
}

function composedSource(value: ProjectRevisionContent): string {
  return value.files.some((file) => file.id === value.entryFileId) ? composeProject(value.files, value.entryFileId).content : value.source;
}

function binaryIdentity(value: PdfResource): Pick<PdfResource, "name" | "contentType" | "size" | "fingerprint"> {
  return { name: value.name, contentType: value.contentType, size: value.size, fingerprint: value.fingerprint };
}

function binaryEqual(left: PdfResource, right: PdfResource): boolean {
  return (
    left.name === right.name && left.contentType === right.contentType && left.size === right.size && left.fingerprint === right.fingerprint
  );
}

function stableUnion(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])].sort((a, b) => a.localeCompare(b));
}

function isProjectMilestone(value: unknown): value is ProjectMilestone {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isRevision(value.revision) &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.createdAt === "string"
  );
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
