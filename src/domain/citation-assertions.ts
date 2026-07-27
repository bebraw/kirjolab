import * as v from "valibot";
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

const identifierSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(500));
const timestampSchema = v.pipe(
  v.string(),
  v.maxLength(100),
  v.check((value) => Number.isFinite(Date.parse(value))),
);
const evidenceStateSchema = v.picklist(["confirmed", "extracted", "inferred"]);
const assertionStateSchema = v.picklist(["confirmed", "extracted", "inferred", "conflicting"]);
const decisionSchema = v.picklist(["confirmed", "rejected"]);
const assertionReviewSchema = v.object({
  decision: decisionSchema,
  reviewer: identifierSchema,
  reviewedAt: timestampSchema,
  note: v.pipe(v.string(), v.maxLength(4_000)),
});
const citationEvidenceEntries = {
  polarity: v.picklist(["cites", "does-not-cite"]),
  evidenceState: evidenceStateSchema,
  method: v.picklist(["authoritative-metadata", "source-extraction", "provider", "model", "manual"]),
  observedAt: timestampSchema,
  sourceKind: v.picklist(["pdf-artifact", "web-snapshot", "provider-response", "researcher"]),
  sourceId: identifierSchema,
  sourceLocator: v.pipe(v.string(), v.maxLength(2_000)),
  confidence: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
};
const createCitationAssertionInputSchema = v.pipe(
  v.object({ citingReferenceId: identifierSchema, citedReferenceId: identifierSchema, ...citationEvidenceEntries }),
  v.check((value) => value.citingReferenceId !== value.citedReferenceId),
);
const citationAssertionViewSchema = v.pipe(
  v.object({
    id: identifierSchema,
    citingReferenceId: identifierSchema,
    citedReferenceId: identifierSchema,
    ...citationEvidenceEntries,
    assertedBy: identifierSchema,
    review: v.nullable(assertionReviewSchema),
    createdAt: timestampSchema,
    state: assertionStateSchema,
  }),
  v.check((value) => value.citingReferenceId !== value.citedReferenceId),
);
const citationNetworkSchema = v.object({
  projectId: v.nullable(v.string()),
  nodes: v.array(
    v.object({
      id: identifierSchema,
      referenceId: identifierSchema,
      label: v.string(),
      authors: v.array(v.string()),
      year: v.string(),
      doi: v.string(),
      inProject: v.boolean(),
    }),
  ),
  edges: v.array(
    v.object({
      id: identifierSchema,
      from: identifierSchema,
      to: identifierSchema,
      state: assertionStateSchema,
      assertions: v.pipe(v.array(citationAssertionViewSchema), v.minLength(1)),
    }),
  ),
  truncated: v.boolean(),
});

export function isCreateCitationAssertionInput(value: unknown): value is CreateCitationAssertionInput {
  return v.is(createCitationAssertionInputSchema, value);
}

export function isReviewCitationAssertionInput(value: unknown): value is ReviewCitationAssertionInput {
  return v.is(v.object({ decision: decisionSchema, note: v.pipe(v.string(), v.maxLength(4_000)) }), value);
}

export function isCitationNetwork(value: unknown): value is CitationNetwork {
  return v.is(citationNetworkSchema, value);
}

function reviewedState(assertion: CitationAssertion): CitationEvidenceState {
  return assertion.review?.decision === "confirmed" ? "confirmed" : assertion.evidenceState;
}

function strongestState(assertions: readonly CitationAssertionView[]): CitationEvidenceState {
  if (assertions.some((assertion) => assertion.state === "confirmed")) return "confirmed";
  return assertions.some((assertion) => assertion.state === "extracted") ? "extracted" : "inferred";
}
