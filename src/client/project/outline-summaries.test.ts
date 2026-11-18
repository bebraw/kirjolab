import { describe, expect, it, vi } from "vitest";
import { buildManuscriptOutline } from "../../domain/manuscript/manuscript-map";
import type { ModelOutlineSummary, ModelProvider } from "../assistant/model-provider";
import { OutlineSummaries } from "./outline-summaries";

function fixture(source: string) {
  const summaries = new OutlineSummaries(vi.fn());
  const summarizeOutline = vi.fn<ModelProvider["summarizeOutline"]>();
  const set = (draft: string): void => {
    const outline = buildManuscriptOutline(draft);
    summaries.setOutline(draft, outline, new Map(outline.sections.map((section) => [section.from, section.title])));
  };
  set(source);
  summaries.setProvider({ summarizeOutline });
  return { summaries, summarizeOutline, set };
}

function deferredSummary() {
  let resolve = (_value: ModelOutlineSummary): void => {};
  const promise = new Promise<ModelOutlineSummary>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe("outline summaries", () => {
  it("summarizes oversized sections in bounded batches and combines child summaries into their parent", async () => {
    const paragraph = (word: string): string => (word + " ").repeat(1_300).trim();
    const first = paragraph("One");
    const second = paragraph("Two");
    const third = paragraph("Three");
    const source = `# Findings\n\n## Trials\n\n${first}\n\n${second}\n\n${third}`;
    const { summaries, summarizeOutline } = fixture(source);
    summarizeOutline
      .mockResolvedValueOnce({ summary: "Reports two trial results.", paragraphs: ["One trial result.", "A second trial result."] })
      .mockResolvedValueOnce({ summary: "Reports a third trial result.", paragraphs: ["A third trial result."] })
      .mockResolvedValueOnce({ summary: "Reports three trial results.", paragraphs: [] })
      .mockResolvedValueOnce({ summary: "Sets out findings from three trials.", paragraphs: [] });

    await summaries.generate(null);

    expect(summarizeOutline.mock.calls.map(([request]) => [request.kind, request.sectionTitle, request.entries])).toEqual([
      ["prose", "Trials", [first, second]],
      ["prose", "Trials", [third]],
      ["summaries", "Trials", ["Reports two trial results.", "Reports a third trial result."]],
      ["summaries", "Findings", ["Reports three trial results."]],
    ]);
    expect(summaries.heading("Findings")).toBe("Sets out findings from three trials.");
    expect(summaries.paragraph(source.indexOf(third))).toBe("A third trial result.");
    await summaries.generate(null);
    expect(summarizeOutline).toHaveBeenCalledTimes(4);
  });

  it("never includes an unsupported paragraph in a partial heading summary", async () => {
    const short = "The second sample included local schools.";
    const source = `# Sampling\n\n${"Long prose. ".repeat(680)}\n\n${short}`;
    const { summaries, summarizeOutline } = fixture(source);
    summarizeOutline.mockResolvedValue({ summary: "Reports the second sample.", paragraphs: ["Samples local schools."] });
    await summaries.generate(null);
    expect(summarizeOutline).toHaveBeenCalledExactlyOnceWith(
      { kind: "prose", sectionTitle: "Sampling", entries: [short] },
      expect.anything(),
    );
    expect(summaries.heading("Sampling")).toBeNull();
    expect(summaries.paragraph(source.indexOf(short))).toBe("Samples local schools.");
  });

  it("discards an edited section's late result and continues with the captured unchanged section", async () => {
    const source = "# Results\n\nFirst draft.\n\n# Discussion\n\nDiscusses results.";
    const { summaries, summarizeOutline, set } = fixture(source);
    const response = deferredSummary();
    summarizeOutline.mockReturnValueOnce(response.promise).mockResolvedValueOnce({
      summary: "Discusses results.",
      paragraphs: ["Interprets the findings."],
    });
    const run = summaries.generate(15);
    set(source.replace("First draft.", "A substantially changed draft."));
    response.resolve({ summary: "Old results.", paragraphs: ["Old prose."] });
    await run;
    expect(summaries.heading("Results")).toBeNull();
    expect(summaries.heading("Discussion")).toBe("Discusses results.");
    expect(summarizeOutline).toHaveBeenCalledTimes(2);
  });

  it("stops after a failed request and resumes without repeating completed sections", async () => {
    const { summaries, summarizeOutline } = fixture("# Intro\n\nFirst paragraph.\n\n# Methods\n\nSecond paragraph.");
    summarizeOutline
      .mockResolvedValueOnce({ summary: "Introduces the study.", paragraphs: ["States its aim."] })
      .mockRejectedValueOnce(new Error("Provider unavailable"))
      .mockResolvedValueOnce({ summary: "Explains the method.", paragraphs: ["Defines the sample."] });
    await summaries.generate(null);
    expect(summaries.failed).toBe(true);
    expect(summaries.heading("Intro")).toBe("Introduces the study.");
    await summaries.generate(null);
    expect(summaries.failed).toBe(false);
    expect(summaries.heading("Methods")).toBe("Explains the method.");
    expect(summarizeOutline.mock.calls.map(([request]) => request.sectionTitle)).toEqual(["Intro", "Methods", "Methods"]);
  });

  it("discards responses after cancellation or a connection change", async () => {
    const { summaries, summarizeOutline } = fixture("Opening prose.\n\n# Results\n\nThe study found a difference.");
    const response = deferredSummary();
    summarizeOutline.mockReturnValueOnce(response.promise);
    const run = summaries.generate(null);
    expect(summaries.busy).toBe(true);
    summaries.setProvider(null);
    expect(summarizeOutline.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    response.resolve({ summary: "A stale summary.", paragraphs: ["A stale paragraph."] });
    await run;
    expect(summaries.paragraph(0)).toBeNull();
    expect(summaries.busy).toBe(false);
    expect(summarizeOutline).toHaveBeenCalledOnce();
  });
});
