import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebSnapshotComparison } from "../../domain/reference-library";
import { WebSnapshotComparisonPanel, WebSourceCapture, webSourceCapturedEvent } from "./web-source-panels";

class TestWebSourceCapture extends WebSourceCapture {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders light-DOM capture and comparison boundaries", () => {
    const capture = new TestWebSourceCapture();
    const comparisonPanel = new TestWebSnapshotComparisonPanel();
    expect(capture.rootForTest()).toBe(capture);
    expect(comparisonPanel.rootForTest()).toBe(comparisonPanel);
    expect(templateText(capture.renderForTest())).toContain("Add URL");
    expect(templateText(comparisonPanel.renderForTest())).toBe("");
  });

  it("owns web capture requests and emits successful refresh outcomes", async () => {
    const panel = new TestWebSourceCapture();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const outcomes: string[] = [];
    panel.addEventListener(webSourceCapturedEvent, (event) => outcomes.push((event as CustomEvent<string>).detail));

    await panel.captureUrl("https://example.org/source");

    expect(fetchMock).toHaveBeenCalledWith("/api/library/web-sources", {
      body: JSON.stringify({ url: "https://example.org/source" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(outcomes).toEqual(["Web source captured privately with an immutable access timestamp."]);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("keeps capture failures local and ignores duplicate submissions", async () => {
    const panel = new TestWebSourceCapture();
    let resolveResponse = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal("fetch", fetchMock);

    const first = panel.captureUrl("https://example.org/source");
    expect(templateText(panel.renderForTest())).toContain("Capturing web source…");
    expect(templateText(panel.renderForTest())).toContain("Adding…");
    await panel.captureUrl("https://example.org/duplicate");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(new Response(JSON.stringify({ error: "Capture unavailable" }), { status: 503 }));
    await first;
    expect(templateText(panel.renderForTest())).toContain("Capture unavailable");
    expect(templateText(panel.renderForTest())).toContain("Add URL");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await panel.captureUrl("https://example.org/retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(templateText(panel.renderForTest())).toContain("Web source captured privately with an immutable access timestamp.");
  });

  it("owns validated identical and changed snapshot comparisons", async () => {
    const panel = new TestWebSnapshotComparisonPanel();
    const changed = comparison(false, [
      {
        added: ["new"],
        afterLine: 4,
        beforeLine: 3,
        removed: ["old"],
        truncated: true,
      },
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(comparisonResponse("before/1", "after#1", comparison(true, [])))
      .mockResolvedValueOnce(comparisonResponse("before-2", "after-2", changed));
    vi.stubGlobal("fetch", fetchMock);

    await panel.compare("before/1", "after#1");
    expect(templateText(panel.renderForTest())).toContain("No readable-text changes");
    await panel.compare("before-2", "after-2");
    const rendered = templateText(panel.renderForTest());
    expect(rendered).toContain("1 added · 1 removed");
    expect(rendered).toContain("@@ before 3 · after 4 @@\n- old\n+ new\n… excerpt truncated");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/library/web-snapshots/before%2F1/compare/after%231", {
      credentials: "same-origin",
    });
  });

  it("presents provider and malformed comparison failures locally", async () => {
    const panel = new TestWebSnapshotComparisonPanel();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "Comparison unavailable" }, 503))
      .mockResolvedValueOnce(json({ comparison: { invalid: true } }));
    vi.stubGlobal("fetch", fetchMock);

    await panel.compare("before", "after");
    expect(templateText(panel.renderForTest())).toContain("Comparison unavailable");
    await panel.compare("before", "after");
    expect(templateText(panel.renderForTest())).toContain("Web snapshot comparison returned an invalid result");
  });
});

function templateText(value: unknown): string {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map(templateText).join("");
  }
  if (
    value !== null &&
    typeof value === "object" &&
    "strings" in value &&
    "values" in value &&
    Array.isArray(value.strings) &&
    Array.isArray(value.values)
  ) {
    const strings: readonly unknown[] = value.strings;
    const values: readonly unknown[] = value.values;
    return strings.map((part, index) => `${typeof part === "string" ? part : ""}${templateText(values[index])}`).join("");
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status });
}

interface ComparisonResponseFixture {
  before: { id: string };
  after: { id: string };
  comparison: WebSnapshotComparison;
}

function comparisonResponse(beforeId: string, afterId: string, comparison: WebSnapshotComparison): Response {
  const value: ComparisonResponseFixture = { before: { id: beforeId }, after: { id: afterId }, comparison };
  return json(value);
}

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
