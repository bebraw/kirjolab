import { describe, expect, it } from "vitest";
import type { WorkspaceSnapshot } from "./workspace";
import { buildWorkspaceKnowledgeGraph, isKnowledgeSearchResults, isWorkspaceKnowledgeGraph, searchWorkspaceKnowledge } from "./knowledge";

const snapshot: WorkspaceSnapshot = {
  id: "workspace",
  title: "Evidence map",
  entryFileId: "main-file",
  files: [
    {
      id: "main-file",
      path: "main.md",
      mediaType: "text/markdown",
      content: `## Methods {#methods}\n\nInspectable methods support the claim :cite[doe2026, doe2026].\n\n## Results\n\nA separate result.`,
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  composition: { content: "", sourceMap: [], diagnostics: [], dependencies: {} },
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
  projectReferences: [],
  researchShares: [],
  publicationPdfLinks: [
    {
      id: "publication-pdf-1",
      publicationId: "publication-1",
      pdfId: "pdf-1",
      createdAt: "2026-07-10T00:00:00.000Z",
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
      fragments: [],
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  links: [
    {
      id: "link-1",
      annotationId: "annotation-1",
      anchor: {
        version: 1,
        fileId: "main-file",
        relativeStart: "AA",
        relativeEnd: "AQ",
        exact: "Methods",
        prefix: "",
        suffix: " remain inspectable",
        originalRange: { start: 0, end: 7 },
        anchoredRevision: 1,
      },
      resolution: { status: "resolved", start: 0, end: 7, text: "Methods", exactMatch: true },
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  claims: [
    {
      id: "claim-1",
      text: "Inspectable evidence supports accountable claims.",
      note: "Synthesis note",
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  claimEvidenceLinks: [
    {
      id: "claim-evidence-1",
      claimId: "claim-1",
      annotationId: "annotation-1",
      relation: "supports",
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  claimLinks: [
    {
      id: "claim-link-1",
      claimId: "claim-1",
      anchor: {
        version: 1,
        fileId: "main-file",
        relativeStart: "AA",
        relativeEnd: "AQ",
        exact: "Methods",
        prefix: "",
        suffix: " remain inspectable",
        originalRange: { start: 0, end: 7 },
        anchoredRevision: 1,
      },
      resolution: { status: "resolved", start: 0, end: 7, text: "Methods", exactMatch: true },
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  ],
  comments: [],
  candidates: [],
};

describe("knowledge navigation", () => {
  it("searches stable resources with deterministic relevance", () => {
    expect(searchWorkspaceKnowledge(snapshot, "inspectable")).toEqual([
      {
        resourceId: "claim:claim-1",
        kind: "claim",
        title: "Inspectable evidence supports accountable claims.",
        excerpt: "Synthesis note · Grounding note · Evidence remains connected.",
        score: 8,
      },
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
    expect(searchWorkspaceKnowledge(snapshot, "evidence connected")).toContainEqual(
      expect.objectContaining({ resourceId: "annotation:annotation-1", kind: "annotation", score: 4 }),
    );
    expect(searchWorkspaceKnowledge(snapshot, "synthesis")).toMatchObject([{ resourceId: "claim:claim-1", kind: "claim" }]);
    expect(searchWorkspaceKnowledge(snapshot, "grounding connected")).toContainEqual(
      expect.objectContaining({ resourceId: "claim:claim-1", kind: "claim" }),
    );
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

    const publication = searchWorkspaceKnowledge(
      { ...snapshot, publications: [{ ...snapshot.publications[0]!, authors: ["Doe, Jane", "Researcher, Alex"] }] },
      "inspectable",
    ).find((result) => result.kind === "publication");
    expect(publication?.excerpt).toContain("Doe, Jane; Researcher, Alex");
  });

  it("derives typed links and deduplicates repeated citations", () => {
    expect(buildWorkspaceKnowledgeGraph(snapshot)).toEqual({
      nodes: [
        { id: "project:workspace", kind: "project", label: "Evidence map" },
        { id: "document:workspace", kind: "document", label: "Evidence map" },
        { id: "section:methods", kind: "section", label: "Methods" },
        { id: "section:results", kind: "section", label: "Results" },
        { id: "publication:publication-1", kind: "publication", label: "Inspectable Science" },
        { id: "pdf:pdf-1", kind: "pdf", label: "methods.pdf" },
        { id: "annotation:annotation-1", kind: "annotation", label: "Grounding note" },
        { id: "claim:claim-1", kind: "claim", label: "Inspectable evidence supports accountable claims." },
      ],
      edges: [
        {
          id: "contains:workspace:workspace",
          relation: "contains",
          from: "project:workspace",
          to: "document:workspace",
          label: "main manuscript",
        },
        {
          id: "has-artifact:publication-pdf-1",
          relation: "has-artifact",
          from: "publication:publication-1",
          to: "pdf:pdf-1",
          label: "has artifact",
        },
        {
          id: "annotates:annotation-1:pdf-1",
          relation: "annotates",
          from: "annotation:annotation-1",
          to: "pdf:pdf-1",
          label: "page 4",
        },
        {
          id: "supports:claim-evidence-1",
          relation: "supports",
          from: "annotation:annotation-1",
          to: "claim:claim-1",
          label: "supports",
        },
        {
          id: "used-in:claim-link-1",
          relation: "used-in",
          from: "claim:claim-1",
          to: "document:workspace",
          label: "Methods",
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

  it("projects people, shared notes, and provenance-bearing model candidates as typed resources", () => {
    const members = [{ id: "person-1", email: "researcher@example.org", role: "owner" as const, addedAt: "2026-07-10T00:00:00.000Z" }];
    const expanded: WorkspaceSnapshot = {
      ...snapshot,
      researchShares: [
        {
          id: "share-1",
          projectId: snapshot.id,
          referenceId: "publication-1",
          resourceId: "note-1",
          kind: "note",
          content: { kind: "note", body: "Private interpretation shared deliberately with the project." },
          createdAt: "2026-07-10T00:00:00.000Z",
          revokedAt: null,
        },
      ],
      candidates: [
        {
          id: "candidate-1",
          operation: "revise-selection",
          promptVersion: "revise-selection-v1",
          providerAdapter: "openai-compatible",
          providerLabel: "Local model",
          model: "scholar-1",
          instruction: "Make the revision proposal precise.",
          sourceRevision: 1,
          target: { anchor: snapshot.claimLinks[0]!.anchor, resolution: snapshot.claimLinks[0]!.resolution },
          evidence: [
            {
              kind: "claim",
              id: snapshot.claims[0]!.id,
              version: snapshot.claims[0]!.updatedAt,
              text: snapshot.claims[0]!.text,
              note: snapshot.claims[0]!.note,
              createdAt: snapshot.claims[0]!.createdAt,
              updatedAt: snapshot.claims[0]!.updatedAt,
            },
          ],
          proposedReplacement: "A precise revision proposal grounded in the claim.",
          status: "pending",
          createdAt: "2026-07-10T00:00:00.000Z",
        },
      ],
    };

    expect(searchWorkspaceKnowledge(expanded, "private interpretation", members)).toContainEqual(
      expect.objectContaining({ resourceId: "note:note-1", kind: "note" }),
    );
    expect(searchWorkspaceKnowledge(expanded, "revision proposal", members)).toContainEqual(
      expect.objectContaining({ resourceId: "model-candidate:candidate-1", kind: "model-candidate" }),
    );
    expect(searchWorkspaceKnowledge(expanded, "project collaborator", members)).toContainEqual(
      expect.objectContaining({ resourceId: "person:person-1", kind: "person" }),
    );

    const graph = buildWorkspaceKnowledgeGraph(expanded, members);
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        { id: "project:workspace", kind: "project", label: "Evidence map" },
        { id: "person:person-1", kind: "person", label: "researcher@example.org" },
        { id: "note:note-1", kind: "note", label: "Private interpretation shared deliberately with the project." },
        {
          id: "model-candidate:candidate-1",
          kind: "model-candidate",
          label: "A precise revision proposal grounded in the claim.",
        },
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "participates-in", from: "person:person-1", to: "project:workspace" }),
        expect.objectContaining({ relation: "derived-from", from: "note:note-1", to: "publication:publication-1" }),
        expect.objectContaining({
          relation: "derived-from",
          from: "model-candidate:candidate-1",
          to: "claim:claim-1",
        }),
        expect.objectContaining({ relation: "used-in", from: "model-candidate:candidate-1", to: "document:workspace" }),
      ]),
    );
    expect(isWorkspaceKnowledgeGraph(graph)).toBe(true);
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
