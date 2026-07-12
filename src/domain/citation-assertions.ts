import type { BibliographicRecord } from "./reference-library";

export type CitationAssertionPolarity = "cites" | "does-not-cite";
export type CitationEvidenceState = "confirmed" | "extracted" | "inferred";
export type CitationAssertionState = CitationEvidenceState | "conflicting";
export type CitationExtractionMethod = "authoritative-metadata" | "source-extraction" | "provider" | "model" | "manual";
export type CitationSourceKind = "pdf-artifact" | "web-snapshot" | "provider-response" | "researcher";
export type CitationReviewDecision = "confirmed" | "rejected";

export interface CitationAssertionReview {
  readonly decision: CitationReviewDecision;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly note: string;
}

export interface CitationAssertion {
  readonly id: string;
  readonly citingReferenceId: string;
  readonly citedReferenceId: string;
  readonly polarity: CitationAssertionPolarity;
  readonly evidenceState: CitationEvidenceState;
  readonly method: CitationExtractionMethod;
  readonly assertedBy: string;
  readonly observedAt: string;
  readonly sourceKind: CitationSourceKind;
  readonly sourceId: string;
  readonly sourceLocator: string;
  readonly confidence: number | null;
  readonly review: CitationAssertionReview | null;
  readonly createdAt: string;
}

export interface CitationAssertionView extends CitationAssertion {
  readonly state: CitationAssertionState;
}

export interface CitationNetworkNode {
  readonly id: string;
  readonly referenceId: string;
  readonly label: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly doi: string;
  readonly inProject: boolean;
}

export interface CitationNetworkEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly state: CitationAssertionState;
  readonly assertions: readonly CitationAssertionView[];
}

export interface CitationNetwork {
  readonly projectId: string | null;
  readonly nodes: readonly CitationNetworkNode[];
  readonly edges: readonly CitationNetworkEdge[];
  readonly truncated: boolean;
}

export interface CreateCitationAssertionInput {
  readonly citingReferenceId: string;
  readonly citedReferenceId: string;
  readonly polarity: CitationAssertionPolarity;
  readonly evidenceState: CitationEvidenceState;
  readonly method: CitationExtractionMethod;
  readonly observedAt: string;
  readonly sourceKind: CitationSourceKind;
  readonly sourceId: string;
  readonly sourceLocator: string;
  readonly confidence: number | null;
}

export interface ReviewCitationAssertionInput {
  readonly decision: CitationReviewDecision;
  readonly note: string;
}

const maximumNetworkAssertions = 512;

export function buildCitationNetwork(
  references: readonly BibliographicRecord[],
  assertions: readonly CitationAssertion[],
  projectId: string | null,
  projectReferenceIds: ReadonlySet<string> = new Set<string>(),
): CitationNetwork {
  const knownReferences = new Map(
    references.filter((reference) => reference.deletedAt === null).map((reference) => [reference.id, reference]),
  );
  const active = assertions
    .filter(
      (assertion) =>
        assertion.review?.decision !== "rejected" &&
        knownReferences.has(assertion.citingReferenceId) &&
        knownReferences.has(assertion.citedReferenceId) &&
        (projectId === null || projectReferenceIds.has(assertion.citingReferenceId) || projectReferenceIds.has(assertion.citedReferenceId)),
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const truncated = active.length > maximumNetworkAssertions;
  const bounded = active.slice(0, maximumNetworkAssertions);
  const groups = new Map<string, CitationAssertion[]>();
  for (const assertion of bounded) {
    const key = `${assertion.citingReferenceId}\u0000${assertion.citedReferenceId}`;
    const group = groups.get(key) ?? [];
    group.push(assertion);
    groups.set(key, group);
  }

  const edges = [...groups.values()].map((group): CitationNetworkEdge => {
    const first = group[0]!;
    const conflicting = new Set(group.map((assertion) => assertion.polarity)).size > 1;
    const views = group.map(
      (assertion): CitationAssertionView => ({ ...assertion, state: conflicting ? "conflicting" : reviewedState(assertion) }),
    );
    return {
      id: `citation:${first.citingReferenceId}:${first.citedReferenceId}`,
      from: `reference:${first.citingReferenceId}`,
      to: `reference:${first.citedReferenceId}`,
      state: conflicting ? "conflicting" : strongestState(views),
      assertions: views,
    };
  });
  const visibleIds = new Set(edges.flatMap((edge) => [edge.from.slice("reference:".length), edge.to.slice("reference:".length)]));
  if (projectId !== null) for (const referenceId of projectReferenceIds) if (knownReferences.has(referenceId)) visibleIds.add(referenceId);
  const nodes = [...visibleIds]
    .map((referenceId) => knownReferences.get(referenceId))
    .filter((reference) => reference !== undefined)
    .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
    .map(
      (reference): CitationNetworkNode => ({
        id: `reference:${reference.id}`,
        referenceId: reference.id,
        label: reference.title,
        authors: [...reference.authors],
        year: reference.year,
        doi: reference.doi,
        inProject: projectReferenceIds.has(reference.id),
      }),
    );
  return { projectId, nodes, edges, truncated };
}

export function isCreateCitationAssertionInput(value: unknown): value is CreateCitationAssertionInput {
  return (
    isRecord(value) &&
    isIdentifier(value.citingReferenceId) &&
    isIdentifier(value.citedReferenceId) &&
    value.citingReferenceId !== value.citedReferenceId &&
    (value.polarity === "cites" || value.polarity === "does-not-cite") &&
    (value.evidenceState === "confirmed" || value.evidenceState === "extracted" || value.evidenceState === "inferred") &&
    isMethod(value.method) &&
    isTimestamp(value.observedAt) &&
    isSourceKind(value.sourceKind) &&
    typeof value.sourceId === "string" &&
    value.sourceId.length > 0 &&
    value.sourceId.length <= 500 &&
    typeof value.sourceLocator === "string" &&
    value.sourceLocator.length <= 2_000 &&
    isConfidence(value.confidence)
  );
}

export function isReviewCitationAssertionInput(value: unknown): value is ReviewCitationAssertionInput {
  return (
    isRecord(value) &&
    (value.decision === "confirmed" || value.decision === "rejected") &&
    typeof value.note === "string" &&
    value.note.length <= 4_000
  );
}

export function isCitationNetwork(value: unknown): value is CitationNetwork {
  return (
    isRecord(value) &&
    (value.projectId === null || typeof value.projectId === "string") &&
    typeof value.truncated === "boolean" &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isNetworkNode) &&
    Array.isArray(value.edges) &&
    value.edges.every(isNetworkEdge)
  );
}

function reviewedState(assertion: CitationAssertion): CitationEvidenceState {
  return assertion.review?.decision === "confirmed" ? "confirmed" : assertion.evidenceState;
}

function strongestState(assertions: readonly CitationAssertionView[]): CitationEvidenceState {
  if (assertions.some((assertion) => assertion.state === "confirmed")) return "confirmed";
  return assertions.some((assertion) => assertion.state === "extracted") ? "extracted" : "inferred";
}

function isNetworkNode(value: unknown): value is CitationNetworkNode {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    isIdentifier(value.referenceId) &&
    typeof value.label === "string" &&
    Array.isArray(value.authors) &&
    value.authors.every((author) => typeof author === "string") &&
    typeof value.year === "string" &&
    typeof value.doi === "string" &&
    typeof value.inProject === "boolean"
  );
}

function isNetworkEdge(value: unknown): value is CitationNetworkEdge {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    isIdentifier(value.from) &&
    isIdentifier(value.to) &&
    (value.state === "confirmed" || value.state === "extracted" || value.state === "inferred" || value.state === "conflicting") &&
    Array.isArray(value.assertions) &&
    value.assertions.length > 0 &&
    value.assertions.every(isCitationAssertionView)
  );
}

function isCitationAssertionView(value: unknown): value is CitationAssertionView {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    isIdentifier(value.citingReferenceId) &&
    isIdentifier(value.citedReferenceId) &&
    value.citingReferenceId !== value.citedReferenceId &&
    (value.polarity === "cites" || value.polarity === "does-not-cite") &&
    (value.evidenceState === "confirmed" || value.evidenceState === "extracted" || value.evidenceState === "inferred") &&
    isMethod(value.method) &&
    isIdentifier(value.assertedBy) &&
    isTimestamp(value.observedAt) &&
    isSourceKind(value.sourceKind) &&
    typeof value.sourceId === "string" &&
    value.sourceId.length > 0 &&
    value.sourceId.length <= 500 &&
    typeof value.sourceLocator === "string" &&
    value.sourceLocator.length <= 2_000 &&
    isConfidence(value.confidence) &&
    (value.review === null || isAssertionReview(value.review)) &&
    isTimestamp(value.createdAt) &&
    (value.state === "confirmed" || value.state === "extracted" || value.state === "inferred" || value.state === "conflicting")
  );
}

function isAssertionReview(value: unknown): value is CitationAssertionReview {
  return (
    isRecord(value) &&
    (value.decision === "confirmed" || value.decision === "rejected") &&
    isIdentifier(value.reviewer) &&
    isTimestamp(value.reviewedAt) &&
    typeof value.note === "string" &&
    value.note.length <= 4_000
  );
}

function isConfidence(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

function isMethod(value: unknown): value is CitationExtractionMethod {
  return (
    value === "authoritative-metadata" || value === "source-extraction" || value === "provider" || value === "model" || value === "manual"
  );
}

function isSourceKind(value: unknown): value is CitationSourceKind {
  return value === "pdf-artifact" || value === "web-snapshot" || value === "provider-response" || value === "researcher";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
