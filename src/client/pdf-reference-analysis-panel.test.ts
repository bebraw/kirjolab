import { describe, expect, it } from "vitest";
import type {
  ArtifactAnalysis,
  PdfReferenceAnalysisResult,
  PdfReferenceReviewCandidate,
  PdfReferenceReviewDecision,
  PdfReferenceReviewQueue,
} from "../domain/reference-library";
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
  analysis: ArtifactAnalysis | Error = readyAnalysis;
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

  reviewForTest(candidate: PdfReferenceReviewCandidate, decision: PdfReferenceReviewDecision, referenceId?: string): Promise<void> {
    return this.reviewCandidate(candidate, decision, referenceId);
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

describe("PDF reference analysis panel", () => {
  it("loads automatic reference results and resets between artifacts", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    panel.setArtifact("artifact/1");
    await settle();
    expect(panel.loads).toEqual([{ artifactId: "artifact/1", retry: false }]);
    expect(panel.reviewLoads).toEqual(["artifact/1"]);
    expect(panel.renderForTest()).toBeDefined();

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
      ]);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
