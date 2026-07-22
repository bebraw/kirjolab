import { strToU8, zipSync, type Zippable } from "fflate";
import { reviewAnalysisDefinitionSchemaVersion } from "./review-synthesis";
import { reviewAuthorityJson, reviewHistoryJson, stableReviewJson } from "./review-export-json";
import { reviewPrismaData, reviewPrismaSvg } from "./review-export-prisma";
import { reviewBibliographyBibTeX, reviewExtractionCsv } from "./review-export-tabular";
import { reviewExportSchemaVersion, type ReviewExportAuthority } from "./review-export-types";

const archiveTimestamp = new Date("1980-01-01T00:00:00.000Z");

export async function buildReviewPackage(reviewId: string, authority: ReviewExportAuthority): Promise<Uint8Array> {
  const prisma = reviewPrismaData(authority);
  const files = reviewPackageFiles(authority);
  files["prisma.json"] = stableReviewJson(prisma);
  files["prisma.svg"] = reviewPrismaSvg(prisma);
  const manifestFiles = await Promise.all(
    Object.keys(files)
      .sort()
      .map(async (path) => ({ path, sha256: await sha256(files[path]!), bytes: strToU8(files[path]!).byteLength })),
  );
  files["manifest.json"] = stableReviewJson({
    schemaVersion: reviewExportSchemaVersion,
    generator: "Kirjolab",
    reviewId,
    reviewRevision: authority.revision,
    protocolRevision: authority.protocol.protocol.revision,
    generatedAt: authorityTimestamp(authority),
    files: manifestFiles,
  });
  const zippable: Zippable = {};
  for (const path of Object.keys(files).sort()) {
    zippable[path] = [strToU8(files[path]!), { mtime: archiveTimestamp, os: 3, attrs: 0o100644 << 16 }];
  }
  return zipSync(zippable, { level: 9, mtime: archiveTimestamp, os: 3 });
}

function reviewPackageFiles(authority: ReviewExportAuthority): Record<string, string> {
  const files: Record<string, string> = {
    "analysis-contributors.json": stableReviewJson({
      schemaVersion: reviewAnalysisDefinitionSchemaVersion,
      reviewRevision: authority.revision,
      contributors: authority.synthesis.contributors,
    }),
    "analysis-definitions.json": stableReviewJson({
      schemaVersion: reviewAnalysisDefinitionSchemaVersion,
      reviewRevision: authority.revision,
      protocolRevision: authority.protocol.protocol.revision,
      definitions: authority.synthesis.definitions,
    }),
    "analysis-diagnostics.json": stableReviewJson({
      schemaVersion: reviewAnalysisDefinitionSchemaVersion,
      reviewRevision: authority.revision,
      diagnostics: authority.synthesis.diagnostics,
    }),
    "analysis-findings.json": stableReviewJson({
      schemaVersion: reviewAnalysisDefinitionSchemaVersion,
      reviewRevision: authority.revision,
      protocolRevision: authority.protocol.protocol.revision,
      findings: authority.synthesis.findings,
    }),
    "finding-history.json": stableReviewJson({
      schemaVersion: reviewAnalysisDefinitionSchemaVersion,
      reviewRevision: authority.revision,
      protocolRevision: authority.protocol.protocol.revision,
      findings: authority.findings.findings,
    }),
    "reassessment.json": stableReviewJson(authority.reassessment),
    "review.json": reviewAuthorityJson(authority),
    "extraction.csv": reviewExtractionCsv(authority),
    "bibliography.bib": reviewBibliographyBibTeX(authority),
    "model-disclosure.json": stableReviewJson(authority.model),
    "history.json": reviewHistoryJson(authority),
    "search-history.json": stableReviewJson({ revision: authority.revision, runs: authority.search.runs }),
  };
  return files;
}

function authorityTimestamp(authority: ReviewExportAuthority): string {
  const values = [
    ...authority.protocol.protocolHistory.map((revision) => revision.createdAt),
    ...authority.search.runs.map((run) => run.importedAt),
    ...authority.screening.records.flatMap((record) => [
      ...record.titleAbstract.decisions.map((decision) => decision.createdAt),
      ...record.fullText.decisions.map((decision) => decision.createdAt),
      record.titleAbstract.adjudication?.createdAt ?? "",
      record.fullText.adjudication?.createdAt ?? "",
      record.finalInclusion.decision?.createdAt ?? "",
    ]),
    ...authority.evidence.records.flatMap((record) => [
      ...record.qualityValues.map((value) => value.createdAt),
      ...record.extractionValues.map((value) => value.createdAt),
    ]),
    ...authority.model.candidates.map((candidate) => candidate.disposedAt ?? candidate.createdAt),
    ...authority.reassessment.obligations.flatMap((obligation) => (obligation.completedAt ? [obligation.completedAt] : [])),
    ...authority.findings.findings.map((finding) => finding.createdAt),
  ].filter(Boolean);
  return values.sort().at(-1) ?? authority.protocol.protocol.createdAt;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", strToU8(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
