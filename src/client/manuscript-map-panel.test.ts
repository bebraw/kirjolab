import { describe, expect, it } from "vitest";
import { ManuscriptMapPanel, manuscriptMapSelectEvent, type ManuscriptMapSelection } from "./manuscript-map-panel";

class TestManuscriptMapPanel extends ManuscriptMapPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changePassForTest(value: string): void {
    this.changePass(eventWithTarget({ value }));
  }

  selectForTest(from?: string, to?: string): void {
    this.selectRange(eventWithTarget({ dataset: { rangeFrom: from, rangeTo: to } }));
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("manuscript map panel", () => {
  it("renders empty and populated manuscript maps with each editing pass", () => {
    const panel = new TestManuscriptMapPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setSource("## Introduction\n\nThis study reports a result.\n\n### Detail\n\nShort text.\n");
    for (const pass of ["structure", "order", "clarity", "evidence", "length"]) {
      panel.changePassForTest(pass);
      expect(panel.renderForTest()).toBeDefined();
    }
    panel.changePassForTest("unknown");
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits only valid source-range selections", () => {
    const panel = new TestManuscriptMapPanel();
    const selections: ManuscriptMapSelection[] = [];
    panel.addEventListener(manuscriptMapSelectEvent, (event) => selections.push((event as CustomEvent<ManuscriptMapSelection>).detail));

    panel.selectForTest("2", "9");
    panel.selectForTest("-1", "4");
    panel.selectForTest("8", "4");
    panel.selectForTest("missing", "4");

    expect(selections).toEqual([{ from: 2, to: 9 }]);
  });
});
