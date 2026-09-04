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
    control.bindWorkflow({ openCitation: (context) => contexts.push(context) }, { completeCitationInsertion: () => undefined });

    control.setCaret('See :cite[merton1942]{locator="p. 4"}.', 12);
    control.openForTest();

    expect(contexts).toEqual([{ keys: ["merton1942"], locator: "p. 4" }]);
    expect(control.renderForTest()).toBeDefined();
    expect(control.rootForTest()).toBe(control);
  });

  it("opens a citation directly from an editor pointer position", () => {
    const control = new TestSourceCitationControl();
    const contexts: CitationContext[] = [];
    control.bindWorkflow({ openCitation: (context) => contexts.push(context) }, { completeCitationInsertion: () => undefined });

    expect(control.openCitationAtPosition('See :cite[merton1942]{locator="p. 4"}.', 12)).toBe(true);
    expect(control.openCitationAtPosition("Plain prose", 5)).toBe(false);

    expect(contexts).toEqual([{ keys: ["merton1942"], locator: "p. 4" }]);
  });

  it("does not open outside a citation", () => {
    const control = new TestSourceCitationControl();
    let opened = false;
    control.bindWorkflow(
      {
        openCitation: () => {
          opened = true;
        },
      },
      { completeCitationInsertion: () => undefined },
    );

    control.setCaret("Plain prose", 5);
    control.openForTest();

    expect(opened).toBe(false);
  });

  it("owns citation insertion projection and notices", () => {
    const control = new TestSourceCitationControl();
    const completions: unknown[] = [];
    control.bindWorkflow(
      { openCitation: () => undefined },
      { completeCitationInsertion: (insertion, message) => completions.push({ insertion, message }) },
    );

    control.setCaret("Claim.", 5);
    control.insertCitation("merton1942", "p. 270");

    expect(completions).toEqual([
      {
        insertion: { caret: 41, index: 5, text: ' :cite[merton1942]{locator="p. 270"}' },
        message: "Inserted :cite[merton1942] at p. 270 into canonical Markdown.",
      },
    ]);
  });

  it("rejects insertion without a caret or a representable key", () => {
    const control = new TestSourceCitationControl();
    const completions: unknown[] = [];
    control.bindWorkflow(
      { openCitation: () => undefined },
      { completeCitationInsertion: (insertion, message) => completions.push({ insertion, message }) },
    );

    control.setCaret("Claim.", null);
    control.insertCitation("merton1942");
    control.setCaret("Claim.", 5);
    control.insertCitation("two words");

    expect(completions).toEqual([
      { insertion: null, message: "Place the manuscript caret before inserting a citation." },
      { insertion: null, message: "This reference key cannot be represented by citation syntax." },
    ]);
  });
});
