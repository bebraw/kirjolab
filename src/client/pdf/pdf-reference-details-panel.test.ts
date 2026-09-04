import { describe, expect, it } from "vitest";
import { PdfReferenceDetailsPanel, pdfReferenceDetailsVisibilityEvent } from "./pdf-reference-details-panel";

class TestPdfReferenceDetailsPanel extends PdfReferenceDetailsPanel {
  renderForTest() {
    return this.render();
  }

  get openForTest(): boolean {
    return Reflect.get(this, "open") === true;
  }

  get hiddenForTest(): unknown {
    return this.renderForTest().values[0];
  }
}

function templateMarkup(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map(templateMarkup).join("");
  if (typeof value !== "object") return String(value);
  const template = value as { strings?: readonly string[]; values?: readonly unknown[] };
  return [...(template.strings ?? []), ...(Array.isArray(template.values) ? template.values.map(templateMarkup) : [])].join("");
}

describe("PDF reference details panel", () => {
  it("shows canonical reference metadata without changing PDF state", () => {
    const panel = new TestPdfReferenceDetailsPanel();
    panel.setContext({
      pdfId: "pdf-1",
      pdfName: "paper.pdf",
      references: [
        {
          abstract: "A concise abstract.",
          authors: ["Doe, Jane", "Roe, Richard"],
          citationKey: "doe2026",
          doi: "10.1234/example",
          id: "reference-1",
          origin: "Project reference",
          title: "A useful paper",
          type: "article",
          venue: "Journal of Examples",
          year: "2026",
        },
      ],
    });

    panel.show();

    const markup = templateMarkup(panel.renderForTest());
    expect(panel.openForTest).toBe(true);
    expect(panel.hiddenForTest).toBe(false);
    expect(markup).toContain("About this paper");
    expect(markup).toContain("paper.pdf");
    expect(markup).toContain("A useful paper");
    expect(markup).toContain("Doe, Jane; Roe, Richard · 2026 · Journal of Examples · doi:10.1234/example");
    expect(markup).toContain(":cite[doe2026]");
    expect(markup).toContain("A concise abstract.");
  });

  it("reports visibility transitions and preserves an open panel while its PDF context changes", () => {
    const panel = new TestPdfReferenceDetailsPanel();
    const visibility: Array<{ readonly bubbles: boolean; readonly open: boolean }> = [];
    panel.addEventListener(pdfReferenceDetailsVisibilityEvent, (event) => {
      visibility.push({
        bubbles: event.bubbles,
        open: (event as CustomEvent<{ readonly open: boolean }>).detail.open,
      });
    });

    expect(panel.openForTest).toBe(false);
    expect(panel.hiddenForTest).toBe(true);
    panel.show();
    expect(panel.openForTest).toBe(false);
    expect(visibility).toEqual([]);

    panel.setContext({ pdfId: "pdf-1", pdfName: "unlinked.pdf", references: [] });
    panel.show();
    expect(panel.openForTest).toBe(true);
    expect(panel.hiddenForTest).toBe(false);
    expect(visibility).toEqual([{ bubbles: true, open: true }]);

    panel.setContext({ pdfId: "pdf-2", pdfName: "replacement.pdf", references: [] });
    expect(panel.openForTest).toBe(true);
    expect(templateMarkup(panel.renderForTest())).toContain("replacement.pdf");

    panel.hide();
    panel.hide();
    expect(panel.openForTest).toBe(false);
    expect(panel.hiddenForTest).toBe(true);
    expect(visibility).toEqual([
      { bubbles: true, open: true },
      { bubbles: true, open: false },
    ]);

    panel.setContext(null);
    expect(visibility).toHaveLength(2);
  });

  it("keeps PDFs without canonical or complete reference metadata useful", () => {
    const panel = new TestPdfReferenceDetailsPanel();
    panel.setContext({ pdfId: "pdf-1", pdfName: "unlinked.pdf", references: [] });
    panel.show();

    expect(templateMarkup(panel.renderForTest())).toContain("No reference is connected to this PDF yet.");

    panel.setContext({
      pdfId: "pdf-1",
      pdfName: "unlinked.pdf",
      references: [
        {
          abstract: "",
          authors: [],
          citationKey: "",
          doi: "",
          id: "reference-1",
          origin: "Library reference",
          title: "",
          type: "misc",
          venue: "",
          year: "",
        },
      ],
    });

    const markup = templateMarkup(panel.renderForTest());
    expect(markup).toContain("Untitled reference");
    expect(markup).toContain("No abstract is stored for this reference yet.");
    expect(markup).not.toContain("pdf-reference-citation-key");
    expect(markup).not.toContain("Stryker was here!");
  });
});
