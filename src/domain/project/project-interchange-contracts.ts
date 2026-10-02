import * as v from "valibot";
import { isRecord } from "../unknown-value";
import { isSha256Hex } from "../sha256";
import type { ProjectArchiveSummary } from "./project-archive";
import type { ProjectSourceSummary } from "./project-source-archive";

const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const summarySchema = v.object({
  title: v.pipe(v.string(), v.maxLength(120)),
  entryPath: v.pipe(v.string(), v.maxLength(1_024)),
  files: count,
  references: count,
  images: count,
  pdfs: count,
  sharedSnapshots: count,
  exclusions: v.pipe(v.array(v.pipe(v.string(), v.maxLength(2_000))), v.maxLength(128)),
});
export interface ProjectImportPreview {
  readonly kind: "native" | "source" | "legacy";
  readonly summary: ProjectArchiveSummary;
  readonly archiveSha256: string;
  readonly previewDigest: string | null;
  readonly reusedReferences: number;
  readonly newReferences: number;
  readonly source?: ProjectSourceSummary;
}
const sourceSchema = v.object({
  entryCandidates: v.pipe(v.array(v.pipe(v.string(), v.maxLength(1_024))), v.minLength(1), v.maxLength(512)),
  bibliographyCandidates: v.pipe(v.array(v.pipe(v.string(), v.maxLength(1_024))), v.maxLength(1_024)),
  bibliographyPath: v.pipe(v.string(), v.maxLength(1_024)),
  includePdfs: v.boolean(),
  skippedEntries: count,
});
export function isProjectArchiveSummary(value: unknown): value is ProjectArchiveSummary {
  return v.safeParse(summarySchema, value).success;
}
export function isProjectImportPreview(value: unknown): value is ProjectImportPreview {
  return (
    isRecord(value) &&
    (value.kind === "native" || value.kind === "source" || value.kind === "legacy") &&
    isProjectArchiveSummary(value.summary) &&
    isSha256Hex(value.archiveSha256) &&
    (value.kind !== "legacy" ? isSha256Hex(value.previewDigest) : value.previewDigest === null) &&
    (value.kind !== "source" || v.safeParse(sourceSchema, value.source).success) &&
    v.safeParse(count, value.reusedReferences).success &&
    v.safeParse(count, value.newReferences).success
  );
}
export function isProjectImportResult(value: unknown): value is { workspace: { href: string } } {
  return (
    isRecord(value) &&
    isRecord(value.workspace) &&
    typeof value.workspace.href === "string" &&
    /^\/editor\/[a-z0-9-]+$/iu.test(value.workspace.href)
  );
}
