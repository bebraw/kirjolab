import { describe, expect, it, vi } from "vitest";
import { ResearchDiarySummary } from "./research-diary-summary";

class TestResearchDiarySummary extends ResearchDiarySummary {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitOpenForTest(): void {
    this.emitOpen();
  }
}

describe("research diary summary", () => {
  it("owns missing, singular, and plural diary presentation", () => {
    const summary = new TestResearchDiarySummary();
    expect(summary.rootForTest()).toBe(summary);
    expect(summary.renderForTest()).toBeDefined();
    summary.setContent("## 2026-07-25\n\n## Open questions\n\n- [ ] One?\n\n## Next actions\n\n- [ ] Continue\n");
    expect(summary.renderForTest()).toBeDefined();
    summary.setContent(
      "## 2026-07-24\n\n## 2026-07-25\n\n## Open questions\n\n- [ ] One?\n- [ ] Two?\n\n## Next actions\n\n- [ ] Continue\n- [ ] Share\n",
    );
    expect(summary.renderForTest()).toBeDefined();
  });

  it("binds the open action", () => {
    const summary = new TestResearchDiarySummary();
    const openWorkflowFile = vi.fn().mockResolvedValue(undefined);
    summary.bindProject({ openWorkflowFile });
    summary.emitOpenForTest();
    expect(openWorkflowFile).toHaveBeenCalledWith("research-diary.md", expect.any(Function));
    expect(openWorkflowFile.mock.calls[0]?.[1]()).toContain("# Research diary");
  });
});
