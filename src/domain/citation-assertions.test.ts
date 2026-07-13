import { describe, expect, it } from "vitest";
import type { BibliographicRecord } from "./reference-library";
import {
  buildCitationNetwork,
  isCitationNetwork,
  isCreateCitationAssertionInput,
  isReviewCitationAssertionInput,
  type CitationAssertion,
  type CreateCitationAssertionInput,
} from "./citation-assertions";

const observedAt = "2026-07-12T10:00:00.000Z";
const references = [reference("a", "Alpha paper"), reference("b", "Beta paper"), reference("c", "Gamma paper")];

describe("citation assertions", () => {
  it("derives strongest reviewed state while retaining every provenance-bearing assertion", () => {
    const assertions: CitationAssertion[] = [
      assertion("inferred", "a", "b", "cites", "inferred"),
      assertion("extracted", "a", "b", "cites", "extracted"),
      {
        ...assertion("reviewed", "a", "b", "cites", "inferred"),
        review: {
          decision: "confirmed",
          reviewer: "researcher@example.org",
          reviewedAt: observedAt,
          note: "Checked reference list",
        },
      },
    ];

    const network = buildCitationNetwork(references, assertions, null);
    expect(network).toMatchObject({ projectId: null, truncated: false });
    expect(network.nodes.map((node) => node.label)).toEqual(["Alpha paper", "Beta paper"]);
    expect(network.edges).toEqual([
      {
        id: "citation:a:b",
        from: "reference:a",
        to: "reference:b",
        state: "confirmed",
        assertions: [
          { ...assertions[1], state: "extracted" },
          { ...assertions[0], state: "inferred" },
          { ...assertions[2], state: "confirmed" },
        ],
      },
    ]);
    expect(isCitationNetwork(network)).toBe(true);
  });

  it("exposes disagreement as conflicting and excludes rejected assertions without deleting them", () => {
    const positive = assertion("positive", "a", "b", "cites", "confirmed");
    const negative = assertion("negative", "a", "b", "does-not-cite", "extracted");
    const conflict = buildCitationNetwork(references, [positive, negative], null);
    expect(conflict.edges[0]).toMatchObject({
      state: "conflicting",
      assertions: [
        { state: "conflicting", polarity: "does-not-cite" },
        { state: "conflicting", polarity: "cites" },
      ],
    });

    const rejected = {
      ...negative,
      review: { decision: "rejected" as const, reviewer: "reviewer", reviewedAt: observedAt, note: "Provider mismatch" },
    };
    expect(buildCitationNetwork(references, [positive, rejected], null).edges[0]).toMatchObject({
      state: "confirmed",
      assertions: [{ id: "positive" }],
    });
    expect(buildCitationNetwork(references, [rejected], null)).toMatchObject({ nodes: [], edges: [] });
  });

  it("filters to the current project neighborhood, retains isolated project nodes, and excludes tombstones", () => {
    const deleted = { ...reference("deleted", "Deleted"), deletedAt: observedAt };
    const assertions = [
      assertion("a-b", "a", "b", "cites", "confirmed"),
      assertion("b-c", "b", "c", "cites", "extracted"),
      assertion("deleted-edge", "a", "deleted", "cites", "confirmed"),
    ];
    const project = buildCitationNetwork([...references, deleted], assertions, "project-1", new Set(["b", "c"]));

    expect(project.nodes).toEqual([
      expect.objectContaining({ referenceId: "a", inProject: false }),
      expect.objectContaining({ referenceId: "b", inProject: true }),
      expect.objectContaining({ referenceId: "c", inProject: true }),
    ]);
    expect(project.edges.map((edge) => edge.id)).toEqual(["citation:a:b", "citation:b:c"]);
    expect(buildCitationNetwork(references, assertions, "empty", new Set())).toEqual({
      projectId: "empty",
      nodes: [],
      edges: [],
      truncated: false,
    });
  });

  it("bounds shared-library graph expansion deterministically", () => {
    const manyReferences = Array.from({ length: 514 }, (_, index) => reference(String(index), `Paper ${String(index).padStart(3, "0")}`));
    const manyAssertions = Array.from({ length: 513 }, (_, index) =>
      assertion(`edge-${String(index).padStart(3, "0")}`, String(index), String(index + 1), "cites", "inferred"),
    );
    const network = buildCitationNetwork(manyReferences, manyAssertions.reverse(), null);

    expect(network.truncated).toBe(true);
    expect(network.edges).toHaveLength(512);
    expect(network.edges[0]?.assertions[0]?.id).toBe("edge-000");
    expect(network.edges.at(-1)?.assertions[0]?.id).toBe("edge-511");
  });

  it("validates bounded creation, review, and public network representations", () => {
    const valid: CreateCitationAssertionInput = {
      citingReferenceId: "a",
      citedReferenceId: "b",
      polarity: "cites",
      evidenceState: "inferred",
      method: "provider",
      observedAt,
      sourceKind: "provider-response",
      sourceId: "sha256:response",
      sourceLocator: "https://api.crossref.org/works/10.1000/example",
      confidence: 0.8,
    };
    expect(isCreateCitationAssertionInput(valid)).toBe(true);
    expect(isCreateCitationAssertionInput({ ...valid, confidence: null })).toBe(true);
    expect(isCreateCitationAssertionInput({ ...valid, confidence: 0, sourceId: "x".repeat(500), sourceLocator: "x".repeat(2_000) })).toBe(
      true,
    );
    expect(isCreateCitationAssertionInput({ ...valid, confidence: 1 })).toBe(true);
    for (const invalid of [
      null,
      { ...valid, citingReferenceId: "" },
      { ...valid, citingReferenceId: "x".repeat(501) },
      { ...valid, citedReferenceId: "" },
      { ...valid, citedReferenceId: "x".repeat(501) },
      { ...valid, citedReferenceId: "a" },
      { ...valid, polarity: "maybe" },
      { ...valid, evidenceState: "conflicting" },
      { ...valid, method: "guess" },
      { ...valid, observedAt: "not-a-date" },
      { ...valid, observedAt: `${observedAt}${" ".repeat(101)}` },
      { ...valid, sourceKind: "unknown" },
      { ...valid, sourceId: "" },
      { ...valid, sourceId: "x".repeat(501) },
      { ...valid, sourceLocator: "x".repeat(2_001) },
      { ...valid, confidence: Number.NaN },
      { ...valid, confidence: -0.1 },
      { ...valid, confidence: 1.1 },
    ]) {
      expect(isCreateCitationAssertionInput(invalid), JSON.stringify(invalid)).toBe(false);
    }
    for (const method of ["authoritative-metadata", "source-extraction", "provider", "model", "manual"]) {
      expect(isCreateCitationAssertionInput({ ...valid, method }), method).toBe(true);
    }
    for (const sourceKind of ["pdf-artifact", "web-snapshot", "provider-response", "researcher"]) {
      expect(isCreateCitationAssertionInput({ ...valid, sourceKind }), sourceKind).toBe(true);
    }
    expect(isReviewCitationAssertionInput({ decision: "confirmed", note: "Checked" })).toBe(true);
    expect(isReviewCitationAssertionInput({ decision: "rejected", note: "" })).toBe(true);
    expect(isReviewCitationAssertionInput({ decision: "other", note: "" })).toBe(false);
    expect(isReviewCitationAssertionInput({ decision: "confirmed", note: "x".repeat(4_001) })).toBe(false);
    expect(isReviewCitationAssertionInput(null)).toBe(false);

    const network = buildCitationNetwork(references, [assertion("edge", "a", "b", "cites", "confirmed")], null);
    for (const state of ["confirmed", "extracted", "inferred", "conflicting"]) {
      expect(isCitationNetwork({ ...network, edges: [{ ...network.edges[0], state }] }), state).toBe(true);
    }
    for (const invalid of [
      null,
      { ...network, projectId: 1 },
      { ...network, truncated: null },
      { ...network, nodes: null },
      { ...network, nodes: [{ ...network.nodes[0], id: "" }] },
      { ...network, nodes: [{ ...network.nodes[0], referenceId: "" }] },
      { ...network, nodes: [{ ...network.nodes[0], label: null }] },
      { ...network, nodes: [{ ...network.nodes[0], authors: [1] }] },
      { ...network, nodes: [{ ...network.nodes[0], year: null }] },
      { ...network, nodes: [{ ...network.nodes[0], doi: null }] },
      { ...network, nodes: [{ ...network.nodes[0], inProject: null }] },
      { ...network, edges: null },
      { ...network, edges: [{ ...network.edges[0], id: "" }] },
      { ...network, edges: [{ ...network.edges[0], from: "" }] },
      { ...network, edges: [{ ...network.edges[0], to: "" }] },
      { ...network, edges: [{ ...network.edges[0], state: "unknown" }] },
      { ...network, edges: [{ ...network.edges[0], assertions: [] }] },
      { ...network, edges: [{ ...network.edges[0], assertions: [{ ...network.edges[0]!.assertions[0], sourceId: "" }] }] },
      { ...network, edges: [{ ...network.edges[0], assertions: [{ ...network.edges[0]!.assertions[0], confidence: 2 }] }] },
      { ...network, edges: [{ ...network.edges[0], assertions: [{ ...network.edges[0]!.assertions[0], review: {} }] }] },
    ]) {
      expect(isCitationNetwork(invalid), JSON.stringify(invalid)).toBe(false);
    }
  });
});

function reference(id: string, title: string): BibliographicRecord {
  return {
    id,
    referenceKey: id,
    type: "article",
    title,
    authors: [`Author ${id}`],
    year: "2026",
    venue: "Journal",
    doi: `10.1000/${id}`,
    url: "",
    abstract: "",
    provenance: {},
    archivedAt: null,
    deletedAt: null,
    createdAt: observedAt,
    updatedAt: observedAt,
  };
}

function assertion(
  id: string,
  citingReferenceId: string,
  citedReferenceId: string,
  polarity: CitationAssertion["polarity"],
  evidenceState: CitationAssertion["evidenceState"],
): CitationAssertion {
  return {
    id,
    citingReferenceId,
    citedReferenceId,
    polarity,
    evidenceState,
    method: "provider",
    assertedBy: "Crossref",
    observedAt,
    sourceKind: "provider-response",
    sourceId: `response:${id}`,
    sourceLocator: "https://api.crossref.org/works/example",
    confidence: evidenceState === "inferred" ? 0.7 : null,
    review: null,
    createdAt: observedAt,
  };
}
