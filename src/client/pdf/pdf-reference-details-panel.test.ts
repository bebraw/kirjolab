import { describe, expect, it } from "vitest";
import { PdfReferenceDetailsPanel } from "./pdf-reference-details-panel";

class TestPdfReferenceDetailsPanel extends PdfReferenceDetailsPanel {
  renderForTest() {
    return this.render();
  }

  get openForTest(): boolean {
    return Reflect.get(this, "open") === true;
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
    expect(markup).toContain("About this paper");
    expect(markup).toContain("A useful paper");
    expect(markup).toContain("Doe, Jane; Roe, Richard");
    expect(markup).toContain("Journal of Examples");
    expect(markup).toContain("doi:10.1234/example");
    expect(markup).toContain(":cite[doe2026]");
    expect(markup).toContain("A concise abstract.");
  });

  it("keeps an unlinked PDF useful and closes when PDF context disappears", () => {
    const panel = new TestPdfReferenceDetailsPanel();
    panel.setContext({ pdfId: "pdf-1", pdfName: "unlinked.pdf", references: [] });
    panel.show();

    expect(templateMarkup(panel.renderForTest())).toContain("No reference is connected to this PDF yet.");

    panel.setContext(null);

    expect(panel.openForTest).toBe(false);
  });
});
