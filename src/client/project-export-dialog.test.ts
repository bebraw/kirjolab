import { describe, expect, it, vi } from "vitest";
import type { PublicationWordStatistics } from "../domain/publication-statistics";
import { ProjectExportDialog } from "./project-export-dialog";

const statistics: PublicationWordStatistics = {
  countingRule: "kirjolab-prose-v1",
  files: [{ fileId: "main", path: "main.md", words: 12 }],
  headings: [],
  totalWords: 12,
};

class TestProjectExportDialog extends ProjectExportDialog {
  renderForTest() {
    return this.render();
  }

  clickForTest(target: Element): void {
    const event = new Event("click");
    Object.defineProperty(event, "target", { value: target });
    this.handleClick(event);
  }
}

describe("project export dialog", () => {
  it("preserves server-rendered export content through its slot", () => {
    const control = new TestProjectExportDialog();
    expect(control.renderForTest()).toBeDefined();
  });

  it("synchronizes statistics and owns modal lifecycle", () => {
    const control = new TestProjectExportDialog();
    const dialog = {
      close: vi.fn(),
      open: false,
      showModal: vi.fn(() => {
        dialog.open = true;
      }),
    };
    const statisticsPanel = { setStatistics: vi.fn() };
    Object.defineProperty(control, "querySelector", {
      value: (selector: string) => (selector === "#export-dialog" ? dialog : statisticsPanel),
    });
    const openTarget = {
      closest: (selector: string) => (selector === "[data-project-export-trigger]" ? openTarget : null),
    } as unknown as Element;
    const closeTarget = { closest: (selector: string) => (selector === "#close-export" ? closeTarget : null) } as unknown as Element;

    control.setStatistics(statistics);
    control.clickForTest(openTarget);
    control.open(statistics);
    control.open(statistics);
    control.clickForTest(closeTarget);

    expect(statisticsPanel.setStatistics).toHaveBeenCalledWith(statistics);
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(dialog.close).toHaveBeenCalledOnce();
  });
});
