import { describe, expect, it } from "vitest";
import type { PublicationWordStatistics } from "../domain/publication-statistics";
import { ExportStatisticsPanel } from "./export-statistics-panel";

const statistics: PublicationWordStatistics = {
  countingRule: "kirjolab-prose-v1",
  files: [
    { fileId: "main", path: "main.md", words: 1200 },
    { fileId: "methods", path: "methods.md", words: 300 },
  ],
  headings: [
    {
      depth: 2,
      fileId: "main",
      from: 10,
      heading: "Results",
      includeChain: [],
      line: 3,
      path: "main.md",
      to: 17,
      words: 500,
    },
  ],
  totalWords: 1500,
};

class TestExportStatisticsPanel extends ExportStatisticsPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

describe("export statistics panel", () => {
  it("renders loading, populated, and empty-group states", () => {
    const panel = new TestExportStatisticsPanel();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);

    panel.setStatistics(statistics);
    expect(panel.renderForTest()).toBeDefined();

    panel.setStatistics({ ...statistics, files: [], headings: [] });
    expect(panel.renderForTest()).toBeDefined();
  });
});
