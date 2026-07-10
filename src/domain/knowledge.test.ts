import { describe, expect, it } from "vitest";
import type { WorkspaceSnapshot } from "./workspace";
import { buildWorkspaceKnowledgeGraph, isKnowledgeSearchResults, isWorkspaceKnowledgeGraph, searchWorkspaceKnowledge } from "./knowledge";

const snapshot: WorkspaceSnapshot = {
  id: "workspace",
  title: "Evidence map",
  source: `## Methods {#methods}\n\nInspectable methods support the claim :cite[doe2026, doe2026].\n\n## Results\n\nA separate result.`,
  bibliography: "",
  revision: 1,
  pdfs: [
    {
      id: "pdf-1",
      name: "methods.pdf",
      contentType: "application/pdf",
      size: 2048,
      objectKey: "workspace/pdf-1.pdf",
      fingerprint: "etag",
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  publications: [
    {
      id: "publication-1",
      citationKey: "doe2026",
      type: "article",
      title: "Inspectable Science",
      authors: ["Doe, Jane"],
      year: "2026",
      venue: "Open Evidence",
      doi: "10.1000/example",
      url: "",
      abstract: "Methods should remain inspectable.",
      metadataSource: "bibtex",
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  annotations: [
    {
      id: "annotation-1",
      pdfId: "pdf-1",
      page: 4,
      quote: "Evidence remains connected.",
      prefix: "",
      suffix: "",
      comment: "Grounding note",
      rects: [],
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  links: [
    {
      id: "link-1",
      annotationId: "annotation-1",
      start: 0,
      end: 7,
      excerpt: "Methods",
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  claims: [],
  claimEvidenceLinks: [],
  claimLinks: [],
  candidates: [],
};

describe("knowledge navigation", () => {
  it("searches stable resources with deterministic relevance", () => {
    expect(searchWorkspaceKnowledge(snapshot, "inspectable")).toEqual([
      {
        resourceId: "publication:publication-1",
        kind: "publication",
        title: "Inspectable Science",
        excerpt: "Doe, Jane · 2026 · Open Evidence · 10.1000/example · Methods should remain inspectable.",
        score: 8,
      },
      {
        resourceId: "section:methods",
        kind: "section",
        title: "Methods",
        excerpt: "Inspectable methods support the claim :cite[doe2026, doe2026].",
        score: 2,
      },
    ]);
    expect(searchWorkspaceKnowledge(snapshot, "evidence connected")).toMatchObject([
      { resourceId: "annotation:annotation-1", kind: "annotation", score: 4 },
    ]);
    expect(searchWorkspaceKnowledge(snapshot, "   ")).toEqual([]);
    expect(searchWorkspaceKnowledge(snapshot, "missing")).toEqual([]);
  });

  it("bounds and consistently orders searchable resource representations", () => {
    const pdfs = Array.from({ length: 55 }, (_, index) => ({
      ...snapshot.pdfs[0]!,
      id: `pdf-${index}`,
      name: `paper-${String(index).padStart(2, "0")}.pdf`,
    }));
    expect(searchWorkspaceKnowledge({ ...snapshot, pdfs }, "paper")).toHaveLength(50);

    const ordered = searchWorkspaceKnowledge(
      {
        ...snapshot,
        pdfs: [
          { ...snapshot.pdfs[0]!, id: "zulu", name: "Zulu match.pdf" },
          { ...snapshot.pdfs[0]!, id: "alpha", name: "Alpha match.pdf" },
        ],
      },
      "match",
    );
    expect(ordered.map((result) => result.title)).toEqual(["Alpha match.pdf", "Zulu match.pdf"]);

    expect(searchWorkspaceKnowledge(snapshot, "2 KB")).toMatchObject([{ kind: "pdf", excerpt: "PDF · 2 KB" }]);
    expect(searchWorkspaceKnowledge(snapshot, "evidence")).toContainEqual({
      resourceId: "document:workspace",
      kind: "document",
      title: "Evidence map",
      excerpt: "",
      score: 8,
    });
  });

  it("uses readable fallbacks and author separators", () => {
    const results = searchWorkspaceKnowledge(
      {
        ...snapshot,
        publications: [{ ...snapshot.publications[0]!, authors: ["Doe, Jane", "Researcher, Alex"] }],
        annotations: [{ ...snapshot.annotations[0]!, comment: "" }],
      },
      "annotation",
    );
    expect(results).toMatchObject([{ kind: "annotation", title: "Annotation on page 4" }]);

    expect(
      searchWorkspaceKnowledge(
        { ...snapshot, publications: [{ ...snapshot.publications[0]!, authors: ["Doe, Jane", "Researcher, Alex"] }] },
        "inspectable",
      )[0]?.excerpt,
    ).toContain("Doe, Jane; Researcher, Alex");
  });

  it("derives typed links and deduplicates repeated citations", () => {
    expect(buildWorkspaceKnowledgeGraph(snapshot)).toEqual({
      nodes: [
        { id: "document:workspace", kind: "document", label: "Evidence map" },
        { id: "section:methods", kind: "section", label: "Methods" },
        { id: "section:results", kind: "section", label: "Results" },
        { id: "publication:publication-1", kind: "publication", label: "Inspectable Science" },
        { id: "pdf:pdf-1", kind: "pdf", label: "methods.pdf" },
        { id: "annotation:annotation-1", kind: "annotation", label: "Grounding note" },
      ],
      edges: [
        {
          id: "annotates:annotation-1:pdf-1",
          relation: "annotates",
          from: "annotation:annotation-1",
          to: "pdf:pdf-1",
          label: "page 4",
        },
        {
          id: "used-in:link-1",
          relation: "used-in",
          from: "annotation:annotation-1",
          to: "document:workspace",
          label: "Methods",
        },
        {
          id: "cites:workspace:publication-1",
          relation: "cites",
          from: "document:workspace",
          to: "publication:publication-1",
          label: "doe2026",
        },
      ],
    });
  });

  it("matches preview identities for repeated navigable headings", () => {
    const graph = buildWorkspaceKnowledgeGraph({
      ...snapshot,
      source: "## Same heading\n\n## Same heading\n\n#### Paragraph label\n",
    });
    expect(graph.nodes.filter((node) => node.kind === "section")).toEqual([
      { id: "section:same-heading", kind: "section", label: "Same heading" },
      { id: "section:same-heading-2", kind: "section", label: "Same heading" },
    ]);
  });

  it("validates search and graph representations", () => {
    const results = searchWorkspaceKnowledge(snapshot, "methods");
    const graph = buildWorkspaceKnowledgeGraph(snapshot);
    expect(isKnowledgeSearchResults(results)).toBe(true);
    expect(isWorkspaceKnowledgeGraph(graph)).toBe(true);
    expect(isKnowledgeSearchResults([{ ...results[0], score: "high" }])).toBe(false);
    expect(isKnowledgeSearchResults([results[0], { ...results[0], title: "" }])).toBe(false);
    expect(isWorkspaceKnowledgeGraph({ ...graph, edges: [{ ...graph.edges[0], relation: "unknown" }] })).toBe(false);
    expect(isWorkspaceKnowledgeGraph({ ...graph, nodes: [graph.nodes[0], { ...graph.nodes[0], id: "" }] })).toBe(false);
    expect(isWorkspaceKnowledgeGraph({ ...graph, edges: [graph.edges[0], { ...graph.edges[0], relation: "unknown" }] })).toBe(false);
    expect(isWorkspaceKnowledgeGraph({ nodes: null, edges: [] })).toBe(false);
  });
});
