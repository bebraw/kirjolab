import { describe, expect, it, vi } from "vitest";
import type { ProjectReferencePdf } from "../../domain/reference-library";
import { PdfRelatedPapersControl } from "./pdf-related-papers-control";

const pdf: ProjectReferencePdf = { id: "pdf:1", referenceId: "reference:1", name: "Supplement.pdf", size: 100, fingerprint: "supplement" };

class TestPdfRelatedPapersControl extends PdfRelatedPapersControl {
  renderForTest() {
    return this.render();
  }

  chooseForTest(groupIndex: string, paperIndex: string): void {
    const event = new Event("click");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { groupIndex, paperIndex } } });
    this.choosePaper(event);
  }
}

describe("related PDF control", () => {
  it("appears only when there is an alternative and routes the selected paper", () => {
    const control = new TestPdfRelatedPapersControl();
    const openPaper = vi.fn();
    control.bind(openPaper);
    expect(control.hidden).toBe(true);
    control.setGroups([{ referenceId: "reference:1", referenceTitle: "The study", papers: [{ kind: "reference", pdf }] }]);
    expect(control.hidden).toBe(false);
    expect(control.renderForTest()).toBeDefined();
    control.chooseForTest("0", "0");
    expect(openPaper).toHaveBeenCalledWith({ kind: "reference", pdf });
    control.setGroups([]);
    expect(control.hidden).toBe(true);
  });
});
