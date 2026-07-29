import { describe, expect, it } from "vitest";
import type {
  ArtifactAnalysis,
  LibraryHighlight,
  LibraryHighlightImportCandidate,
  PdfHighlightAnalysisResult,
} from "../domain/reference-library";
import {
  PdfHighlightImportPanel,
  pdfHighlightImportOutcomeEvent,
  type PdfHighlightImportContext,
  type PdfHighlightImportOutcome,
} from "./pdf-highlight-import-panel";

const result: PdfHighlightAnalysisResult = {
  candidates: [
    {
      comment: "Native note",
      confidence: 1,
      id: "native:1",
      page: 1,
      quote: "Native evidence",
      rects: [{ height: 0.1, width: 0.4, x: 0.1, y: 0.2 }],
      source: "annotation",
    },
    {
      comment: "",
      confidence: 0.85,
      id: "flat:2",
      page: 2,
      quote: "Flattened evidence",
      rects: [{ height: 0.1, width: 0.5, x: 0.2, y: 0.3 }],
      source: "flattened",
    },
  ],
  pagesScanned: 2,
  pagesTotal: 3,
  truncated: true,
};

const readyAnalysis: ArtifactAnalysis = {
  artifactId: "artifact/1",
  fingerprint: "r2-etag:artifact-1",
  kind: "pdf-highlights",
  status: "ready",
  result,
  error: "",
  requestedAt: "2026-07-29T00:00:00.000Z",
  startedAt: "2026-07-29T00:00:01.000Z",
  completedAt: "2026-07-29T00:00:02.000Z",
};

class TestPdfHighlightImportPanel extends PdfHighlightImportPanel {
  readonly loads: { artifactId: string; retry: boolean }[] = [];
  readonly saves: { context: PdfHighlightImportContext; candidates: readonly LibraryHighlightImportCandidate[] }[] = [];
  analysis: ArtifactAnalysis | Error = readyAnalysis;
  loadPromise: Promise<ArtifactAnalysis> | null = null;
  saveError: Error | null = null;

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  importForTest(): Promise<void> {
    return this.importSelected(new Event("submit") as SubmitEvent);
  }

  retryForTest(): void {
    this.retry();
  }

  cancelForTest(): void {
    this.cancel();
  }

  showResultForTest(value: PdfHighlightAnalysisResult): void {
    this.showResult(value);
  }

  showErrorForTest(message: string): void {
    this.showError(message);
  }

  selectForTest(id: string, checked: boolean): void {
    this.changeSelection(eventForReview(id, { checked, value: "" }));
  }

  commentForTest(id: string, value: string): void {
    this.changeComment(eventForReview(id, { checked: true, value }));
  }

  defaultLoadForTest(artifactId: string, retry = false): Promise<ArtifactAnalysis> {
    return super.load(artifactId, retry);
  }

  defaultSaveForTest(value: PdfHighlightImportContext, candidates: readonly LibraryHighlightImportCandidate[]): Promise<void> {
    return super.save(value, candidates);
  }

  protected override async load(artifactId: string, retry = false): Promise<ArtifactAnalysis> {
    this.loads.push({ artifactId, retry });
    if (this.loadPromise) return await this.loadPromise;
    if (this.analysis instanceof Error) throw this.analysis;
    return this.analysis;
  }

  protected override async save(context: PdfHighlightImportContext, candidates: readonly LibraryHighlightImportCandidate[]): Promise<void> {
    this.saves.push({ context, candidates });
    if (this.saveError) throw this.saveError;
  }
}

function eventForReview(id: string, input: { checked: boolean; value: string }): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", {
    value: { ...input, closest: () => ({ dataset: { highlightImportId: id } }) },
  });
  return event;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const savedHighlight: LibraryHighlight = {
  artifactId: "artifact/1",
  comment: "",
  createdAt: "2026-07-26T00:00:00.000Z",
  id: "saved-1",
  page: 1,
  quote: "Native evidence",
  rects: result.candidates[0]!.rects,
  referenceId: "reference/1",
  updatedAt: "2026-07-26T00:00:00.000Z",
};

const context: PdfHighlightImportContext = {
  artifactId: "artifact/1",
  highlights: [savedHighlight],
  referenceId: "reference/1",
};

describe("PDF highlight import panel", () => {
  it("loads automatic analysis and renders empty, mixed, error, and completion states", async () => {
    const panel = new TestPdfHighlightImportPanel();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
    panel.setContext(context);
    await settle();
    expect(panel.loads).toEqual([{ artifactId: "artifact/1", retry: false }]);
    expect(panel.renderForTest()).toBeDefined();
    panel.showResultForTest({ candidates: [], pagesScanned: 1, pagesTotal: 1, truncated: false });
    panel.showResultForTest(result);
    panel.showErrorForTest("Could not inspect this PDF.");
    panel.reset("2 highlights imported privately.");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("filters saved geometry, reviews candidates, and emits a typed import outcome", async () => {
    const panel = new TestPdfHighlightImportPanel();
    const outcomes: PdfHighlightImportOutcome[] = [];
    panel.addEventListener(pdfHighlightImportOutcomeEvent, (event) =>
      outcomes.push((event as CustomEvent<PdfHighlightImportOutcome>).detail),
    );
    panel.setContext(context);
    await settle();
    panel.commentForTest("flat:2", "  Reviewed note  ");
    await panel.importForTest();

    expect(panel.saves).toEqual([
      {
        context,
        candidates: [
          {
            comment: "Reviewed note",
            page: 2,
            quote: "Flattened evidence",
            rects: result.candidates[1]!.rects,
          },
        ],
      },
    ]);
    expect(outcomes).toEqual([{ count: 1 }]);
  });

  it("keeps empty selection and import failures retryable", async () => {
    const panel = new TestPdfHighlightImportPanel();
    panel.setContext({ ...context, highlights: [] });
    await settle();
    panel.selectForTest("native:1", false);
    panel.selectForTest("flat:2", false);
    await panel.importForTest();
    expect(panel.saves).toEqual([]);

    panel.selectForTest("native:1", true);
    panel.saveError = new Error("Denied");
    await panel.importForTest();
    panel.saveError = null;
    await panel.importForTest();
    expect(panel.saves).toHaveLength(2);
  });

  it("ignores stale analysis and retries failed server work explicitly", async () => {
    const panel = new TestPdfHighlightImportPanel();
    let finishLoad: (value: ArtifactAnalysis) => void = () => undefined;
    panel.loadPromise = new Promise((resolve) => {
      finishLoad = resolve;
    });
    panel.setContext({ ...context, highlights: [] });
    panel.setContext({ artifactId: "artifact-2", highlights: [], referenceId: "reference-2" });
    finishLoad(readyAnalysis);
    await settle();
    await panel.importForTest();
    expect(panel.saves).toEqual([]);

    panel.loadPromise = null;
    panel.analysis = { ...readyAnalysis, artifactId: "artifact-2", status: "failed", result: null, error: "Browser unavailable" };
    panel.reset();
    panel.setContext(null);
    panel.setContext({ artifactId: "artifact-2", highlights: [], referenceId: "reference-2" });
    await settle();
    panel.retryForTest();
    await settle();
    expect(panel.loads.at(-1)).toEqual({ artifactId: "artifact-2", retry: true });
    panel.cancelForTest();
  });

  it("owns encoded status, retry, and import requests in the default transport", async () => {
    const requests: { body: string | null; method: string | undefined; url: string }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      requests.push({ body: typeof init?.body === "string" ? init.body : null, method: init?.method, url: String(input) });
      return String(input).includes("analyses") ? Response.json(readyAnalysis) : new Response(null, { status: 204 });
    };
    try {
      const panel = new TestPdfHighlightImportPanel();
      await panel.defaultLoadForTest("artifact/1");
      await panel.defaultLoadForTest("artifact/1", true);
      await panel.defaultSaveForTest(context, [{ comment: "", page: 1, quote: "Evidence", rects: result.candidates[0]!.rects }]);
      expect(requests.map(({ method, url }) => ({ method, url }))).toEqual([
        { method: "GET", url: "/api/library/pdfs/artifact%2F1/analyses/pdf-highlights" },
        { method: "POST", url: "/api/library/pdfs/artifact%2F1/analyses/pdf-highlights" },
        { method: "POST", url: "/api/library/references/reference%2F1/highlight-imports" },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
