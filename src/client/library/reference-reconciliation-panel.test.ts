import { afterEach, describe, expect, it, vi } from "vitest";
import type { BibliographicRecord, ReferenceReconciliationCandidate } from "../../domain/reference-library";
import {
  referenceReconciliationOutcomeEvent,
  ReferenceReconciliationPanel,
  type ReferenceReconciliationOutcome,
} from "./reference-reconciliation-panel";

const left = reference("left", "doe2024", "2026-01-01T00:00:00.000Z");
const right = reference("right", "doe2024b", "2026-01-02T00:00:00.000Z");
const candidate: ReferenceReconciliationCandidate = {
  left,
  right,
  reason: "bibliographic",
  leftBlockers: [],
  rightBlockers: [],
};

class TestReferenceReconciliationPanel extends ReferenceReconciliationPanel {
  renderForTest() {
    return this.render();
  }

  mergeForTest(canonical: BibliographicRecord, duplicate: BibliographicRecord): Promise<void> {
    return this.merge(candidate, canonical, duplicate);
  }
}

describe("reference reconciliation panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads candidates and submits an explicit canonical merge", async () => {
    const panel = new TestReferenceReconciliationPanel();
    const scrollIntoView = vi.fn();
    Object.defineProperty(panel, "scrollIntoView", { value: scrollIntoView });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ candidates: [candidate], truncated: false }))
      .mockResolvedValueOnce(
        json({
          canonicalReference: left,
          mergedReferenceId: right.id,
          moved: { artifacts: 1, notes: 0, highlights: 0, pdfMarkups: 0, citationAssertions: 1 },
        }),
      )
      .mockResolvedValueOnce(json({ candidates: [], truncated: false }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { confirm: vi.fn(() => true) });
    const outcomes: ReferenceReconciliationOutcome[] = [];
    panel.addEventListener(referenceReconciliationOutcomeEvent, (event) =>
      outcomes.push((event as CustomEvent<ReferenceReconciliationOutcome>).detail),
    );

    await panel.open();
    await panel.mergeForTest(left, right);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/library/reconciliation/merge", {
      body: JSON.stringify({
        canonicalReferenceId: left.id,
        duplicateReferenceId: right.id,
        expectedCanonicalUpdatedAt: left.updatedAt,
        expectedDuplicateUpdatedAt: right.updatedAt,
      }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(outcomes).toEqual([{ action: "library-refresh", message: "Merged duplicate into doe2024." }]);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("keeps blockers, cancellation, malformed reports, and server failures local", async () => {
    const panel = new TestReferenceReconciliationPanel();
    vi.stubGlobal("window", { confirm: vi.fn(() => false) });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ candidates: [{ ...candidate, rightBlockers: ["1 linked project"] }], truncated: true }))
        .mockResolvedValueOnce(json({ error: "Conflict" }, 409)),
    );
    await panel.open();
    await panel.mergeForTest(left, right);
    await panel.mergeForTest(right, left);
    vi.stubGlobal("window", { confirm: vi.fn(() => true) });
    await panel.mergeForTest(right, left);
    expect(panel.renderForTest()).toBeDefined();
  });
});

function reference(id: string, referenceKey: string, updatedAt: string): BibliographicRecord {
  return {
    id,
    referenceKey,
    type: "article",
    title: "Same study",
    authors: ["Doe, Jane"],
    year: "2024",
    venue: "",
    doi: "",
    url: "",
    abstract: "",
    provenance: {},
    archivedAt: null,
    deletedAt: null,
    createdAt: updatedAt,
    updatedAt,
  };
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
