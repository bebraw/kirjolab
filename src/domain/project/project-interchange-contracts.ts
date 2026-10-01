import * as v from "valibot";
import { isRecord } from "../unknown-value";
import { isSha256Hex } from "../sha256";
import type { ProjectArchiveSummary } from "./project-archive";

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
  readonly kind: "native" | "legacy";
  readonly summary: ProjectArchiveSummary;
  readonly archiveSha256: string;
  readonly previewDigest: string | null;
  readonly reusedReferences: number;
  readonly newReferences: number;
}
export function isProjectArchiveSummary(value: unknown): value is ProjectArchiveSummary {
  return v.safeParse(summarySchema, value).success;
}
export function isProjectImportPreview(value: unknown): value is ProjectImportPreview {
  return (
    isRecord(value) &&
    (value.kind === "native" || value.kind === "legacy") &&
    isProjectArchiveSummary(value.summary) &&
    isSha256Hex(value.archiveSha256) &&
    (value.kind === "native" ? isSha256Hex(value.previewDigest) : value.previewDigest === null) &&
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
