import { describe, expect, it } from "vitest";
import type { ArtifactAnalysis, PdfReferenceAnalysisResult } from "../domain/reference-library";
import { PdfReferenceAnalysisPanel } from "./pdf-reference-analysis-panel";

const result: PdfReferenceAnalysisResult = {
  candidates: [
    {
      authors: ["Doe, Jane"],
      confidence: 1,
      doi: "10.5555/reference",
      id: "doi:10.5555/reference",
      page: 8,
      raw: "Doe, Jane. 2025. Useful reference. https://doi.org/10.5555/reference",
      title: "Useful reference",
      url: "https://doi.org/10.5555/reference",
      year: "2025",
    },
  ],
  pagesScanned: 8,
  pagesTotal: 8,
  referencesStartPage: 8,
  truncated: false,
};

const readyAnalysis: ArtifactAnalysis = {
  artifactId: "artifact/1",
  completedAt: "2026-07-29T00:00:02.000Z",
  error: "",
  fingerprint: "r2-etag:artifact-1",
  kind: "pdf-references",
  requestedAt: "2026-07-29T00:00:00.000Z",
  result,
  startedAt: "2026-07-29T00:00:01.000Z",
  status: "ready",
};

class TestPdfReferenceAnalysisPanel extends PdfReferenceAnalysisPanel {
  readonly loads: { artifactId: string; retry: boolean }[] = [];
  analysis: ArtifactAnalysis | Error = readyAnalysis;

  renderForTest() {
    return this.render();
  }

  retryForTest(): void {
    this.retry();
  }

  defaultLoadForTest(artifactId: string, retry = false): Promise<ArtifactAnalysis> {
    return super.load(artifactId, retry);
  }

  protected override async load(artifactId: string, retry = false): Promise<ArtifactAnalysis> {
    this.loads.push({ artifactId, retry });
    if (this.analysis instanceof Error) throw this.analysis;
    return this.analysis;
  }
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PDF reference analysis panel", () => {
  it("loads automatic reference results and resets between artifacts", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    panel.setArtifact("artifact/1");
    await settle();
    expect(panel.loads).toEqual([{ artifactId: "artifact/1", retry: false }]);
    expect(panel.renderForTest()).toBeDefined();

    panel.analysis = { ...readyAnalysis, artifactId: "artifact/2", result: { ...result, candidates: [] } };
    panel.setArtifact("artifact/2");
    await settle();
    expect(panel.loads.at(-1)).toEqual({ artifactId: "artifact/2", retry: false });
    panel.reset();
    expect(panel.renderForTest()).toBeDefined();
  });

  it("keeps failures retryable", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    panel.analysis = { ...readyAnalysis, status: "failed", result: null, error: "Browser unavailable" };
    panel.setArtifact("artifact/1");
    await settle();
    panel.analysis = readyAnalysis;
    panel.retryForTest();
    await settle();
    expect(panel.loads).toEqual([
      { artifactId: "artifact/1", retry: false },
      { artifactId: "artifact/1", retry: true },
    ]);
  });

  it("validates the default API response", async () => {
    const panel = new TestPdfReferenceAnalysisPanel();
    const previousFetch = globalThis.fetch;
    const calls: { method: string; url: string }[] = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ method: init?.method ?? "GET", url: String(input) });
      return Response.json(readyAnalysis);
    };
    try {
      await expect(panel.defaultLoadForTest("artifact/1")).resolves.toEqual(readyAnalysis);
      await expect(panel.defaultLoadForTest("artifact/1", true)).resolves.toEqual(readyAnalysis);
      expect(calls).toEqual([
        { method: "GET", url: "/api/library/pdfs/artifact%2F1/analyses/pdf-references" },
        { method: "POST", url: "/api/library/pdfs/artifact%2F1/analyses/pdf-references" },
      ]);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
