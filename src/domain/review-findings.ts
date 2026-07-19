import { parseEvidencePointer, type ReviewEvidencePointer } from "./review-evidence";

export const reviewFindingLimits = {
  findings: 10_000,
  contributorsPerKind: 512,
  evidenceLinks: 1_024,
  statementCharacters: 4_000,
  interpretationCharacters: 20_000,
} as const;

export type ReviewFindingContributorKind = "extraction" | "appraisal";

export interface ReviewFindingEvidenceLink {
  readonly contributorKind: ReviewFindingContributorKind;
  readonly contributorId: string;
  readonly pointer: ReviewEvidencePointer;
}

export interface ReviewFindingInput {
  readonly researchQuestionId: string;
  readonly statement: string;
  readonly interpretation: string;
  readonly extractionValueIds: readonly string[];
  readonly appraisalValueIds: readonly string[];
  readonly evidence: readonly ReviewFindingEvidenceLink[];
  readonly supersedesId: string | null;
}

export interface ReviewFinding extends ReviewFindingInput {
  readonly id: string;
  readonly reviewRevision: number;
  readonly protocolRevision: number;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ReviewFindingContext {
  readonly id: string;
  readonly reviewRevision: number;
  readonly protocolRevision: number;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ReviewFindingsSnapshot {
  readonly revision: number;
  readonly findings: readonly ReviewFinding[];
}

export function parseReviewFindingInput(value: unknown): ReviewFindingInput {
  if (!isRecord(value) || !hasExactKeys(value, findingInputKeys)) throw new Error("Review finding input is invalid");
  const extractionValueIds = contributorIds(value.extractionValueIds, "extraction");
  const appraisalValueIds = contributorIds(value.appraisalValueIds, "appraisal");
  if (extractionValueIds.length + appraisalValueIds.length === 0) {
    throw new Error("Review finding requires a contributing extraction or appraisal value");
  }
  const evidence = parseBoundedArray(value.evidence, reviewFindingLimits.evidenceLinks, "evidence links", parseEvidenceLink);
  if (evidence.length === 0) throw new Error("Review finding requires exact evidence");
  const declaredContributors = new Set([
    ...extractionValueIds.map((id) => contributorKey("extraction", id)),
    ...appraisalValueIds.map((id) => contributorKey("appraisal", id)),
  ]);
  const linkedContributors = new Set<string>();
  const uniqueEvidence = new Set<string>();
  for (const link of evidence) {
    const key = contributorKey(link.contributorKind, link.contributorId);
    if (!declaredContributors.has(key)) throw new Error("Review finding evidence references an undeclared contributor");
    linkedContributors.add(key);
    const evidenceKey = `${key}\u0000${link.pointer.kind}\u0000${link.pointer.resourceId}\u0000${link.pointer.selectorId}\u0000${link.pointer.quote}\u0000${link.pointer.page ?? ""}\u0000${link.pointer.location}`;
    if (uniqueEvidence.has(evidenceKey)) throw new Error("Review finding evidence links must be unique");
    uniqueEvidence.add(evidenceKey);
  }
  if ([...declaredContributors].some((key) => !linkedContributors.has(key))) {
    throw new Error("Every review finding contributor requires exact evidence");
  }
  return {
    researchQuestionId: stableId(value.researchQuestionId, "Research question"),
    statement: boundedText(value.statement, "Review finding statement", reviewFindingLimits.statementCharacters),
    interpretation: boundedText(value.interpretation, "Review finding interpretation", reviewFindingLimits.interpretationCharacters, true),
    extractionValueIds,
    appraisalValueIds,
    evidence,
    supersedesId: value.supersedesId === null ? null : stableId(value.supersedesId, "Superseded review finding"),
  };
}

export function materializeReviewFinding(input: unknown, context: ReviewFindingContext): ReviewFinding {
  const parsed = parseReviewFindingInput(input);
  return {
    ...parsed,
    id: stableId(context.id, "Review finding"),
    reviewRevision: positiveInteger(context.reviewRevision, "Review finding revision"),
    protocolRevision: positiveInteger(context.protocolRevision, "Review finding protocol revision"),
    createdBy: boundedText(context.createdBy, "Review finding author", 320),
    createdAt: isoTimestamp(context.createdAt),
  };
}

export function parseReviewFindingsSnapshot(value: unknown): ReviewFindingsSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ["revision", "findings"])) throw new Error("Review findings snapshot is invalid");
  const revision = positiveInteger(value.revision, "Review findings snapshot revision");
  const findings = parseBoundedArray(value.findings, reviewFindingLimits.findings, "findings", parseReviewFinding).sort(
    (left, right) =>
      left.reviewRevision - right.reviewRevision || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
  const byId = new Map<string, ReviewFinding>();
  for (const finding of findings) {
    if (finding.reviewRevision > revision) throw new Error("Review finding belongs to a future review revision");
    if (byId.has(finding.id)) throw new Error("Review finding IDs must be unique");
    byId.set(finding.id, finding);
  }
  const supersededIds = new Set<string>();
  for (const finding of findings) {
    if (finding.supersedesId === null) continue;
    const superseded = byId.get(finding.supersedesId);
    if (!superseded) throw new Error("Review finding supersedes an unavailable event");
    if (superseded.reviewRevision >= finding.reviewRevision) {
      throw new Error("Review finding can only supersede an earlier review revision");
    }
    if (superseded.researchQuestionId !== finding.researchQuestionId) {
      throw new Error("Review finding cannot supersede a different research question");
    }
    if (supersededIds.has(superseded.id)) throw new Error("Review finding supersession cannot branch");
    supersededIds.add(superseded.id);
  }
  return { revision, findings };
}

export function currentReviewFindings(snapshot: ReviewFindingsSnapshot): readonly ReviewFinding[] {
  const supersededIds = new Set(snapshot.findings.flatMap((finding) => (finding.supersedesId ? [finding.supersedesId] : [])));
  return snapshot.findings.filter((finding) => !supersededIds.has(finding.id));
}

function parseReviewFinding(value: unknown): ReviewFinding {
  if (!isRecord(value) || !hasExactKeys(value, findingKeys)) throw new Error("Review finding is invalid");
  const input = parseReviewFindingInput({
    researchQuestionId: value.researchQuestionId,
    statement: value.statement,
    interpretation: value.interpretation,
    extractionValueIds: value.extractionValueIds,
    appraisalValueIds: value.appraisalValueIds,
    evidence: value.evidence,
    supersedesId: value.supersedesId,
  });
  return {
    ...input,
    id: stableId(value.id, "Review finding"),
    reviewRevision: positiveInteger(value.reviewRevision, "Review finding revision"),
    protocolRevision: positiveInteger(value.protocolRevision, "Review finding protocol revision"),
    createdBy: boundedText(value.createdBy, "Review finding author", 320),
    createdAt: isoTimestamp(value.createdAt),
  };
}

function parseEvidenceLink(value: unknown): ReviewFindingEvidenceLink {
  if (!isRecord(value) || !hasExactKeys(value, ["contributorKind", "contributorId", "pointer"])) {
    throw new Error("Review finding evidence link is invalid");
  }
  if (value.contributorKind !== "extraction" && value.contributorKind !== "appraisal") {
    throw new Error("Review finding contributor kind is invalid");
  }
  if (!isRecord(value.pointer) || !hasExactKeys(value.pointer, ["kind", "resourceId", "selectorId", "quote", "page", "location"])) {
    throw new Error("Review finding evidence pointer is invalid");
  }
  const pointer = parseEvidencePointer(value.pointer, true);
  if (pointer === null) throw new Error("Review finding evidence pointer is invalid");
  return {
    contributorKind: value.contributorKind,
    contributorId: stableId(value.contributorId, "Review finding contributor"),
    pointer,
  };
}

function contributorIds(value: unknown, label: string): string[] {
  const ids = parseBoundedArray(value, reviewFindingLimits.contributorsPerKind, `${label} contributors`, (item) =>
    stableId(item, `Review finding ${label} contributor`),
  );
  if (new Set(ids).size !== ids.length) throw new Error(`Review finding ${label} contributor IDs must be unique`);
  return ids;
}

function parseBoundedArray<Result>(value: unknown, maximum: number, label: string, parse: (item: unknown) => Result): Result[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Review finding ${label} are invalid`);
  return value.map(parse);
}

function contributorKey(kind: ReviewFindingContributorKind, id: string): string {
  return `${kind}:${id}`;
}

function stableId(value: unknown, label: string): string {
  const id = boundedText(value, `${label} ID`, 128);
  if (!/^[a-z0-9][a-z0-9_.:-]*$/iu.test(id)) throw new Error(`${label} ID is invalid`);
  return id;
}

function boundedText(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const text = value.trim();
  if ((!allowEmpty && !text) || text.length > maximum) throw new Error(`${label} is invalid`);
  return text;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${label} is invalid`);
  return value;
}

function isoTimestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw new Error("Review finding time is invalid");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) throw new Error("Review finding time is invalid");
  return value;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const findingInputKeys = [
  "researchQuestionId",
  "statement",
  "interpretation",
  "extractionValueIds",
  "appraisalValueIds",
  "evidence",
  "supersedesId",
] as const;
const findingKeys = ["id", "reviewRevision", "protocolRevision", "createdBy", "createdAt", ...findingInputKeys] as const;
