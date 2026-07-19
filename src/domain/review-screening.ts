import type { ReviewRecord } from "./review-search";

export type ScreeningStage = "title-abstract" | "full-text";
export type ScreeningDecisionValue = "include" | "exclude" | "uncertain";

export interface ScreeningDecision {
  readonly id: string;
  readonly recordId: string;
  readonly stage: ScreeningStage;
  readonly protocolRevision: number;
  readonly reviewer: string;
  readonly decision: ScreeningDecisionValue;
  readonly reason: string;
  readonly criterionId: string | null;
  readonly criterionText: string;
  readonly createdAt: string;
}

export interface ScreeningAdjudication {
  readonly id: string;
  readonly recordId: string;
  readonly stage: ScreeningStage;
  readonly protocolRevision: number;
  readonly outcome: "include" | "exclude";
  readonly reason: string;
  readonly criterionId: string | null;
  readonly criterionText: string;
  readonly adjudicator: string;
  readonly createdAt: string;
}

export interface FinalInclusionDecision {
  readonly id: string;
  readonly recordId: string;
  readonly protocolRevision: number;
  readonly outcome: "include" | "exclude";
  readonly reason: string;
  readonly criterionId: string | null;
  readonly criterionText: string;
  readonly reviewer: string;
  readonly createdAt: string;
}

export interface FinalInclusionState {
  readonly outcome: "pending" | "include" | "exclude";
  readonly decision: FinalInclusionDecision | null;
}

export interface ScreeningStageState {
  readonly outcome: "pending" | "include" | "exclude" | "uncertain" | "conflict";
  readonly decisions: readonly ScreeningDecision[];
  readonly adjudication: ScreeningAdjudication | null;
}

export interface ScreeningRecordState {
  readonly record: ReviewRecord;
  readonly titleAbstract: ScreeningStageState;
  readonly fullText: ScreeningStageState;
  readonly finalInclusion: FinalInclusionState;
}

export interface ReviewScreeningSnapshot {
  readonly revision: number;
  readonly reviewersPerStage: 1 | 2;
  readonly blinded: boolean;
  readonly records: readonly ScreeningRecordState[];
  readonly counts: {
    readonly titleAbstractPending: number;
    readonly titleAbstractIncluded: number;
    readonly fullTextPending: number;
    readonly fullTextIncluded: number;
    readonly finalInclusionPending: number;
    readonly finalInclusionIncluded: number;
    readonly finalInclusionExcluded: number;
    readonly conflicts: number;
  };
}

export function screeningStageState(
  decisions: readonly ScreeningDecision[],
  adjudication: ScreeningAdjudication | null,
  reviewersPerStage: 1 | 2,
): ScreeningStageState {
  if (adjudication) return { outcome: adjudication.outcome, decisions, adjudication };
  const latest = latestDecisions(decisions);
  if (latest.length < reviewersPerStage) return { outcome: "pending", decisions, adjudication: null };
  const outcomes = new Set(latest.map((decision) => decision.decision));
  return { outcome: outcomes.size === 1 ? latest[0]!.decision : "conflict", decisions, adjudication: null };
}

export function fullTextScreeningAllowed(state: ScreeningRecordState): boolean {
  return state.titleAbstract.outcome === "include";
}

export function parseReviewScreeningSnapshot(value: unknown): ReviewScreeningSnapshot {
  if (!isRecord(value) || !Array.isArray(value.records) || !isRecord(value.counts)) throw new Error("Review screening snapshot is invalid");
  if ((value.reviewersPerStage !== 1 && value.reviewersPerStage !== 2) || typeof value.blinded !== "boolean") {
    throw new Error("Review screening policy is invalid");
  }
  const records = value.records.map((item) => {
    if (!isRecord(item)) throw new Error("Review screening record is invalid");
    return {
      record: parseReviewRecord(item.record),
      titleAbstract: parseStageState(item.titleAbstract),
      fullText: parseStageState(item.fullText),
      finalInclusion: parseFinalInclusionState(item.finalInclusion),
    } satisfies ScreeningRecordState;
  });
  return {
    revision: integer(value.revision),
    reviewersPerStage: value.reviewersPerStage,
    blinded: value.blinded,
    records,
    counts: {
      titleAbstractPending: integer(value.counts.titleAbstractPending),
      titleAbstractIncluded: integer(value.counts.titleAbstractIncluded),
      fullTextPending: integer(value.counts.fullTextPending),
      fullTextIncluded: integer(value.counts.fullTextIncluded),
      finalInclusionPending: integer(value.counts.finalInclusionPending),
      finalInclusionIncluded: integer(value.counts.finalInclusionIncluded),
      finalInclusionExcluded: integer(value.counts.finalInclusionExcluded),
      conflicts: integer(value.counts.conflicts),
    },
  };
}

function parseStageState(value: unknown): ScreeningStageState {
  if (!isRecord(value) || !Array.isArray(value.decisions)) throw new Error("Review screening stage is invalid");
  if (!isScreeningOutcome(value.outcome)) throw new Error("Review screening outcome is invalid");
  const adjudication = value.adjudication === null ? null : parseAdjudication(value.adjudication);
  return {
    outcome: value.outcome,
    decisions: value.decisions.map(parseDecision),
    adjudication,
  };
}

function parseDecision(value: unknown): ScreeningDecision {
  if (!isRecord(value) || !isStage(value.stage) || !isDecision(value.decision)) throw new Error("Review screening decision is invalid");
  return {
    id: text(value.id),
    recordId: text(value.recordId),
    stage: value.stage,
    protocolRevision: positiveInteger(value.protocolRevision),
    reviewer: text(value.reviewer),
    decision: value.decision,
    reason: text(value.reason),
    criterionId: nullableText(value.criterionId),
    criterionText: text(value.criterionText),
    createdAt: text(value.createdAt),
  };
}

function parseAdjudication(value: unknown): ScreeningAdjudication {
  if (!isRecord(value) || !isStage(value.stage) || (value.outcome !== "include" && value.outcome !== "exclude")) {
    throw new Error("Review screening adjudication is invalid");
  }
  return {
    id: text(value.id),
    recordId: text(value.recordId),
    stage: value.stage,
    protocolRevision: positiveInteger(value.protocolRevision),
    outcome: value.outcome,
    reason: text(value.reason),
    criterionId: nullableText(value.criterionId),
    criterionText: text(value.criterionText),
    adjudicator: text(value.adjudicator),
    createdAt: text(value.createdAt),
  };
}

function parseFinalInclusionState(value: unknown): FinalInclusionState {
  if (!isRecord(value) || (value.outcome !== "pending" && value.outcome !== "include" && value.outcome !== "exclude")) {
    throw new Error("Review final-inclusion state is invalid");
  }
  const decision = value.decision === null ? null : parseFinalInclusionDecision(value.decision);
  if ((value.outcome === "pending") !== (decision === null) || (decision !== null && decision.outcome !== value.outcome)) {
    throw new Error("Review final-inclusion state is inconsistent");
  }
  return { outcome: value.outcome, decision };
}

function parseFinalInclusionDecision(value: unknown): FinalInclusionDecision {
  if (!isRecord(value) || (value.outcome !== "include" && value.outcome !== "exclude")) {
    throw new Error("Review final-inclusion decision is invalid");
  }
  return {
    id: text(value.id),
    recordId: text(value.recordId),
    protocolRevision: positiveInteger(value.protocolRevision),
    outcome: value.outcome,
    reason: text(value.reason),
    criterionId: nullableText(value.criterionId),
    criterionText: text(value.criterionText),
    reviewer: text(value.reviewer),
    createdAt: text(value.createdAt),
  };
}

function parseReviewRecord(value: unknown): ReviewRecord {
  if (!isRecord(value) || (value.state !== "active" && value.state !== "merged") || !isRecord(value.metadata)) {
    throw new Error("Review screening bibliographic record is invalid");
  }
  const metadata = value.metadata;
  if (
    !Array.isArray(metadata.authors) ||
    !metadata.authors.every((author) => typeof author === "string") ||
    !Array.isArray(metadata.warnings) ||
    !metadata.warnings.every((warning) => typeof warning === "string")
  ) {
    throw new Error("Review screening metadata is invalid");
  }
  return {
    id: text(value.id),
    state: value.state,
    mergedInto: value.mergedInto === null ? null : text(value.mergedInto),
    metadata: {
      citationKey: text(metadata.citationKey),
      type: text(metadata.type),
      title: text(metadata.title),
      authors: metadata.authors,
      year: text(metadata.year),
      venue: text(metadata.venue),
      doi: text(metadata.doi),
      url: text(metadata.url),
      abstract: text(metadata.abstract),
      identity: text(metadata.identity),
      warnings: metadata.warnings,
    },
  };
}

function latestDecisions(decisions: readonly ScreeningDecision[]): ScreeningDecision[] {
  const latest = new Map<string, ScreeningDecision>();
  for (const decision of decisions) latest.set(decision.reviewer.toLocaleLowerCase(), decision);
  return [...latest.values()];
}

function isStage(value: unknown): value is ScreeningStage {
  return value === "title-abstract" || value === "full-text";
}

function isDecision(value: unknown): value is ScreeningDecisionValue {
  return value === "include" || value === "exclude" || value === "uncertain";
}

function isScreeningOutcome(value: unknown): value is ScreeningStageState["outcome"] {
  return value === "pending" || value === "include" || value === "exclude" || value === "uncertain" || value === "conflict";
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Review screening count is invalid");
  return value;
}

function positiveInteger(value: unknown): number {
  const parsed = integer(value);
  if (parsed < 1) throw new Error("Review screening revision is invalid");
  return parsed;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Review screening text is invalid");
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
