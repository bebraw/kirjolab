import { describe, expect, it } from "vitest";
import { SourceCitationControl } from "./source-citation-control";
import type { CitationContext } from "./citations";

class TestSourceCitationControl extends SourceCitationControl {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  openForTest(): void {
    this.openCitation();
  }
}

describe("source citation control", () => {
  it("opens the citation context at the active caret", () => {
    const control = new TestSourceCitationControl();
    const contexts: CitationContext[] = [];
    control.bindNavigation((context) => contexts.push(context));

    control.setCaret('See :cite[merton1942]{locator="p. 4"}.', 12);
    control.openForTest();

    expect(contexts).toEqual([{ keys: ["merton1942"], locator: "p. 4" }]);
    expect(control.renderForTest()).toBeDefined();
    expect(control.rootForTest()).toBe(control);
  });

  it("does not open outside a citation", () => {
    const control = new TestSourceCitationControl();
    let opened = false;
    control.bindNavigation(() => {
      opened = true;
    });

    control.setCaret("Plain prose", 5);
    control.openForTest();

    expect(opened).toBe(false);
  });
});
