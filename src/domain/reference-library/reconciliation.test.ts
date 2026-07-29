import { describe, expect, it } from "vitest";
import type { BibliographicRecord } from "./metadata";
import {
  isReferenceMergeInput,
  isReferenceMergeResult,
  isReferenceReconciliationReport,
  referenceReconciliationReason,
} from "./reconciliation";

const reference: BibliographicRecord = {
  id: "left",
  referenceKey: "doe2024",
  type: "article",
  title: "Étude reproducible",
  authors: ["Doe, Jane"],
  year: "2024",
  venue: "",
  doi: "",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("reference reconciliation", () => {
  it("requires exact DOI or normalized title, year, and first author evidence", () => {
    expect(referenceReconciliationReason(reference, { ...reference, title: "Etude reproducible!" })).toBe("bibliographic");
    expect(referenceReconciliationReason({ ...reference, doi: "10.1000/X" }, { ...reference, doi: "10.1000/x" })).toBe("doi");
    expect(referenceReconciliationReason({ ...reference, doi: "10.1000/x" }, { ...reference, doi: "10.1000/y" })).toBeNull();
    expect(referenceReconciliationReason(reference, { ...reference, year: "2025" })).toBeNull();
    expect(referenceReconciliationReason({ ...reference, authors: [] }, { ...reference, authors: [] })).toBeNull();
  });

  it("validates merge commands and API representations", () => {
    const input = {
      canonicalReferenceId: "left",
      duplicateReferenceId: "right",
      expectedCanonicalUpdatedAt: reference.updatedAt,
      expectedDuplicateUpdatedAt: reference.updatedAt,
    };
    expect(isReferenceMergeInput(input)).toBe(true);
    expect(isReferenceMergeInput({ ...input, duplicateReferenceId: "left" })).toBe(false);
    expect(
      isReferenceReconciliationReport({
        candidates: [
          { left: reference, right: { ...reference, id: "right" }, reason: "bibliographic", leftBlockers: [], rightBlockers: [] },
        ],
        truncated: false,
      }),
    ).toBe(true);
    expect(isReferenceReconciliationReport({ candidates: [{ left: reference }], truncated: false })).toBe(false);
    expect(
      isReferenceMergeResult({
        canonicalReference: reference,
        mergedReferenceId: "right",
        moved: { artifacts: 1, notes: 0, highlights: 0, pdfMarkups: 0, citationAssertions: 1 },
      }),
    ).toBe(true);
    expect(isReferenceMergeResult({ canonicalReference: reference, mergedReferenceId: "right", moved: { artifacts: -1 } })).toBe(false);
  });
});
