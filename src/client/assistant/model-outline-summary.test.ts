import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleBrowserProvider, type OutlineSummaryRequest } from "./model-provider";

const prose: OutlineSummaryRequest = {
  kind: "prose",
  sectionTitle: "Results",
  entries: ["The estimates had wide intervals.", "The effect was consistent across sites."],
};

function providerFor(value: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] }));
  const provider = new OpenAICompatibleBrowserProvider({
    endpoint: "http://127.0.0.1:1234/v1/chat/completions",
    providerLabel: "Local model",
    model: "test-model",
    fetcher,
  });
  return { provider, fetcher };
}

describe("outline summary model operation", () => {
  it("matches responses by input number even when the provider changes the order", async () => {
    const { provider, fetcher } = providerFor({
      summary: "Reports a consistent effect with uncertain estimates.",
      paragraphs: [
        { number: 2, summary: "Finds similar effects across sites." },
        { number: 1, summary: null },
      ],
    });
    await expect(provider.summarizeOutline(prose)).resolves.toEqual({
      summary: "Reports a consistent effect with uncertain estimates.",
      paragraphs: [null, "Finds similar effects across sites."],
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      messages: [
        { role: "system", content: expect.stringContaining("untrusted") },
        {
          role: "user",
          content: JSON.stringify({
            kind: "prose",
            sectionTitle: "Results",
            entries: [
              { number: 1, text: "The estimates had wide intervals." },
              { number: 2, text: "The effect was consistent across sites." },
            ],
          }),
        },
      ],
    });
  });

  it("accepts a synthesis without paragraph rows", async () => {
    const { provider } = providerFor({ summary: "Draws the findings together.", paragraphs: [] });
    await expect(
      provider.summarizeOutline({ kind: "summaries", sectionTitle: "Study", entries: ["Introduces the study."] }),
    ).resolves.toEqual({ summary: "Draws the findings together.", paragraphs: [] });
  });

  it.each([
    {
      summary: "Duplicate row",
      paragraphs: [
        { number: 1, summary: null },
        { number: 1, summary: null },
      ],
    },
    {
      summary: "Foreign row",
      paragraphs: [
        { number: 1, summary: null },
        { number: 3, summary: null },
      ],
    },
    { summary: "Missing row", paragraphs: [{ number: 1, summary: null }] },
    {
      summary: "A".repeat(241),
      paragraphs: [
        { number: 1, summary: null },
        { number: 2, summary: null },
      ],
    },
    { summary: "Unrequested rewrite", paragraphs: [], replacement: "Rewrite" },
  ])("rejects a response that cannot be attached safely to source rows", async (value) => {
    await expect(providerFor(value).provider.summarizeOutline(prose)).rejects.toThrow();
  });

  it.each([
    { ...prose, entries: ["A".repeat(8_001)] },
    { ...prose, entries: ["A".repeat(7_000), "B".repeat(6_000)] },
    { ...prose, entries: Array.from({ length: 13 }, () => "Paragraph") },
    { ...prose, entries: [" "] },
    { ...prose, sectionTitle: "A".repeat(501) },
  ])("rejects out-of-bounds prose before provider I/O", async (request) => {
    const { provider, fetcher } = providerFor(null);
    await expect(provider.summarizeOutline(request)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
