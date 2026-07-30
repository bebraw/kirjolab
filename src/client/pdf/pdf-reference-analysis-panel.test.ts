import { describe, expect, it } from "vitest";
import type {
  ArtifactAnalysis,
  BibliographicRecord,
  PdfReferenceAnalysisResult,
  PdfReferenceReviewCandidate,
  PdfReferenceReviewDecision,
  PdfReferenceReviewQueue,
  ReviewPdfReferenceCandidateBatchItem,
} from "../../domain/reference-library";
import { PdfReferenceAnalysisPanel, pdfReferenceReviewOutcomeEvent, type PdfReferenceReviewOutcome } from "./pdf-reference-analysis-panel";

const result: PdfReferenceAnalysisResult = {
  candidates: [
    {
      authors: ["Doe, Jane"],
      confidence: 1,
      doi: "10.5555/reference",
      id: "doi:10.5555/reference",
      page: 8,
      raw: "Doe, Jane. 2025. Useful reference. https://doi.org/10.5555/reference",
      title: "Useful reference",
      url: "https://doi.org/10.5555/reference",
      year: "2025",
    },
  ],
  mentions: [
    {
      candidateId: "doi:10.5555/reference",
      confidence: 0.95,
      id: "pdf-mention:3:known",
      page: 3,
      raw: "[1]",
      style: "numeric",
    },
  ],
  pagesScanned: 8,
  pagesTotal: 8,
  referencesStartPage: 8,
  truncated: false,
};

const readyAnalysis: ArtifactAnalysis = {
  artifactId: "artifact/1",
  completedAt: "2026-07-29T00:00:02.000Z",
  error: "",
  fingerprint: "r2-etag:artifact-1",
  kind: "pdf-references",
  requestedAt: "2026-07-29T00:00:00.000Z",
  result,
  startedAt: "2026-07-29T00:00:01.000Z",
  status: "ready",
};

const reviewCandidate: PdfReferenceReviewCandidate = {
  ...result.candidates[0]!,
  match: null,
  matchKind: null,
  review: null,
};

const reviewQueue: PdfReferenceReviewQueue = {
  artifactId: "artifact/1",
  candidates: [reviewCandidate],
  citingReferenceId: "reference-source",
  fingerprint: readyAnalysis.fingerprint,
};

class TestPdfReferenceAnalysisPanel extends PdfReferenceAnalysisPanel {
  readonly loads: { artifactId: string; retry: boolean }[] = [];
  readonly reviewLoads: string[] = [];
  readonly submissions: {
    artifactId: string;
    input: {
      readonly fingerprint: string;
      readonly candidateId: string;
      readonly decision: PdfReferenceReviewDecision;
      readonly referenceId?: string;
    };
  }[] = [];
  readonly batchSubmissions: {
    artifactId: string;
    candidates: readonly ReviewPdfReferenceCandidateBatchItem[];
    fingerprint: string;
  }[] = [];
  analysis: ArtifactAnalysis | Error = readyAnalysis;
  batchFailure: Error | null = null;
  batchWait: Promise<void> | null = null;
  queue: PdfReferenceReviewQueue | Error = reviewQueue;

  renderForTest() {
    return this.render();
  }

  retryForTest(): void {
    this.retry();
  }

  defaultLoadForTest(artifactId: string, retry = false): Promise<ArtifactAnalysis> {
    return super.load(artifactId, retry);
  }

  defaultLoadReviewQueueForTest(artifactId: string): Promise<PdfReferenceReviewQueue> {
    return super.loadReviewQueue(artifactId);
  }

  defaultSubmitReviewForTest(
    artifactId: string,
    input: {
      readonly fingerprint: string;
      readonly candidateId: string;
      readonly decision: PdfReferenceReviewDecision;
      readonly referenceId?: string;
    },
  ): Promise<void> {
    return super.submitReview(artifactId, input);
  }

  defaultSubmitReviewBatchForTest(
    artifactId: string,
    fingerprint: string,
    candidates: readonly ReviewPdfReferenceCandidateBatchItem[],
  ): Promise<void> {
    return super.submitReviewBatch(artifactId, fingerprint, candidates);
  }

  reviewForTest(candidate: PdfReferenceReviewCandidate, decision: PdfReferenceReviewDecision, referenceId?: string): Promise<void> {
    return this.reviewCandidate(candidate, decision, referenceId);
  }

  addAllForTest(): Promise<void> {
    return this.addAllPending();
  }

  protected override async load(artifactId: string, retry = false): Promise<ArtifactAnalysis> {
    this.loads.push({ artifactId, retry });
    if (this.analysis instanceof Error) throw this.analysis;
    return this.analysis;
  }

  protected override async loadReviewQueue(artifactId: string): Promise<PdfReferenceReviewQueue> {
    this.reviewLoads.push(artifactId);
    if (this.queue instanceof Error) throw this.queue;
    return this.queue;
  }

  protected override async submitReview(
    artifactId: string,
    input: {
      readonly fingerprint: string;
      readonly candidateId: string;
      readonly decision: PdfReferenceReviewDecision;
      readonly referenceId?: string;
    },
  ): Promise<void> {
    this.submissions.push({ artifactId, input });
  }

  protected override async submitReviewBatch(
    artifactId: string,
    fingerprint: string,
    candidates: readonly ReviewPdfReferenceCandidateBatchItem[],
  ): Promise<void> {
    this.batchSubmissions.push({ artifactId, candidates, fingerprint });
    if (this.batchWait) await this.batchWait;
    if (this.batchFailure) throw this.batchFailure;
  }
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function templateText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(templateText).join(" ");
  if (!value || typeof value !== "object") return "";
  const template = value as { readonly strings?: readonly string[]; readonly values?: readonly unknown[] };
  return [...(template.strings ?? []), ...(Array.isArray(template.values) ? template.values.map(templateText) : [])].join(" ");
}

function reference(overrides: Partial<BibliographicRecord> = {}): BibliographicRecord {
  return {
    abstract: "",
    archivedAt: null,
    authors: ["Jane Doe"],
    createdAt: "2026-07-29T10:00:00.000Z",
    deletedAt: null,
    doi: "10.5555/reference",
    id: "reference-match",
    provenance: {},
    referenceKey: "doe2025",
    title: "Useful reference",
    type: "article",
    updatedAt: "2026-07-29T10:00:00.000Z",
    url: "",
    venue: "Journal",
    year: "2025",
    ...overrides,
  };
}

describe("PDF reference analysis panel", () => {
  it("loads automatic reference results and resets between artifacts", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    panel.setArtifact("artifact/1");
    await settle();
    expect(panel.loads).toEqual([{ artifactId: "artifact/1", retry: false }]);
    expect(panel.reviewLoads).toEqual(["artifact/1"]);
    expect(templateText(panel.renderForTest())).toContain("Used");
    expect(templateText(panel.renderForTest())).toContain("numeric citation");

    panel.analysis = { ...readyAnalysis, artifactId: "artifact/2", result: { ...result, candidates: [] } };
    panel.queue = { ...reviewQueue, artifactId: "artifact/2", candidates: [] };
    panel.setArtifact("artifact/2");
    await settle();
    expect(panel.loads.at(-1)).toEqual({ artifactId: "artifact/2", retry: false });
    panel.reset();
    expect(panel.renderForTest()).toBeDefined();
  });

  it("persists a fingerprint-qualified review and announces accepted references", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    const outcomes: PdfReferenceReviewOutcome[] = [];
    panel.addEventListener(pdfReferenceReviewOutcomeEvent, (event) =>
      outcomes.push((event as CustomEvent<PdfReferenceReviewOutcome>).detail),
    );
    panel.setArtifact("artifact/1");
    await settle();

    await panel.reviewForTest(reviewCandidate, "accepted");

    expect(panel.submissions).toEqual([
      {
        artifactId: "artifact/1",
        input: {
          candidateId: reviewCandidate.id,
          decision: "accepted",
          fingerprint: readyAnalysis.fingerprint,
        },
      },
    ]);
    expect(panel.reviewLoads).toEqual(["artifact/1", "artifact/1"]);
    expect(outcomes).toEqual([{ action: "library-refresh", message: "Parsed reference added to the Library." }]);
  });

  it("adds every pending extracted reference in one fingerprint-qualified batch", async () => {
    const secondCandidate = {
      ...reviewCandidate,
      id: "entry:second",
      match: reference(),
      matchKind: "doi" as const,
    };
    const skippedCandidate = {
      ...reviewCandidate,
      id: "entry:skipped",
      review: {
        assertionId: null,
        candidateId: "entry:skipped",
        decision: "rejected" as const,
        referenceId: null,
        reviewedAt: "2026-07-29T00:00:00.000Z",
        reviewedBy: "owner@example.test",
      },
    };
    const panel = new TestPdfReferenceAnalysisPanel();
    const outcomes: PdfReferenceReviewOutcome[] = [];
    const events: CustomEvent<PdfReferenceReviewOutcome>[] = [];
    panel.queue = { ...reviewQueue, candidates: [reviewCandidate, secondCandidate, skippedCandidate] };
    panel.addEventListener(pdfReferenceReviewOutcomeEvent, (event) => {
      const outcomeEvent = event as CustomEvent<PdfReferenceReviewOutcome>;
      events.push(outcomeEvent);
      outcomes.push(outcomeEvent.detail);
    });
    panel.setArtifact("artifact/1");
    await settle();

    expect(templateText(panel.renderForTest())).toContain("Add all 2 to Library");
    await panel.addAllForTest();

    expect(panel.batchSubmissions).toEqual([
      {
        artifactId: "artifact/1",
        candidates: [{ candidateId: reviewCandidate.id }, { candidateId: secondCandidate.id, referenceId: "reference-match" }],
        fingerprint: readyAnalysis.fingerprint,
      },
    ]);
    expect(outcomes).toEqual([{ action: "library-refresh", message: "2 parsed references added to the Library." }]);
    expect(events[0]).toMatchObject({ bubbles: true, composed: true });
  });

  it("prevents duplicate bulk submissions while a request is active", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    let releaseBatch = (): void => undefined;
    panel.batchWait = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    panel.setArtifact("artifact/1");
    await settle();

    const firstSubmission = panel.addAllForTest();
    const duplicateSubmission = panel.addAllForTest();
    await settle();

    expect(panel.batchSubmissions).toHaveLength(1);
    expect(templateText(panel.renderForTest())).toContain("Adding all…");
    releaseBatch();
    await Promise.all([firstSubmission, duplicateSubmission]);
    expect(templateText(panel.renderForTest())).toContain("Add all 1 to Library");
  });

  it("keeps failed bulk additions retryable", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    panel.batchFailure = new Error("Library unavailable");
    panel.setArtifact("artifact/1");
    await settle();

    await panel.addAllForTest();
    expect(templateText(panel.renderForTest())).toContain("Library unavailable");

    panel.batchFailure = null;
    await panel.addAllForTest();
    expect(panel.batchSubmissions).toHaveLength(2);
  });

  it("hides bulk controls without pending review candidates", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    expect(templateText(panel.renderForTest())).not.toContain("Add all");
    panel.queue = {
      ...reviewQueue,
      candidates: [
        {
          ...reviewCandidate,
          review: {
            assertionId: "assertion-1",
            candidateId: reviewCandidate.id,
            decision: "accepted",
            referenceId: "reference-match",
            reviewedAt: "2026-07-29T00:00:00.000Z",
            reviewedBy: "owner@example.test",
          },
        },
      ],
    };
    panel.setArtifact("artifact/1");
    await settle();
    expect(templateText(panel.renderForTest())).not.toContain("Add all");
  });

  it("treats analysis transitions and unidentified PDFs as review prerequisites", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    panel.queue = new Error("PDF reference analysis is not ready");
    panel.setArtifact("artifact/1");
    await settle();
    expect((panel as unknown as { reviewStatus: string }).reviewStatus).toBe("Reference review will appear when analysis finishes.");
    panel.reset();

    panel.queue = new Error("Identify the PDF before reviewing its references");
    panel.setArtifact("artifact/1");
    await settle();
    expect((panel as unknown as { reviewStatus: string }).reviewStatus).toBe(
      "Identify this PDF before adding its parsed references to the Library.",
    );
    panel.reset();
  });

  it("keeps failures retryable", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    panel.analysis = { ...readyAnalysis, status: "failed", result: null, error: "Browser unavailable" };
    panel.setArtifact("artifact/1");
    await settle();
    expect((panel as unknown as { status: string }).status).toBe(
      "Could not analyze this PDF. Retry when the local analysis service is available.",
    );
    panel.analysis = readyAnalysis;
    panel.retryForTest();
    await settle();
    expect(panel.loads).toEqual([
      { artifactId: "artifact/1", retry: false },
      { artifactId: "artifact/1", retry: true },
    ]);
  });

  it("lets a researcher rerun completed reference analysis", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    panel.setArtifact("artifact/1");
    await settle();
    expect(templateText(panel.renderForTest())).toContain("Run analysis again");

    panel.analysis = { ...readyAnalysis, status: "queued", result: null };
    panel.retryForTest();
    await settle();
    expect(panel.loads).toEqual([
      { artifactId: "artifact/1", retry: false },
      { artifactId: "artifact/1", retry: true },
    ]);
  });

  it("validates the default API response", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    const previousFetch = globalThis.fetch;
    const calls: { method: string; url: string }[] = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(input) });
      return Response.json(readyAnalysis);
    };
    try {
      await expect(panel.defaultLoadForTest("artifact/1")).resolves.toEqual(readyAnalysis);
      await expect(panel.defaultLoadForTest("artifact/1", true)).resolves.toEqual(readyAnalysis);
      expect(calls).toEqual([
        { method: "GET", url: "/api/library/pdfs/artifact%2F1/analyses/pdf-references" },
        { method: "POST", url: "/api/library/pdfs/artifact%2F1/analyses/pdf-references" },
      ]);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("validates the review queue and posts review decisions", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    const previousFetch = globalThis.fetch;
    const calls: { body: string | null; method: string; url: string }[] = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ body: typeof init?.body === "string" ? init.body : null, method: init?.method ?? "GET", url: String(input) });
      return init?.method === "POST" ? Response.json({}) : Response.json(reviewQueue);
    };
    try {
      await expect(panel.defaultLoadReviewQueueForTest("artifact/1")).resolves.toEqual(reviewQueue);
      await expect(
        panel.defaultSubmitReviewForTest("artifact/1", {
          candidateId: reviewCandidate.id,
          decision: "accepted",
          fingerprint: readyAnalysis.fingerprint,
        }),
      ).resolves.toBeUndefined();
      await expect(
        panel.defaultSubmitReviewBatchForTest("artifact/1", readyAnalysis.fingerprint, [{ candidateId: reviewCandidate.id }]),
      ).resolves.toBeUndefined();
      expect(calls).toEqual([
        { body: null, method: "GET", url: "/api/library/pdfs/artifact%2F1/reference-review" },
        {
          body: JSON.stringify({
            candidateId: reviewCandidate.id,
            decision: "accepted",
            fingerprint: readyAnalysis.fingerprint,
          }),
          method: "POST",
          url: "/api/library/pdfs/artifact%2F1/reference-review",
        },
        {
          body: JSON.stringify({
            fingerprint: readyAnalysis.fingerprint,
            candidates: [{ candidateId: reviewCandidate.id }],
          }),
          method: "POST",
          url: "/api/library/pdfs/artifact%2F1/reference-review",
        },
      ]);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
