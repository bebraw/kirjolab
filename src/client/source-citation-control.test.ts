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

  it("owns citation insertion projection and notices", () => {
    const control = new TestSourceCitationControl();
    const actions: unknown[] = [];
    control.bindInsertion({
      applyInsertion: (insertion) => actions.push({ action: "insert", insertion }),
      presentNotice: (message) => actions.push({ action: "notice", message }),
    });

    control.setCaret("Claim.", 5);
    control.insertCitation("merton1942", "p. 270");

    expect(actions).toEqual([
      { action: "insert", insertion: { caret: 41, index: 5, text: ' :cite[merton1942]{locator="p. 270"}' } },
      { action: "notice", message: "Inserted :cite[merton1942] at p. 270 into canonical Markdown." },
    ]);
  });

  it("rejects insertion without a caret or a representable key", () => {
    const control = new TestSourceCitationControl();
    const notices: string[] = [];
    control.bindInsertion({
      applyInsertion: () => undefined,
      presentNotice: (message) => notices.push(message),
    });

    control.setCaret("Claim.", null);
    control.insertCitation("merton1942");
    control.setCaret("Claim.", 5);
    control.insertCitation("two words");

    expect(notices).toEqual([
      "Place the manuscript caret before inserting a citation.",
      "This reference key cannot be represented by citation syntax.",
    ]);
  });
});
