import { describe, expect, it } from "vitest";
import type { PdfReferenceAnalysisCandidate } from "./artifact-analysis";
import type { BibliographicRecord } from "./metadata";
import { isReviewPdfReferenceCandidateInput, isReviewPdfReferenceCandidatesInput, suggestPdfReferenceMatch } from "./pdf-reference-review";

const candidate: PdfReferenceAnalysisCandidate = {
  id: "doi:10.1000/target",
  page: 8,
  raw: "Doe, Jane. 2025. A useful paper.",
  title: "A useful paper",
  authors: ["Doe, Jane"],
  year: "2025",
  doi: "10.1000/target",
  url: "https://doi.org/10.1000/target",
  confidence: 0.98,
};

describe("PDF reference review", () => {
  it("validates bounded accept and reject decisions", () => {
    expect(isReviewPdfReferenceCandidateInput({ fingerprint: "etag:pdf", candidateId: candidate.id, decision: "accepted" })).toBe(true);
    expect(
      isReviewPdfReferenceCandidateInput({
        fingerprint: "etag:pdf",
        candidateId: candidate.id,
        decision: "accepted",
        referenceId: "reference-id",
      }),
    ).toBe(true);
    expect(isReviewPdfReferenceCandidateInput({ fingerprint: "etag:pdf", candidateId: candidate.id, decision: "rejected" })).toBe(true);
    expect(
      isReviewPdfReferenceCandidateInput({
        fingerprint: "etag:pdf",
        candidateId: candidate.id,
        decision: "rejected",
        referenceId: "not-allowed",
      }),
    ).toBe(false);
    expect(isReviewPdfReferenceCandidateInput({ fingerprint: "", candidateId: candidate.id, decision: "accepted" })).toBe(false);
  });

  it("validates a bounded unique batch of pending candidates", () => {
    expect(
      isReviewPdfReferenceCandidatesInput({
        fingerprint: "etag:pdf",
        candidates: [{ candidateId: candidate.id }, { candidateId: "entry:two", referenceId: "reference-id" }],
      }),
    ).toBe(true);
    expect(isReviewPdfReferenceCandidatesInput({ fingerprint: "etag:pdf", candidates: [] })).toBe(false);
    expect(
      isReviewPdfReferenceCandidatesInput({
        fingerprint: "etag:pdf",
        candidates: [{ candidateId: candidate.id }, { candidateId: candidate.id }],
      }),
    ).toBe(false);
  });

  it("prefers exact DOI identity and only suggests unique bibliographic identity", () => {
    const doiMatch = reference({ id: "doi-match", doi: "10.1000/TARGET", title: "Different title" });
    const titleMatch = reference({ id: "title-match", doi: "", title: "A useful paper" });
    expect(suggestPdfReferenceMatch(candidate, [titleMatch, doiMatch])).toEqual({ reference: doiMatch, kind: "doi" });

    expect(suggestPdfReferenceMatch({ ...candidate, doi: "" }, [titleMatch])).toEqual({ reference: titleMatch, kind: "bibliographic" });
    expect(suggestPdfReferenceMatch({ ...candidate, doi: "" }, [titleMatch, reference({ id: "duplicate", doi: "" })])).toBeNull();
    expect(suggestPdfReferenceMatch({ ...candidate, doi: "", year: "" }, [titleMatch])).toBeNull();
  });
});

function reference(overrides: Partial<BibliographicRecord>): BibliographicRecord {
  return {
    id: "reference-id",
    referenceKey: "doe2025",
    type: "article",
    title: "A useful paper",
    authors: ["Jane Doe"],
    year: "2025",
    venue: "Journal",
    doi: "10.1000/target",
    url: "",
    abstract: "",
    provenance: {},
    archivedAt: null,
    deletedAt: null,
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    ...overrides,
  };
}
