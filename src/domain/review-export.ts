import { strToU8, zipSync, type Zippable } from "fflate";
import { serializeBibTeX, type BibTeXEntry } from "./bibliography";
import type { ReviewEvidenceSnapshot, ReviewSourceSelectorValue } from "./review-evidence";
import type { ReviewFindingsSnapshot } from "./review-findings";
import type { ReviewModelSnapshot } from "./review-model";
import type { ReviewScreeningSnapshot, ScreeningRecordState, ScreeningStage } from "./review-screening";
import type { ReviewSearchSnapshot } from "./review-search";
import type { ReviewReassessmentSnapshot, ReviewStudySnapshot } from "./review-study";
import { reviewAnalysisDefinitionSchemaVersion, type ReviewSynthesis } from "./review-synthesis";

export const reviewExportSchemaVersion = "kirjolab-review-package-v1" as const;
const archiveTimestamp = new Date("1980-01-01T00:00:00.000Z");

export interface ReviewExportAuthority {
  readonly revision: number;
  readonly protocol: ReviewStudySnapshot;
  readonly reassessment: ReviewReassessmentSnapshot;
  readonly search: ReviewSearchSnapshot;
  readonly screening: ReviewScreeningSnapshot;
  readonly evidence: ReviewEvidenceSnapshot;
  readonly model: ReviewModelSnapshot;
  readonly findings: ReviewFindingsSnapshot;
  readonly synthesis: ReviewSynthesis;
}

export interface PrismaFlowData {
  readonly schemaVersion: "prisma-2020-flow-v1";
  readonly reviewRevision: number;
  readonly identified: number;
  readonly duplicatesRemoved: number;
  readonly titleAbstractScreened: number;
  readonly titleAbstractExcluded: number;
  readonly fullTextAssessed: number;
  readonly fullTextExcluded: number;
  readonly included: number;
  readonly exclusionReasons: {
    readonly titleAbstract: Readonly<Record<string, number>>;
    readonly fullText: Readonly<Record<string, number>>;
  };
}

export function reviewAuthorityJson(authority: ReviewExportAuthority): string {
  return stableJson({ schemaVersion: reviewExportSchemaVersion, ...authority });
}

export function reviewHistoryJson(authority: ReviewExportAuthority): string {
  const events = [
    ...authority.protocol.protocolHistory.map((revision) => ({
      at: revision.createdAt,
      actor: revision.createdBy,
      kind: "protocol-revision",
      subject: String(revision.revision),
      detail: revision.rationale,
    })),
    ...authority.search.runs.map((run) => ({
      at: run.importedAt,
      actor: run.importedBy,
      kind: "search-run",
      subject: run.id,
      detail: `${run.sourceName} · ${run.occurrenceCount} occurrences`,
    })),
    ...authority.search.duplicateCandidates
      .filter((candidate) => candidate.resolvedAt && candidate.resolvedBy)
      .map((candidate) => ({
        at: candidate.resolvedAt!,
        actor: candidate.resolvedBy!,
        kind: "duplicate-resolution",
        subject: candidate.id,
        detail: candidate.status,
      })),
    ...authority.screening.records.flatMap((record) => [
      ...record.titleAbstract.decisions.map((decision) =>
        historyEvent("screening-decision", decision.id, decision.createdAt, decision.reviewer, decision.decision),
      ),
      ...record.fullText.decisions.map((decision) =>
        historyEvent("screening-decision", decision.id, decision.createdAt, decision.reviewer, decision.decision),
      ),
      ...(record.titleAbstract.adjudication
        ? [
            historyEvent(
              "screening-adjudication",
              record.titleAbstract.adjudication.id,
              record.titleAbstract.adjudication.createdAt,
              record.titleAbstract.adjudication.adjudicator,
              record.titleAbstract.adjudication.outcome,
            ),
          ]
        : []),
      ...(record.fullText.adjudication
        ? [
            historyEvent(
              "screening-adjudication",
              record.fullText.adjudication.id,
              record.fullText.adjudication.createdAt,
              record.fullText.adjudication.adjudicator,
              record.fullText.adjudication.outcome,
            ),
          ]
        : []),
      ...(record.finalInclusion.decision
        ? [
            historyEvent(
              "final-inclusion-decision",
              record.finalInclusion.decision.id,
              record.finalInclusion.decision.createdAt,
              record.finalInclusion.decision.reviewer,
              record.finalInclusion.decision.outcome,
            ),
          ]
        : []),
    ]),
    ...authority.evidence.records.flatMap((record) => [
      ...record.qualityValues.map((value) => historyEvent("quality-value", value.id, value.createdAt, value.reviewer, value.answerId)),
      ...record.extractionValues.map((value) => historyEvent("extraction-value", value.id, value.createdAt, value.reviewer, value.fieldId)),
    ]),
    ...authority.model.candidates.map((candidate) =>
      historyEvent(
        "model-candidate",
        candidate.id,
        candidate.disposedAt ?? candidate.createdAt,
        candidate.disposedBy ?? candidate.createdBy,
        `${candidate.operation}:${candidate.disposition}`,
      ),
    ),
    ...authority.reassessment.obligations.flatMap((obligation) =>
      obligation.status === "completed" && obligation.completedAt !== null && obligation.completedBy !== null
        ? [
            historyEvent(
              "reassessment-completion",
              obligation.id,
              obligation.completedAt,
              obligation.completedBy,
              `${obligation.stage}:${obligation.completionRationale ?? ""}`,
            ),
          ]
        : [],
    ),
    ...authority.findings.findings.map((finding) =>
      historyEvent("review-finding", finding.id, finding.createdAt, finding.createdBy, finding.researchQuestionId),
    ),
  ].sort(
    (left, right) => left.at.localeCompare(right.at) || left.kind.localeCompare(right.kind) || left.subject.localeCompare(right.subject),
  );
  return stableJson({ revision: authority.revision, events });
}

export function reviewExtractionCsv(authority: ReviewExportAuthority): string {
  const columns = [
    "recordId",
    "title",
    "protocolRevision",
    "fieldId",
    "criterionId",
    "criterionText",
    "field",
    "value",
    "valueSelectorKind",
    "valueResourceId",
    "valueSelectorId",
    "missingReason",
    "evidenceSelectorKind",
    "evidenceResourceId",
    "evidenceSelectorId",
    "quote",
    "page",
    "location",
    "reviewer",
    "createdAt",
  ];
  const fields = new Map(authority.evidence.protocol.extractionFields.map((field) => [field.id, field.label] as const));
  const rows = authority.evidence.records.flatMap((record) =>
    record.extractionValues.map((entry) => [
      record.record.id,
      record.record.metadata.title,
      String(entry.protocolRevision),
      entry.fieldId,
      entry.criterionId,
      entry.criterionText,
      fields.get(entry.fieldId) ?? entry.fieldId,
      extractionCell(entry.value),
      sourceSelector(entry.value)?.kind ?? "",
      sourceSelector(entry.value)?.resourceId ?? "",
      sourceSelector(entry.value)?.selectorId ?? "",
      entry.missingReason ?? "",
      entry.evidence?.kind ?? "",
      entry.evidence?.resourceId ?? "",
      entry.evidence?.selectorId ?? "",
      entry.evidence?.quote ?? "",
      entry.evidence?.page === null || entry.evidence?.page === undefined ? "" : String(entry.evidence.page),
      entry.evidence?.location ?? "",
      entry.reviewer,
      entry.createdAt,
    ]),
  );
  return `${columns.map(csvCell).join(",")}\n${rows.map((row) => row.map(csvCell).join(",")).join("\n")}${rows.length ? "\n" : ""}`;
}

function extractionCell(value: ReviewEvidenceSnapshot["records"][number]["extractionValues"][number]["value"]): string {
  if (value === null) return "";
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sourceSelector(
  value: ReviewEvidenceSnapshot["records"][number]["extractionValues"][number]["value"],
): { readonly kind: string; readonly resourceId: string; readonly selectorId: string } | null {
  return isSourceSelectorValue(value) ? value : null;
}

function isSourceSelectorValue(value: unknown): value is ReviewSourceSelectorValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    (value.kind === "pdf-annotation" || value.kind === "web-passage") &&
    "resourceId" in value &&
    typeof value.resourceId === "string" &&
    "selectorId" in value &&
    typeof value.selectorId === "string"
  );
}

export function reviewBibliographyBibTeX(authority: ReviewExportAuthority): string {
  const stateByRecord = new Map(authority.screening.records.map((record) => [record.record.id, record] as const));
  const entries: BibTeXEntry[] = authority.search.records
    .filter((record) => record.state === "active")
    .map((record) => {
      const metadata = record.metadata;
      const venueField = metadata.type === "inproceedings" ? "booktitle" : "journal";
      const fields: Record<string, string> = {
        title: metadata.title,
        author: metadata.authors.join(" and "),
        year: metadata.year,
        [venueField]: metadata.venue,
        doi: metadata.doi,
        url: metadata.url,
        abstract: metadata.abstract,
        kirjolab_status: screeningStatus(stateByRecord.get(record.id)),
        kirjolab_record_id: record.id,
      };
      return {
        type: metadata.type || "article",
        citationKey: `${metadata.citationKey}_${record.id.slice(0, 8)}`,
        fields: Object.fromEntries(Object.entries(fields).filter(([, value]) => value.trim())),
      };
    });
  return serializeBibTeX(entries);
}

export function reviewPrismaData(authority: ReviewExportAuthority): PrismaFlowData {
  return {
    schemaVersion: "prisma-2020-flow-v1",
    reviewRevision: authority.revision,
    ...authority.synthesis.flow,
    exclusionReasons: {
      titleAbstract: exclusionReasons(authority.screening.records, "title-abstract"),
      fullText: exclusionReasons(authority.screening.records, "full-text"),
    },
  };
}

export function reviewPrismaSvg(data: PrismaFlowData): string {
  const boxes = [
    ["Records identified", data.identified],
    ["Duplicates removed", data.duplicatesRemoved],
    ["Records screened", data.titleAbstractScreened],
    ["Records excluded", data.titleAbstractExcluded],
    ["Full texts assessed", data.fullTextAssessed],
    ["Full texts excluded", data.fullTextExcluded],
    ["Studies included", data.included],
  ] as const;
  const nodes = boxes
    .map(([label, count], index) => {
      const y = 30 + index * 100;
      return `<g><rect x="40" y="${y}" width="360" height="64" rx="8"/><text x="220" y="${y + 27}" text-anchor="middle">${escapeXml(label)}</text><text x="220" y="${y + 49}" text-anchor="middle" font-weight="700">n = ${count}</text></g>`;
    })
    .join("");
  const arrows = boxes
    .slice(0, -1)
    .map((_box, index) => `<path d="M220 ${94 + index * 100} V${130 + index * 100}" marker-end="url(#arrow)"/>`)
    .join("");
  const description = `PRISMA flow for review revision ${data.reviewRevision}: ${data.identified} records identified, ${data.duplicatesRemoved} duplicates removed, and ${data.included} studies included.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 730" role="img" aria-labelledby="title description"><title id="title">PRISMA study flow</title><desc id="description">${escapeXml(description)}</desc><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z"/></marker></defs><style>rect{fill:#fff;stroke:#334155;stroke-width:2}path{fill:none;stroke:#334155;stroke-width:2}text{font-family:system-ui,sans-serif;font-size:15px;fill:#0f172a}</style>${arrows}${nodes}</svg>\n`;
}

export async function buildReviewPackage(workspaceId: string, authority: ReviewExportAuthority): Promise<Uint8Array> {
  const prisma = reviewPrismaData(authority);
  const files: Record<string, string> = {
    "analysis-contributors.json": stableJson({
      schemaVersion: reviewAnalysisDefinitionSchemaVersion,
      reviewRevision: authority.revision,
      contributors: authority.synthesis.contributors,
    }),
    "analysis-definitions.json": stableJson({
      schemaVersion: reviewAnalysisDefinitionSchemaVersion,
      reviewRevision: authority.revision,
      protocolRevision: authority.protocol.protocol.revision,
      definitions: authority.synthesis.definitions,
    }),
    "analysis-diagnostics.json": stableJson({
      schemaVersion: reviewAnalysisDefinitionSchemaVersion,
      reviewRevision: authority.revision,
      diagnostics: authority.synthesis.diagnostics,
    }),
    "analysis-findings.json": stableJson({
      schemaVersion: reviewAnalysisDefinitionSchemaVersion,
      reviewRevision: authority.revision,
      protocolRevision: authority.protocol.protocol.revision,
      findings: authority.synthesis.findings,
    }),
    "finding-history.json": stableJson({
      schemaVersion: reviewAnalysisDefinitionSchemaVersion,
      reviewRevision: authority.revision,
      protocolRevision: authority.protocol.protocol.revision,
      findings: authority.findings.findings,
    }),
    "reassessment.json": stableJson(authority.reassessment),
    "review.json": reviewAuthorityJson(authority),
    "extraction.csv": reviewExtractionCsv(authority),
    "bibliography.bib": reviewBibliographyBibTeX(authority),
    "prisma.json": stableJson(prisma),
    "prisma.svg": reviewPrismaSvg(prisma),
    "model-disclosure.json": stableJson(authority.model),
    "history.json": reviewHistoryJson(authority),
    "search-history.json": stableJson({ revision: authority.revision, runs: authority.search.runs }),
  };
  const manifestFiles = await Promise.all(
    Object.keys(files)
      .sort()
      .map(async (path) => ({ path, sha256: await sha256(files[path]!), bytes: strToU8(files[path]!).byteLength })),
  );
  files["manifest.json"] = stableJson({
    schemaVersion: reviewExportSchemaVersion,
    generator: "Kirjolab",
    workspaceId,
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

function historyEvent(kind: string, subject: string, at: string, actor: string, detail: string) {
  return { at, actor, kind, subject, detail };
}

export function stableReviewJson(value: unknown): string {
  return stableJson(value);
}

function screeningStatus(record: ScreeningRecordState | undefined): string {
  if (!record) return "unclassified";
  if (record.finalInclusion.outcome === "include") return "included";
  if (record.finalInclusion.outcome === "exclude") return "excluded-final";
  if (record.fullText.outcome === "include") return "awaiting-final-inclusion";
  if (record.fullText.outcome === "exclude") return "excluded-full-text";
  if (record.titleAbstract.outcome === "exclude") return "excluded-title-abstract";
  return record.titleAbstract.outcome;
}

function exclusionReasons(records: readonly ScreeningRecordState[], stage: ScreeningStage): Readonly<Record<string, number>> {
  const reasons = new Map<string, number>();
  for (const record of records) {
    if (stage === "full-text" && record.finalInclusion.outcome === "exclude" && record.finalInclusion.decision) {
      const reason = record.finalInclusion.decision.criterionText || record.finalInclusion.decision.reason || "Unspecified";
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      continue;
    }
    const state = stage === "title-abstract" ? record.titleAbstract : record.fullText;
    if (state.outcome !== "exclude") continue;
    const reason =
      state.adjudication?.criterionText ||
      state.adjudication?.reason ||
      [...state.decisions].reverse().find((decision) => decision.decision === "exclude")?.criterionText ||
      [...state.decisions].reverse().find((decision) => decision.decision === "exclude")?.reason ||
      "Unspecified";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return Object.fromEntries([...reasons].sort(([left], [right]) => left.localeCompare(right)));
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

function csvCell(value: string): string {
  const escaped = /^[=+@-]/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(escaped) ? `"${escaped.replaceAll('"', '""')}"` : escaped;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
    },
    2,
  )}\n`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", strToU8(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
