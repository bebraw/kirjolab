import { describe, expect, it } from "vitest";
import type { WebSnapshotComparison } from "../domain/reference-library";
import { WebSnapshotComparisonPanel, WebSourceCapture, webSourceCaptureEvent } from "./web-source-panels";

class TestWebSourceCapture extends WebSourceCapture {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changeForTest(url: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value: url } });
    this.changeUrl(event);
  }

  captureForTest(): void {
    this.capture(new Event("submit"));
  }
}

class TestWebSnapshotComparisonPanel extends WebSnapshotComparisonPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

describe("web source panels", () => {
  it("renders light-DOM capture and comparison boundaries", () => {
    const capture = new TestWebSourceCapture();
    const comparison = new TestWebSnapshotComparisonPanel();
    expect(capture.rootForTest()).toBe(capture);
    expect(comparison.rootForTest()).toBe(comparison);
    expect(capture.renderForTest()).toBeDefined();
    expect(comparison.renderForTest()).toBeDefined();
  });

  it("renders identical and changed snapshot comparisons", () => {
    const panel = new TestWebSnapshotComparisonPanel();
    panel.show(comparison(true, []));
    expect(panel.renderForTest()).toBeDefined();
    panel.show(
      comparison(false, [
        {
          added: ["new"],
          afterLine: 4,
          beforeLine: 3,
          removed: ["old"],
          truncated: true,
        },
      ]),
    );
    expect(panel.renderForTest()).toBeDefined();
  });

  it("emits a typed capture URL", () => {
    const panel = new TestWebSourceCapture();
    let captured = "";
    panel.addEventListener(webSourceCaptureEvent, (event) => {
      captured = (event as CustomEvent<string>).detail;
    });
    panel.changeForTest("https://example.org/source");
    panel.captureForTest();
    expect(captured).toBe("https://example.org/source");
    panel.clear();
    panel.captureForTest();
    expect(captured).toBe("");
  });
});

function comparison(identical: boolean, hunks: WebSnapshotComparison["hunks"]): WebSnapshotComparison {
  return {
    addedLines: identical ? 0 : 1,
    afterLines: 5,
    beforeLines: 5,
    hunks,
    identical,
    removedLines: identical ? 0 : 1,
  };
}
