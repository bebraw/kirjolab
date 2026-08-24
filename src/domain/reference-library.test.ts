import { describe, expect, it } from "vitest";
import {
  bibliographicSnapshot,
  compareWebSnapshotText,
  crossrefMetadataFields,
  extractWebDocument,
  isArtifactAnalysis,
  isArtifactAnalysisJob,
  isCrossrefMetadata,
  isLibraryHighlightImportCandidate,
  isLibraryPdfArtifactPage,
  isLibraryPdfMarkup,
  isMetadataRefinementPreview,
  isPdfDraftResult,
  isPdfHighlightAnalysisResult,
  isPdfReferenceAnalysisResult,
  isProjectReferencePdfs,
  isReferenceLibrarySnapshot,
  likelyReferenceIdentity,
  libraryPdfRectsOverlap,
  memorableReferenceKey,
  mergeLibraryHighlightQuote,
  mergeLibraryPdfRects,
  missingRequiredBibliographicFields,
  normalizeWebSourceUrl,
  referenceFromBibTeX,
} from "./reference-library";

const provenance = { method: "bibtex", capturedAt: "2026-07-11T10:00:00.000Z", actor: "owner@example.test" } as const;
const capturedWebSnapshot = {
  id: "snapshot-1",
  referenceId: "reference-1",
  requestedUrl: "https://example.com/start#fragment",
  finalUrl: "https://example.com/article",
  accessedAt: "2026-07-12T10:30:00.000Z",
  status: 200,
  contentType: "text/html; charset=utf-8",
  rawObjectKey: "libraries/owner/web/snapshot-1/raw",
  readableObjectKey: "libraries/owner/web/snapshot-1/readable.txt",
  rawSize: 200,
  readableSize: 100,
  contentHash: "sha256:captured",
  title: "Captured title",
  authors: ["Captured Author"],
  publisher: "Captured Publisher",
  publishedAt: "2024-05-03",
  complete: false,
  diagnostics: ["Partial capture"],
  redirectChain: ["https://example.com/article"],
  etag: '"capture"',
  lastModified: "Fri, 03 May 2024 10:00:00 GMT",
} as const;

describe("shared reference library", () => {
  it("validates bounded, versioned artifact analysis messages and results", () => {
    const candidate = {
      id: "annotation:1:0",
      source: "annotation",
      confidence: 1,
      page: 1,
      quote: "Inspectable evidence",
      comment: "",
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    } as const;
    const result = { candidates: [candidate], pagesScanned: 1, pagesTotal: 2, truncated: false };
    const analysis = {
      artifactId: "artifact-1",
      fingerprint: "etag:artifact-1",
      kind: "pdf-highlights",
      status: "ready",
      result,
      error: "",
      requestedAt: "2026-07-29T00:00:00.000Z",
      startedAt: "2026-07-29T00:00:01.000Z",
      completedAt: "2026-07-29T00:00:02.000Z",
    } as const;
    const job = {
      version: 1,
      ownerKey: "owner",
      artifactId: analysis.artifactId,
      fingerprint: analysis.fingerprint,
      kind: analysis.kind,
      requestedAt: analysis.requestedAt,
    } as const;

    expect(isPdfHighlightAnalysisResult(result)).toBe(true);
    expect(isPdfHighlightAnalysisResult({ ...result, pagesScanned: 201 })).toBe(false);
    expect(isPdfHighlightAnalysisResult({ ...result, candidates: [{ ...candidate, confidence: 2 }] })).toBe(false);
    expect(isArtifactAnalysis(analysis)).toBe(true);
    expect(isArtifactAnalysis({ ...analysis, status: "unknown" })).toBe(false);
    expect(isArtifactAnalysisJob(job)).toBe(true);
    expect(isArtifactAnalysisJob({ ...job, version: 2 })).toBe(false);

    const referenceResult = {
      candidates: [
        {
          id: "doi:10.5555/reference",
          page: 2,
          raw: "Doe, Jane. 2025. Useful reference. doi:10.5555/reference",
          title: "Useful reference",
          authors: ["Doe, Jane"],
          year: "2025",
          doi: "10.5555/reference",
          url: "",
          confidence: 1,
        },
      ],
      pagesScanned: 2,
      pagesTotal: 2,
      referencesStartPage: 2,
      truncated: false,
    } as const;
    const referenceAnalysis = { ...analysis, kind: "pdf-references", result: referenceResult } as const;
    expect(isPdfReferenceAnalysisResult(referenceResult)).toBe(true);
    expect(isPdfReferenceAnalysisResult({ ...referenceResult, referencesStartPage: 3 })).toBe(false);
    expect(isArtifactAnalysis(referenceAnalysis)).toBe(true);
    expect(isArtifactAnalysis({ ...referenceAnalysis, result })).toBe(false);
    expect(isArtifactAnalysisJob({ ...job, kind: "pdf-references" })).toBe(true);
    expect(isArtifactAnalysisJob({ ...job, kind: "pdf-text" })).toBe(true);
    expect(
      isArtifactAnalysis({
        ...analysis,
        kind: "pdf-text",
        result: {
          pages: [{ page: 1, text: "Searchable text", source: "ocr" }],
          pagesScanned: 1,
          pagesTotal: 1,
          ocrPages: 1,
          truncated: false,
        },
      }),
    ).toBe(true);
  });

  it("accepts only safe project reference PDF descriptors", () => {
    const pdf = { id: "pdf-1", referenceId: "ref-1", name: "paper.pdf", size: 42, fingerprint: "r2-etag:test" };
    expect(isProjectReferencePdfs([pdf])).toBe(true);
    expect(isProjectReferencePdfs([{ ...pdf, objectKey: "libraries/owner/private.pdf" }])).toBe(false);
    expect(isProjectReferencePdfs([{ ...pdf, referenceId: null }])).toBe(false);
    expect(isProjectReferencePdfs([{ ...pdf, size: -1 }])).toBe(false);
    expect(isProjectReferencePdfs({ pdfs: [pdf] })).toBe(false);
  });

  it("requires every project PDF field exactly and preserves zero-sized descriptors", () => {
    const pdf = { id: "pdf-1", referenceId: "ref-1", name: "paper.pdf", size: 0, fingerprint: "fingerprint" };
    expect(isProjectReferencePdfs([pdf])).toBe(true);
    expect(isProjectReferencePdfs([pdf, { ...pdf, size: -1 }])).toBe(false);
    for (const value of [
      { ...pdf, extra: true },
      { referenceId: pdf.referenceId, name: pdf.name, size: pdf.size, fingerprint: pdf.fingerprint },
      { ...pdf, id: 1 },
      { ...pdf, referenceId: 1 },
      { ...pdf, name: 1 },
      { ...pdf, size: 0.5 },
      { ...pdf, fingerprint: 1 },
    ]) {
      expect(isProjectReferencePdfs([value]), JSON.stringify(value)).toBe(false);
    }
  });

  it("accepts only bounded imported PDF highlight candidates", () => {
    const candidate = {
      page: 2,
      quote: "Recovered evidence",
      comment: "Private note",
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    };
    expect(isLibraryHighlightImportCandidate(candidate)).toBe(true);
    expect(isLibraryHighlightImportCandidate({ ...candidate, page: 0 })).toBe(false);
    expect(isLibraryHighlightImportCandidate({ ...candidate, quote: "" })).toBe(false);
    expect(isLibraryHighlightImportCandidate({ ...candidate, rects: [] })).toBe(false);
    expect(isLibraryHighlightImportCandidate({ ...candidate, rects: [{ x: -0.1, y: 0.2, width: 0.3, height: 0.04 }] })).toBe(false);
  });

  it("validates every imported highlight and normalized rectangle boundary", () => {
    const candidate = {
      page: 1,
      quote: "x",
      comment: "",
      rects: [{ x: 0, y: 0, width: 1, height: 1 }],
    };
    expect(isLibraryHighlightImportCandidate(candidate)).toBe(true);
    for (const value of [
      null,
      [],
      { ...candidate, page: 1.5 },
      { ...candidate, page: -1 },
      { ...candidate, quote: 1 },
      { ...candidate, quote: "x".repeat(20_001) },
      { ...candidate, comment: 1 },
      { ...candidate, comment: "x".repeat(8_001) },
      { ...candidate, rects: "rect" },
      { ...candidate, rects: Array.from({ length: 513 }, () => candidate.rects[0]) },
      { ...candidate, rects: [null] },
      { ...candidate, rects: [{ ...candidate.rects[0], x: Number.NaN }] },
      { ...candidate, rects: [{ ...candidate.rects[0], y: 1.1 }] },
      { ...candidate, rects: [{ ...candidate.rects[0], width: 0 }] },
      { ...candidate, rects: [{ ...candidate.rects[0], height: -1 }] },
      { ...candidate, rects: [{ x: 0.5, y: 0, width: 0.500_002, height: 1 }] },
      { ...candidate, rects: [{ x: 0, y: 0.5, width: 1, height: 0.500_002 }] },
    ]) {
      expect(isLibraryHighlightImportCandidate(value), JSON.stringify(value)).toBe(false);
    }
    expect(isLibraryHighlightImportCandidate({ ...candidate, quote: "x".repeat(20_000), comment: "x".repeat(8_000) })).toBe(true);
    expect(isLibraryHighlightImportCandidate({ ...candidate, rects: [{ x: 0, y: 0, width: 1.000_001, height: 1.000_001 }] })).toBe(true);
    expect(isLibraryHighlightImportCandidate({ ...candidate, rects: Array.from({ length: 512 }, () => candidate.rects[0]) })).toBe(true);
    expect(isLibraryHighlightImportCandidate({ ...candidate, rects: [candidate.rects[0], { ...candidate.rects[0], height: 0 }] })).toBe(
      false,
    );
  });

  it("strictly validates private PDF notes and drawings at every boundary", () => {
    const base = {
      id: "markup-1",
      referenceId: "reference-1",
      artifactId: "artifact-1",
      page: 1,
      createdAt: "created",
      updatedAt: "updated",
    };
    const note = { ...base, kind: "note", x: 0, y: 1, body: "note" };
    const drawing = {
      ...base,
      kind: "drawing",
      color: "#aBc123",
      width: 1,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    };
    expect(isLibraryPdfMarkup(note)).toBe(true);
    expect(isLibraryPdfMarkup(drawing)).toBe(true);
    for (const value of [
      null,
      [],
      { ...note, id: 1 },
      { ...note, referenceId: 1 },
      { ...note, artifactId: 1 },
      { ...note, page: 0 },
      { ...note, page: 1.5 },
      { ...note, createdAt: 1 },
      { ...note, updatedAt: 1 },
      { ...note, x: -0.1 },
      { ...note, y: Number.POSITIVE_INFINITY },
      { ...note, body: 1 },
      { ...note, body: "x".repeat(8_001) },
      { ...drawing, kind: "other" },
      { ...drawing, color: 1 },
      { ...drawing, color: "#12345" },
      { ...drawing, color: "#gggggg" },
      { ...drawing, width: Number.NaN },
      { ...drawing, width: 0 },
      { ...drawing, width: 25 },
      { ...drawing, points: "points" },
      { ...drawing, points: [drawing.points[0]] },
      { ...drawing, points: Array.from({ length: 2_049 }, () => drawing.points[0]) },
      { ...drawing, points: [drawing.points[0], null] },
      { ...drawing, points: [drawing.points[0], { x: -1, y: 0 }] },
      { ...drawing, points: [drawing.points[0], { x: 0, y: 2 }] },
    ]) {
      expect(isLibraryPdfMarkup(value), JSON.stringify(value)).toBe(false);
    }
    expect(isLibraryPdfMarkup({ ...note, body: "x".repeat(8_000) })).toBe(true);
    expect(isLibraryPdfMarkup({ ...drawing, width: 24, points: Array.from({ length: 2_048 }, () => drawing.points[0]) })).toBe(true);
    expect(isLibraryPdfMarkup({ ...drawing, color: "x#aBc123" })).toBe(false);
    expect(isLibraryPdfMarkup({ ...drawing, color: "#aBc123x" })).toBe(false);
  });

  it("accepts only complete PDF draft results", () => {
    const reference = referenceFromBibTeX(
      { type: "misc", citationKey: "guide", fields: { title: "Private Guide" } },
      "reference-1",
      provenance,
    );
    const artifact = {
      id: "artifact-1",
      referenceId: reference.id,
      name: "guide.pdf",
      contentType: "application/pdf",
      size: 100,
      objectKey: "libraries/owner/guide.pdf",
      fingerprint: "r2-etag:guide",
      rights: "private",
      createdAt: "2026-07-13T10:00:00.000Z",
    };
    const result = { reference, artifact, created: false };
    expect(isPdfDraftResult(result)).toBe(true);
    for (const candidate of [
      null,
      { ...result, reference: null },
      { ...result, artifact: null },
      { ...result, created: "false" },
      { ...result, artifact: { ...artifact, referenceId: 1 } },
      { ...result, artifact: { ...artifact, contentType: "text/plain" } },
      { ...result, artifact: { ...artifact, size: -1 } },
      { ...result, artifact: { ...artifact, rights: "public" } },
    ]) {
      expect(isPdfDraftResult(candidate)).toBe(false);
    }
  });

  it("accepts only bounded public PDF catalog pages", () => {
    const reference = referenceFromBibTeX(
      { type: "misc", citationKey: "guide", fields: { title: "Private Guide" } },
      "reference-1",
      provenance,
    );
    const artifact = {
      id: "artifact-1",
      referenceId: reference.id,
      name: "guide.pdf",
      contentType: "application/pdf",
      size: 100,
      fingerprint: "r2-etag:guide",
      rights: "private",
      createdAt: "2026-07-13T10:00:00.000Z",
    } as const;
    const catalogReference = {
      id: reference.id,
      referenceKey: reference.referenceKey,
      type: reference.type,
      title: reference.title,
      authors: reference.authors,
      year: reference.year,
      venue: reference.venue,
      doi: reference.doi,
      url: reference.url,
      abstract: reference.abstract,
      provenance: reference.provenance,
      createdAt: reference.createdAt,
      updatedAt: reference.updatedAt,
    };
    const page = { items: [{ artifact, reference: catalogReference }], next: null };

    expect(isLibraryPdfArtifactPage(page)).toBe(true);
    expect(isLibraryPdfArtifactPage({ ...page, items: [{ ...page.items[0], artifact: { ...artifact, objectKey: "private" } }] })).toBe(
      false,
    );
    expect(
      isLibraryPdfArtifactPage({
        ...page,
        items: [{ ...page.items[0], reference: { ...catalogReference, abstract: "x".repeat(20_001) } }],
      }),
    ).toBe(false);
    const aggregateByteOverflow = {
      items: Array.from({ length: 100 }, (_, index) => ({
        artifact: { ...artifact, id: `artifact-${index}`, referenceId: `reference-${index}` },
        reference: {
          ...catalogReference,
          id: `reference-${index}`,
          authors: Array.from({ length: 100 }, () => "€".repeat(500)),
          abstract: "€".repeat(20_000),
        },
      })),
      next: null,
    };
    expect(
      aggregateByteOverflow.items.every((item) =>
        isLibraryPdfArtifactPage({
          items: [item],
          next: null,
        }),
      ),
    ).toBe(true);
    expect(isLibraryPdfArtifactPage(aggregateByteOverflow)).toBe(false);
  });

  it("accepts only bounded Crossref metadata", () => {
    expect(crossrefMetadataFields).toEqual(["type", "title", "authors", "year", "venue", "doi", "url", "abstract"]);
    const atBounds = {
      type: "x".repeat(100),
      title: "x".repeat(2_000),
      authors: Array.from({ length: 100 }, () => "x".repeat(500)),
      year: "x".repeat(100),
      venue: "x".repeat(2_000),
      doi: "x".repeat(500),
      url: "x".repeat(2_000),
      abstract: "x".repeat(20_000),
    };
    expect(isCrossrefMetadata(atBounds)).toBe(true);
    for (const metadata of [
      { ...atBounds, type: "" },
      { ...atBounds, type: "x".repeat(101) },
      { ...atBounds, type: null },
      { ...atBounds, title: "" },
      { ...atBounds, title: "x".repeat(2_001) },
      { ...atBounds, title: null },
      { ...atBounds, authors: "Doe, Jane" },
      { ...atBounds, authors: Array.from({ length: 101 }, () => "Doe, Jane") },
      { ...atBounds, authors: [1] },
      { ...atBounds, authors: ["x".repeat(501)] },
      { ...atBounds, year: "x".repeat(101) },
      { ...atBounds, year: null },
      { ...atBounds, venue: "x".repeat(2_001) },
      { ...atBounds, venue: null },
      { ...atBounds, doi: "" },
      { ...atBounds, doi: "x".repeat(501) },
      { ...atBounds, doi: null },
      { ...atBounds, url: "x".repeat(2_001) },
      { ...atBounds, url: null },
      { ...atBounds, abstract: "x".repeat(20_001) },
      { ...atBounds, abstract: null },
    ]) {
      expect(isCrossrefMetadata(metadata)).toBe(false);
    }
  });

  it("rejects Crossref author arrays when any provider name is invalid", () => {
    const metadata = {
      type: "article",
      title: "Evidence",
      authors: ["Doe, Jane"],
      year: "2026",
      venue: "Journal",
      doi: "10.5555/evidence",
      url: "https://doi.org/10.5555/evidence",
      abstract: "",
    };
    expect(isCrossrefMetadata({ ...metadata, authors: ["Doe, Jane", 1] })).toBe(false);
    expect(isCrossrefMetadata({ ...metadata, authors: ["Doe, Jane", { length: 1 }] })).toBe(false);
    expect(isCrossrefMetadata({ ...metadata, authors: ["Doe, Jane", "x".repeat(501)] })).toBe(false);
  });

  it("accepts only bounded provider refinement candidates", () => {
    const candidate = {
      provider: "datacite",
      match: "doi",
      score: null,
      metadata: {
        type: "misc",
        title: "Dataset",
        authors: ["Doe, Jane"],
        year: "2026",
        venue: "Archive",
        doi: "10.5438/data",
        url: "https://doi.org/10.5438/data",
        abstract: "",
      },
      metadataFingerprint: "a".repeat(64),
    };
    const preview = { referenceId: "reference-1", artifactId: "artifact-1", candidates: [candidate] };
    expect(isMetadataRefinementPreview(preview)).toBe(true);
    expect(isMetadataRefinementPreview({ ...preview, candidates: [{ ...candidate, provider: "openalex" }] })).toBe(true);
    expect(isMetadataRefinementPreview({ ...preview, candidates: [{ ...candidate, provider: "semantic-scholar" }] })).toBe(true);
    expect(isMetadataRefinementPreview({ ...preview, candidates: Array.from({ length: 12 }, () => candidate) })).toBe(true);
    expect(isMetadataRefinementPreview({ ...preview, candidates: Array.from({ length: 13 }, () => candidate) })).toBe(false);
    expect(isMetadataRefinementPreview({ ...preview, candidates: [{ ...candidate, provider: "unknown" }] })).toBe(false);
    expect(isMetadataRefinementPreview({ ...preview, candidates: [{ ...candidate, match: "guess" }] })).toBe(false);
    expect(isMetadataRefinementPreview({ ...preview, candidates: [{ ...candidate, score: Number.NaN }] })).toBe(false);
    expect(isMetadataRefinementPreview({ ...preview, candidates: [{ ...candidate, metadataFingerprint: "stale" }] })).toBe(false);
    expect(isMetadataRefinementPreview({ ...preview, candidates: [{ ...candidate, metadataFingerprint: `x${"a".repeat(64)}` }] })).toBe(
      false,
    );
    expect(isMetadataRefinementPreview({ ...preview, candidates: [{ ...candidate, metadataFingerprint: `${"a".repeat(64)}x` }] })).toBe(
      false,
    );
    expect(isMetadataRefinementPreview({ ...preview, candidates: [{ ...candidate, score: 0 }] })).toBe(true);
    expect(isMetadataRefinementPreview({ ...preview, candidates: [{ ...candidate, score: "0" }] })).toBe(false);
    expect(isMetadataRefinementPreview({ ...preview, candidates: [candidate, { ...candidate, provider: "unknown" }] })).toBe(false);
  });

  it("derives memorable reference keys from available metadata", () => {
    expect(memorableReferenceKey({ title: "Climate adaptation pathways", authors: ["Smith, Jane"], year: "2024" })).toBe("smith2024");
    expect(memorableReferenceKey({ title: "Climate adaptation pathways", authors: ["Jane Smith"], year: "2024" }, true)).toBe(
      "smith2024climate",
    );
    expect(memorableReferenceKey({ title: "Climate adaptation pathways.pdf", authors: [], year: "" })).toBe("sourceundatedclimate");
    expect(memorableReferenceKey({ title: "Über methods", authors: ["Jöhn Dœ"], year: "forthcoming" })).toBe("dœundateduber");
    expect(memorableReferenceKey({ title: "The study of climate", authors: ["Ada Mary van Rossum"], year: "Spring 2025" }, true)).toBe(
      "rossum2025study",
    );
    expect(memorableReferenceKey({ title: "Smith and the AI", authors: ["Smith,"], year: "x2025y" })).toBe("smith2025");
    expect(memorableReferenceKey({ title: "Smith and the AI", authors: ["Smith,"], year: "12025" })).toBe("smithundatedwork");
    expect(memorableReferenceKey({ title: "Smith and the AI", authors: ["Smith,"], year: "20251" })).toBe("smithundatedwork");
    expect(memorableReferenceKey({ title: "A study", authors: [" , Jane"], year: "" })).toBe("sourceundatedstudy");
    expect(memorableReferenceKey({ title: "The AI of an", authors: [], year: "" })).toBe("sourceundatedwork");
    expect(memorableReferenceKey({ title: "Map of evidence", authors: [" Jane Smith "], year: "2025" }, true)).toBe("smith2025map");
    expect(memorableReferenceKey({ title: "Evidence map", authors: [], year: "2025" })).toBe("source2025evidence");
    expect(memorableReferenceKey({ title: "x".repeat(100), authors: [], year: "" })).toHaveLength(80);
  });
  it("retains per-field provenance and derives a portable snapshot", () => {
    const record = referenceFromBibTeX(
      {
        type: "article",
        citationKey: "doe2026",
        fields: { title: "Evidence", author: "Doe, Jane", year: "2026", journal: "Research", doi: "https://doi.org/10.1/ABC" },
      },
      "reference-1",
      provenance,
    );
    expect(record.doi).toBe("10.1/abc");
    expect(record.provenance.title).toEqual(provenance);
    expect(missingRequiredBibliographicFields(record)).toEqual([]);
    expect(bibliographicSnapshot(record, "captured")).toMatchObject({
      referenceId: "reference-1",
      capturedAt: "captured",
      tombstone: false,
    });
    expect(bibliographicSnapshot(record, "captured")).toEqual({
      referenceId: "reference-1",
      type: "article",
      title: "Evidence",
      authors: ["Doe, Jane"],
      year: "2026",
      venue: "Research",
      doi: "10.1/abc",
      url: "",
      capturedAt: "captured",
      tombstone: false,
      webSnapshot: null,
    });
    expect(bibliographicSnapshot(record, "project-capture", capturedWebSnapshot)).toEqual({
      referenceId: "reference-1",
      type: "article",
      title: "Captured title",
      authors: ["Captured Author"],
      year: "2024",
      venue: "Captured Publisher",
      doi: "10.1/abc",
      url: "",
      capturedAt: "project-capture",
      tombstone: false,
      webSnapshot: {
        id: "snapshot-1",
        accessedAt: "2026-07-12T10:30:00.000Z",
        finalUrl: "https://example.com/article",
        contentHash: "sha256:captured",
        complete: false,
        diagnostics: ["Partial capture"],
      },
    });
    expect(
      bibliographicSnapshot(record, "project-capture", {
        ...capturedWebSnapshot,
        title: "",
        authors: [],
        publisher: "",
        publishedAt: "not dated",
      }),
    ).toMatchObject({ title: "Evidence", authors: [], year: "", venue: "", webSnapshot: { diagnostics: ["Partial capture"] } });
  });

  it("validates BibTeX type requirements without requiring a DOI", () => {
    const record = referenceFromBibTeX({ type: "article", citationKey: "draft", fields: { title: "Draft" } }, "draft", provenance);
    expect(missingRequiredBibliographicFields(record)).toEqual(["authors", "year", "venue"]);
    const manual = referenceFromBibTeX({ type: "manual", citationKey: "guide", fields: { title: "Guide" } }, "guide", provenance);
    expect(missingRequiredBibliographicFields(manual)).toEqual([]);
  });

  it("deduplicates by DOI before a normalized bibliographic fingerprint", () => {
    const first = { title: "A Study", authors: ["Doe, Jane"], year: "2026", doi: "10.1/ABC" };
    const second = { title: "Different", authors: [], year: "", doi: "https://doi.org/10.1/abc" };
    expect(likelyReferenceIdentity(first)).toBe("doi:10.1/abc");
    expect(likelyReferenceIdentity(first)).toBe(likelyReferenceIdentity(second));
    expect(likelyReferenceIdentity({ ...first, doi: "" })).toBe("work:a study|2026|doe jane");
    expect(likelyReferenceIdentity({ title: " Étude—One! ", authors: ["Ångström, Ada"], year: " 2025 ", doi: "" })).toBe(
      "work:e tude one|2025|a ngstro m ada",
    );
  });

  it("covers BibTeX type-specific required fields", () => {
    const complete = {
      id: "record",
      type: "article",
      title: "Title",
      authors: ["Author"],
      year: "2026",
      venue: "Venue",
      doi: "",
      url: "",
      abstract: "",
      provenance: {},
      archivedAt: null,
      deletedAt: null,
      createdAt: provenance.capturedAt,
      updatedAt: provenance.capturedAt,
    } as const;
    for (const type of ["article", "book", "inbook", "incollection", "inproceedings", "mastersthesis", "phdthesis", "techreport"]) {
      expect(missingRequiredBibliographicFields({ ...complete, type }), type).toEqual([]);
    }
    expect(missingRequiredBibliographicFields({ ...complete, type: "proceedings", authors: [], venue: "" })).toEqual([]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "unpublished", year: "", venue: "" })).toEqual([]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "unknown", authors: [], year: "", venue: "" })).toEqual([]);
    expect(missingRequiredBibliographicFields({ ...complete, authors: [] })).toEqual(["authors"]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "article", title: " ", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "book", title: "", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "inbook", title: "", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "incollection", title: "", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "inproceedings", title: "", authors: [], year: "", venue: "" })).toEqual(
      ["title", "authors", "year", "venue"],
    );
    expect(missingRequiredBibliographicFields({ ...complete, type: "manual", title: "" })).toEqual(["title"]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "mastersthesis", title: "", authors: [], year: "", venue: "" })).toEqual(
      ["title", "authors", "year", "venue"],
    );
    expect(missingRequiredBibliographicFields({ ...complete, type: "misc", title: "" })).toEqual(["title"]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "phdthesis", title: "", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "proceedings", title: "", year: "" })).toEqual(["title", "year"]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "techreport", title: "", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "unpublished", title: "", authors: [] })).toEqual(["title", "authors"]);
  });

  it("validates complete private-library snapshots and rejects malformed boundaries", () => {
    const record = referenceFromBibTeX({ type: "manual", citationKey: "guide", fields: { title: "Guide" } }, "guide", provenance);
    const valid = {
      references: [record],
      referenceKeyStates: { [record.id]: "final" },
      artifacts: [],
      webSources: [],
      webSnapshots: [],
      notes: [],
      highlights: [],
      tags: {},
      collections: {},
      reading: [],
    };
    expect(isReferenceLibrarySnapshot(valid)).toBe(true);
    expect(isReferenceLibrarySnapshot({ ...valid, references: [record, { ...record, id: 1 }] })).toBe(false);
    expect(isReferenceLibrarySnapshot({ ...valid, referenceKeyStates: { [record.id]: "final", invalid: "mutable" } })).toBe(false);
    expect(isReferenceLibrarySnapshot({ ...valid, tags: { [record.id]: ["valid", 1] } })).toBe(false);
    expect(isReferenceLibrarySnapshot({ ...valid, collections: { [record.id]: ["valid", 1] } })).toBe(false);
    for (const change of [
      {},
      { references: null },
      { references: [{ ...record, id: 1 }] },
      { references: [{ ...record, authors: [1] }] },
      { references: [{ ...record, provenance: null }] },
      { references: [{ ...record, archivedAt: 1 }] },
      { references: [{ ...record, deletedAt: 1 }] },
      { referenceKeyStates: null },
      { referenceKeyStates: { [record.id]: "mutable" } },
      { artifacts: null },
      {
        artifacts: [
          {
            id: "artifact-1",
            referenceId: record.id,
            name: "paper.pdf",
            contentType: "application/pdf",
            size: "42",
            objectKey: "libraries/owner/paper.pdf",
            fingerprint: "sha256:paper",
            rights: "private",
            createdAt: "2026-08-24T08:00:00.000Z",
          },
        ],
      },
      { webSources: null },
      { webSnapshots: null },
      { notes: null },
      { highlights: null },
      { tags: [] },
      { tags: { [record.id]: [1] } },
      { collections: [] },
      { collections: { [record.id]: [1] } },
      { reading: null },
    ]) {
      const candidate = Object.keys(change).length === 0 ? [] : { ...valid, ...change };
      expect(isReferenceLibrarySnapshot(candidate), JSON.stringify(change)).toBe(false);
    }
    const reading = { referenceId: record.id, status: "reading", rating: 4, priority: "high", updatedAt: "now" } as const;
    expect(isReferenceLibrarySnapshot({ ...valid, reading: [reading] })).toBe(true);
    for (const status of ["unread", "read"] as const) {
      expect(isReferenceLibrarySnapshot({ ...valid, reading: [{ ...reading, status }] })).toBe(true);
    }
    for (const priority of ["low", "normal"] as const) {
      expect(isReferenceLibrarySnapshot({ ...valid, reading: [{ ...reading, priority }] })).toBe(true);
    }
    expect(isReferenceLibrarySnapshot({ ...valid, reading: [{ ...reading, rating: null }] })).toBe(true);
    expect(isReferenceLibrarySnapshot({ ...valid, reading: [reading, { ...reading, status: "queued" }] })).toBe(false);
    for (const change of [
      { referenceId: 1 },
      { status: "queued" },
      { rating: "4" },
      { rating: 0 },
      { rating: 6 },
      { rating: 1.5 },
      { priority: "urgent" },
      { updatedAt: 1 },
    ]) {
      expect(isReferenceLibrarySnapshot({ ...valid, reading: [{ ...reading, ...change }] }), JSON.stringify(change)).toBe(false);
    }
    expect(isReferenceLibrarySnapshot(null)).toBe(false);
    expect(bibliographicSnapshot({ ...record, deletedAt: "deleted" }, "snapshot")).toMatchObject({
      referenceId: "guide",
      capturedAt: "snapshot",
      tombstone: true,
    });

    const webValid = {
      ...valid,
      webSources: [
        {
          referenceId: record.id,
          canonicalUrl: "https://example.com/article",
          createdAt: provenance.capturedAt,
          updatedAt: provenance.capturedAt,
        },
      ],
      webSnapshots: [{ ...capturedWebSnapshot, referenceId: record.id }],
    };
    expect(isReferenceLibrarySnapshot(webValid)).toBe(true);
    const highlight = {
      id: "highlight-1",
      referenceId: record.id,
      artifactId: "artifact-1",
      page: 1,
      quote: "Evidence",
      comment: "",
      rects: [{ x: 0, y: 0, width: 1, height: 1 }],
      createdAt: "created",
      updatedAt: "updated",
    };
    expect(isReferenceLibrarySnapshot({ ...webValid, highlights: [highlight] })).toBe(true);
    for (const change of [
      { id: 1 },
      { referenceId: 1 },
      { artifactId: 1 },
      { page: 0 },
      { page: 1.5 },
      { quote: 1 },
      { comment: 1 },
      { rects: null },
      { rects: [{ x: -1, y: 0, width: 1, height: 1 }] },
      { createdAt: 1 },
      { updatedAt: 1 },
    ]) {
      expect(isReferenceLibrarySnapshot({ ...webValid, highlights: [{ ...highlight, ...change }] }), JSON.stringify(change)).toBe(false);
    }
    expect(isReferenceLibrarySnapshot({ ...webValid, highlights: [highlight, { ...highlight, page: 0 }] })).toBe(false);

    const noteMarkup = {
      id: "markup-1",
      referenceId: record.id,
      artifactId: "artifact-1",
      page: 1,
      createdAt: "created",
      updatedAt: "updated",
      kind: "note",
      x: 0,
      y: 1,
      body: "note",
    };
    expect(isReferenceLibrarySnapshot({ ...webValid, pdfMarkups: [noteMarkup] })).toBe(true);
    expect(isReferenceLibrarySnapshot({ ...webValid, pdfMarkups: [noteMarkup, { ...noteMarkup, page: 0 }] })).toBe(false);
    for (const [field, invalid] of Object.entries({
      id: 1,
      referenceId: 1,
      requestedUrl: 1,
      finalUrl: 1,
      accessedAt: 1,
      status: "200",
      contentType: 1,
      rawObjectKey: 1,
      readableObjectKey: 1,
      rawSize: "200",
      readableSize: "100",
      contentHash: 1,
      title: 1,
      authors: [1],
      publisher: 1,
      publishedAt: 1,
      complete: "yes",
      diagnostics: [1],
      redirectChain: [1],
      etag: 1,
      lastModified: 1,
    })) {
      expect(
        isReferenceLibrarySnapshot({ ...webValid, webSnapshots: [{ ...capturedWebSnapshot, referenceId: record.id, [field]: invalid }] }),
        field,
      ).toBe(false);
    }
    for (const [field, invalid] of [
      ["authors", ["Captured Author", 1]],
      ["diagnostics", ["Partial capture", 1]],
      ["redirectChain", ["https://example.com/article", 1]],
    ] as const) {
      expect(
        isReferenceLibrarySnapshot({ ...webValid, webSnapshots: [{ ...capturedWebSnapshot, referenceId: record.id, [field]: invalid }] }),
        field,
      ).toBe(false);
    }
    for (const [field, invalid] of Object.entries({ referenceId: 1, canonicalUrl: 1, createdAt: 1, updatedAt: 1 })) {
      expect(isReferenceLibrarySnapshot({ ...webValid, webSources: [{ ...webValid.webSources[0], [field]: invalid }] }), field).toBe(false);
    }
  });

  it("normalizes public web identities and rejects credentialed or private destinations", () => {
    expect(normalizeWebSourceUrl(" HTTPS://Example.com:443/article#section ")).toBe("https://example.com/article");
    expect(normalizeWebSourceUrl("http://8.8.8.8/source?version=1#old")).toBe("http://8.8.8.8/source?version=1");
    expect(normalizeWebSourceUrl("https://[2606:4700:4700::1111]/source")).toBe("https://[2606:4700:4700::1111]/source");
    expect(normalizeWebSourceUrl("http://example.com:80/source")).toBe("http://example.com/source");
    expect(normalizeWebSourceUrl("https://fcdomain.com/source")).toBe("https://fcdomain.com/source");
    for (const [url, message] of [
      ["file:///tmp/source", "Web source URL must use HTTP or HTTPS"],
      ["https://user:secret@example.com/", "Web source URL must not contain credentials"],
      ["https://user@example.com/", "Web source URL must not contain credentials"],
      ["https://:secret@example.com/", "Web source URL must not contain credentials"],
      ["https://example.com:8443/source", "Web source URL must use a standard HTTP port"],
      ["http://example.com:443/source", "Web source URL must use a standard HTTP port"],
      ["https://example.com:80/source", "Web source URL must use a standard HTTP port"],
      ["http://localhost/source", "Web source URL must resolve to a public host"],
    ] as const) {
      expect(() => normalizeWebSourceUrl(url), url).toThrow(message);
    }
    for (const url of [
      "http://localhost/source",
      "http://127.0.0.1/source",
      "http://10.0.0.1/source",
      "http://192.168.1.1/source",
      "http://0.0.0.0/source",
      "http://100.64.0.1/source",
      "http://169.254.2.1/source",
      "http://172.31.255.255/source",
      "http://192.0.0.1/source",
      "http://198.18.0.1/source",
      "http://224.0.0.1/source",
      "http://[::1]/source",
      "http://[fc00::1]/source",
      "http://[fe80::1]/source",
      "http://[fd00::1]/source",
      "http://[::]/source",
      "http://[::ffff:192.0.2.1]/source",
      "http://service.internal/source",
      "http://printer.local/source",
      "http://service.localhost/source",
      "http://router.lan/source",
    ]) {
      expect(() => normalizeWebSourceUrl(url), url).toThrow();
    }
    for (const url of [
      "http://100.63.255.255/source",
      "http://100.128.0.0/source",
      "http://169.253.255.255/source",
      "http://169.255.0.0/source",
      "http://172.15.255.255/source",
      "http://172.32.0.0/source",
      "http://191.255.255.255/source",
      "http://198.17.255.255/source",
      "http://198.20.0.0/source",
      "http://223.255.255.255/source",
    ]) {
      expect(normalizeWebSourceUrl(url), url).toBe(url);
    }
  });

  it("extracts citation metadata and readable text without retaining executable markup", () => {
    const extraction = extractWebDocument(
      `<!doctype html><html><head>
        <title>Fallback title</title>
        <meta property="og:title" content="Captured &amp; inspectable">
        <meta name="author" content="Ada Writer">
        <meta property="og:site_name" content="Research Notes">
        <meta property="article:published_time" content="2026-07-12">
        <style>secret style</style><script>secret script</script>
      </head><body><main><h1>Captured evidence</h1><p>One idea.</p><p>Another idea.</p></main></body></html>`,
      "text/html; charset=utf-8",
    );
    expect(extraction).toMatchObject({
      title: "Captured & inspectable",
      authors: ["Ada Writer"],
      publisher: "Research Notes",
      publishedAt: "2026-07-12",
    });
    expect(extraction.readableText).toContain("Captured evidence\nOne idea.\nAnother idea.");
    expect(extraction.readableText).not.toMatch(/secret|<script/iu);
    expect(
      extractWebDocument(
        `<html><head><title>Fallback <em>title</em></title><meta name=author content=Writer><meta name="author" content="Writer"><meta name="application-name" content="Publisher"><meta name="date" content="2024"></head><body>Before<br>After<hr><section>Section</section>${" enough".repeat(20)}</body></html>`,
        " TEXT/HTML ; charset=utf-8 ",
      ),
    ).toMatchObject({
      title: "Fallback title",
      authors: ["Writer"],
      publisher: "Publisher",
      publishedAt: "2024",
      diagnostics: [],
    });
    expect(extractWebDocument("  first\r\n\r\n\tsecond  \rthird ", "text/plain; charset=utf-8")).toEqual({
      title: "",
      authors: [],
      publisher: "",
      publishedAt: "",
      readableText: "first\n\nsecond\nthird",
      diagnostics: ["Plain-text sources do not expose structured citation metadata."],
    });
    expect(extractWebDocument("binary", "application/pdf")).toEqual({
      title: "",
      authors: [],
      publisher: "",
      publishedAt: "",
      readableText: "",
      diagnostics: ["application/pdf cannot be extracted as readable web text."],
    });
    expect(extractWebDocument("binary", "")).toMatchObject({
      readableText: "",
      diagnostics: ["Unknown media type cannot be extracted as readable web text."],
    });
    const sparse = extractWebDocument(
      `<html><head><title>Fallback &#x54;itle</title><meta content='Second Author' name='citation_author'><meta name='dc.date' content='2025'></head><body>&#99999999; short</body></html>`,
      "application/xhtml+xml",
    );
    expect(sparse).toMatchObject({ title: "Fallback Title", authors: ["Second Author"], publishedAt: "2025" });
    expect(sparse.readableText).toBe("Fallback Title &#99999999; short");
    expect(sparse.diagnostics).toEqual(["Very little readable text was extracted; the page may require scripts or authentication."]);
    expect(extractWebDocument("<html><body>short</body></html>", "text/html").diagnostics).toEqual([
      "No page title was detected; enter one before saving the source.",
      "Very little readable text was extracted; the page may require scripts or authentication.",
    ]);
    expect(extractWebDocument("<html><head><title>&#0; &bogus;</title></head><body>text</body></html>", "text/html").title).toBe(
      "\u0000 &bogus;",
    );
    const stripped = extractWebDocument(
      `<html><head><title>Entities &quot;&apos;&lt;&gt;&amp;&nbsp;</title></head><body>
      visible<br class="break"/>line<hr /><div>block</div>
      <noscript>noscript secret</noscript><svg><text>svg secret</text></svg><template>template secret</template>
      </body></html>`,
      "text/html",
    );
    expect(stripped.title).toBe(`Entities "'<>&`);
    expect(stripped.readableText).toContain("visible\nline\nblock");
    expect(stripped.readableText).not.toMatch(/secret/iu);
    const exactMarkup = extractWebDocument(
      `<title>Exact</title><body>before<script data-id="x">hidden</script><br>middle<hr/>after<div>block</div>${"x".repeat(80)}</body>`,
      "text/html",
    );
    expect(exactMarkup.readableText).toBe(`Exact before\nmiddle\nafter block\n${"x".repeat(80)}`);

    expect(extractWebDocument(`<body>${"x".repeat(80)}</body>`, "text/html").diagnostics).toEqual([
      "No page title was detected; enter one before saving the source.",
    ]);
    expect(extractWebDocument(`<body>${"x".repeat(79)}</body>`, "text/html").diagnostics).toEqual([
      "No page title was detected; enter one before saving the source.",
      "Very little readable text was extracted; the page may require scripts or authentication.",
    ]);
  });

  it("compares readable captures as neutral line additions and removals", () => {
    expect(compareWebSnapshotText("same\ntext", "same\ntext")).toMatchObject({ identical: true, addedLines: 0, removedLines: 0 });
    expect(compareWebSnapshotText("Heading\nOld claim\nShared", "Heading\nNew claim\nShared\nAppendix")).toMatchObject({
      identical: false,
      addedLines: 2,
      removedLines: 1,
      hunks: [
        { beforeLine: 2, afterLine: 2, removed: ["Old claim"], added: ["New claim"] },
        { beforeLine: 4, afterLine: 4, removed: [], added: ["Appendix"] },
      ],
    });
    expect(compareWebSnapshotText("A\nB", "X\nA\nB")).toMatchObject({
      addedLines: 1,
      removedLines: 0,
      hunks: [{ beforeLine: 1, afterLine: 1, removed: [], added: ["X"], truncated: false }],
    });
    expect(compareWebSnapshotText("A\nB\nC", "A\nC")).toMatchObject({
      addedLines: 0,
      removedLines: 1,
      hunks: [{ beforeLine: 2, afterLine: 2, removed: ["B"], added: [], truncated: false }],
    });
    const exactlyTwentyFour = Array.from({ length: 24 }, (_, index) => `before-${index}`);
    expect(compareWebSnapshotText(exactlyTwentyFour.join("\n"), "replacement")).toMatchObject({
      addedLines: 1,
      removedLines: 24,
      hunks: [{ removed: exactlyTwentyFour, added: ["replacement"], truncated: false }],
    });
    expect(compareWebSnapshotText("replacement", exactlyTwentyFour.join("\n"))).toMatchObject({
      addedLines: 24,
      removedLines: 1,
      hunks: [{ removed: ["replacement"], added: exactlyTwentyFour, truncated: false }],
    });
    const manyBefore = Array.from({ length: 30 }, (_, index) => `before-${index}`).join("\n");
    const manyAfter = Array.from({ length: 30 }, (_, index) => `after-${index}`).join("\n");
    expect(compareWebSnapshotText(manyBefore, manyAfter)).toMatchObject({
      beforeLines: 30,
      afterLines: 30,
      addedLines: 30,
      removedLines: 30,
      hunks: [{ beforeLine: 1, afterLine: 1, truncated: true }],
    });
    const segmentedBefore = Array.from({ length: 102 }, (_, index) => [`old-${index}`, `shared-${index}`])
      .flat()
      .join("\n");
    const segmentedAfter = Array.from({ length: 102 }, (_, index) => [`new-${index}`, `shared-${index}`])
      .flat()
      .join("\n");
    const capped = compareWebSnapshotText(segmentedBefore, segmentedAfter);
    expect(capped).toMatchObject({ identical: false, beforeLines: 204, afterLines: 204, addedLines: 105, removedLines: 105 });
    expect(capped.hunks).toHaveLength(101);
    expect(capped.hunks.at(-1)).toMatchObject({ beforeLine: 200, afterLine: 200, truncated: true });
  });

  it("merges overlapping private highlight geometry and quotation text", () => {
    const existing = [
      { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
      { x: 0.1, y: 0.3, width: 0.2, height: 0.04 },
    ];
    const incoming = [
      { x: 0.25, y: 0.2, width: 0.25, height: 0.04 },
      { x: 0.6, y: 0.4, width: 0.2, height: 0.04 },
    ];

    expect(libraryPdfRectsOverlap(existing, incoming)).toBe(true);
    expect(libraryPdfRectsOverlap(existing, [{ x: 0.5, y: 0.8, width: 0.1, height: 0.02 }])).toBe(false);
    expect(mergeLibraryPdfRects(existing, incoming)).toEqual([{ x: 0.1, y: 0.2, width: 0.4, height: 0.04 }, existing[1], incoming[1]]);
    expect(mergeLibraryHighlightQuote("The visible evidence", "evidence shortens review")).toBe("The visible evidence shortens review");
    expect(mergeLibraryHighlightQuote("review time", "Visible evidence shortens review time")).toBe(
      "Visible evidence shortens review time",
    );
    expect(mergeLibraryHighlightQuote("First passage", "Second passage")).toBe("First passage Second passage");
  });

  it("merges vertical and transitive rectangle unions, keeps edge contact separate, and sorts by position", () => {
    const top = { x: 0.25, y: 0.125, width: 0.125, height: 0.25 };
    const bottom = { x: 0.25, y: 0.25, width: 0.125, height: 0.375 };
    const bridge = { x: 0.3125, y: 0.1875, width: 0.25, height: 0.125 };
    const right = { x: 0.5, y: 0.1875, width: 0.25, height: 0.125 };
    const touching = { x: 0.75, y: 0.1875, width: 0.125, height: 0.125 };
    const first = { x: 0.875, y: 0, width: 0.125, height: 0.125 };

    expect(libraryPdfRectsOverlap([top], [bottom])).toBe(true);
    expect(libraryPdfRectsOverlap([right], [touching])).toBe(false);
    expect(mergeLibraryPdfRects([right, first, top], [bottom, bridge, touching])).toEqual([
      first,
      { x: 0.25, y: 0.125, width: 0.5, height: 0.5 },
      touching,
    ]);
    expect(mergeLibraryPdfRects([], [first])).toEqual([first]);
    expect(mergeLibraryPdfRects([first], [])).toEqual([first]);
  });

  it("trims and merges quotation containment and overlaps in both directions", () => {
    expect(mergeLibraryHighlightQuote("  complete quote  ", "quote")).toBe("complete quote");
    expect(mergeLibraryHighlightQuote("quote", "  complete quote  ")).toBe("complete quote");
    expect(mergeLibraryHighlightQuote("alpha beta", "beta gamma")).toBe("alpha beta gamma");
    expect(mergeLibraryHighlightQuote("beta gamma", "alpha beta")).toBe("alpha beta gamma");
    expect(mergeLibraryHighlightQuote("abc", "bca")).toBe("abca");
    expect(mergeLibraryHighlightQuote("", "incoming")).toBe("incoming");
    expect(mergeLibraryHighlightQuote("existing", "")).toBe("existing");
  });
});
