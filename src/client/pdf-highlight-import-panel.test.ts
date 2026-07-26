import { describe, expect, it } from "vitest";
import type { LibraryHighlight, LibraryHighlightImportCandidate } from "../domain/reference-library";
import type { PdfHighlightDetection } from "./pdf-highlight-import";
import {
  PdfHighlightImportPanel,
  pdfHighlightImportOutcomeEvent,
  type PdfHighlightImportContext,
  type PdfHighlightImportOutcome,
} from "./pdf-highlight-import-panel";

const result: PdfHighlightDetection = {
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

class TestPdfHighlightImportPanel extends PdfHighlightImportPanel {
  readonly scans: string[] = [];
  readonly saves: { context: PdfHighlightImportContext; candidates: readonly LibraryHighlightImportCandidate[] }[] = [];
  scanResult: PdfHighlightDetection | Error = result;
  scanPromise: Promise<PdfHighlightDetection> | null = null;
  saveError: Error | null = null;

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  detectForTest(): Promise<void> {
    return this.detect();
  }

  importForTest(): Promise<void> {
    return this.importSelected(new Event("submit") as SubmitEvent);
  }

  cancelForTest(): void {
    this.cancel();
  }

  showResultForTest(value: PdfHighlightDetection): void {
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

  defaultSaveForTest(value: PdfHighlightImportContext, candidates: readonly LibraryHighlightImportCandidate[]): Promise<void> {
    return super.save(value, candidates);
  }

  protected override async scan(url: string): Promise<PdfHighlightDetection> {
    this.scans.push(url);
    if (this.scanPromise) return this.scanPromise;
    if (this.scanResult instanceof Error) throw this.scanResult;
    return this.scanResult;
  }

  protected override async save(context: PdfHighlightImportContext, candidates: readonly LibraryHighlightImportCandidate[]): Promise<void> {
    this.saves.push({ context, candidates });
    if (this.saveError) throw this.saveError;
  }
}

function eventForReview(id: string, input: { checked: boolean; value: string }): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", {
    value: {
      ...input,
      closest: () => ({ dataset: { highlightImportId: id } }),
    },
  });
  return event;
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
  it("renders default, scanning, empty, mixed, error, and completion states", async () => {
    const panel = new TestPdfHighlightImportPanel();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
    panel.setContext(context);
    await panel.detectForTest();
    expect(panel.renderForTest()).toBeDefined();
    panel.showResultForTest({ candidates: [], pagesScanned: 1, pagesTotal: 1, truncated: false });
    expect(panel.renderForTest()).toBeDefined();
    panel.showResultForTest(result);
    expect(panel.renderForTest()).toBeDefined();
    panel.showErrorForTest("Could not inspect this PDF.");
    panel.reset("2 highlights imported privately.");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns detection, duplicate filtering, review, import transport, and its typed outcome", async () => {
    const panel = new TestPdfHighlightImportPanel();
    const outcomes: PdfHighlightImportOutcome[] = [];
    panel.addEventListener(pdfHighlightImportOutcomeEvent, (event) =>
      outcomes.push((event as CustomEvent<PdfHighlightImportOutcome>).detail),
    );
    panel.setContext(context);

    await panel.detectForTest();
    panel.commentForTest("flat:2", "  Reviewed note  ");
    await panel.importForTest();

    expect(panel.scans).toEqual(["/api/library/pdfs/artifact%2F1"]);
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

  it("keeps empty selection and provider failures retryable without emitting completion", async () => {
    const panel = new TestPdfHighlightImportPanel();
    const outcomes: PdfHighlightImportOutcome[] = [];
    panel.addEventListener(pdfHighlightImportOutcomeEvent, (event) =>
      outcomes.push((event as CustomEvent<PdfHighlightImportOutcome>).detail),
    );
    panel.setContext({ ...context, highlights: [] });
    await panel.detectForTest();
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
    expect(outcomes).toEqual([{ count: 1 }]);
  });

  it("ignores an in-flight scan after artifact identity changes and keeps cancel local", async () => {
    const panel = new TestPdfHighlightImportPanel();
    let finishScan: (value: PdfHighlightDetection) => void = () => undefined;
    panel.scanPromise = new Promise((resolve) => {
      finishScan = resolve;
    });
    panel.setContext({ ...context, highlights: [] });
    const detection = panel.detectForTest();
    void panel.detectForTest();
    panel.setContext({ artifactId: "artifact-2", highlights: [], referenceId: "reference-2" });
    finishScan(result);
    await detection;
    await panel.importForTest();
    panel.cancelForTest();

    expect(panel.scans).toHaveLength(1);
    expect(panel.saves).toEqual([]);
  });

  it("owns encoded import requests in the default transport", async () => {
    const requests: { body: string | null; url: string }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      requests.push({ body: typeof init?.body === "string" ? init.body : null, url: String(input) });
      return new Response(null, { status: 204 });
    };
    try {
      const panel = new TestPdfHighlightImportPanel();
      panel.setContext({ ...context, highlights: [] });
      await panel.detectForTest();
      await panel.defaultSaveForTest(context, [{ comment: "", page: 1, quote: "Evidence", rects: result.candidates[0]!.rects }]);
      expect(requests).toEqual([
        {
          body: JSON.stringify({
            artifactId: "artifact/1",
            candidates: [{ comment: "", page: 1, quote: "Evidence", rects: result.candidates[0]!.rects }],
          }),
          url: "/api/library/references/reference%2F1/highlight-imports",
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
