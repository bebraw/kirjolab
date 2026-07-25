import { describe, expect, it } from "vitest";
import type { PdfHighlightDetection } from "./pdf-highlight-import";
import { PdfHighlightImportPanel, pdfHighlightImportActionEvent, type PdfHighlightImportAction } from "./pdf-highlight-import-panel";

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
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  detectForTest(): void {
    this.detect();
  }

  importForTest(): void {
    this.importSelected(new Event("submit") as SubmitEvent);
  }

  cancelForTest(): void {
    this.cancel();
  }

  selectForTest(id: string, checked: boolean): void {
    this.changeSelection(eventForReview(id, { checked, value: "" }));
  }

  commentForTest(id: string, value: string): void {
    this.changeComment(eventForReview(id, { checked: true, value }));
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

describe("PDF highlight import panel", () => {
  it("renders default, scanning, empty, mixed, error, and importing states", () => {
    const panel = new TestPdfHighlightImportPanel();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
    panel.detectForTest();
    expect(panel.renderForTest()).toBeDefined();
    panel.showResult({ candidates: [], pagesScanned: 1, pagesTotal: 1, truncated: false });
    expect(panel.renderForTest()).toBeDefined();
    panel.showResult(result);
    expect(panel.renderForTest()).toBeDefined();
    panel.showError("Could not inspect this PDF.");
    panel.setImporting(true);
    expect(panel.renderForTest()).toBeDefined();
    panel.reset("2 highlights imported privately.");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns review values and emits bounded detect, import, and cancel intents", () => {
    const panel = new TestPdfHighlightImportPanel();
    const actions: PdfHighlightImportAction[] = [];
    panel.addEventListener(pdfHighlightImportActionEvent, (event) => actions.push((event as CustomEvent<PdfHighlightImportAction>).detail));

    panel.detectForTest();
    panel.detectForTest();
    panel.showResult(result);
    panel.selectForTest("flat:2", false);
    panel.commentForTest("native:1", "  Reviewed note  ");
    panel.importForTest();
    panel.cancelForTest();

    expect(actions).toEqual([
      { action: "detect" },
      {
        action: "import",
        candidates: [{ ...result.candidates[0], comment: "Reviewed note" }],
      },
      { action: "cancel" },
    ]);
  });
});
