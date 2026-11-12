import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleBrowserProvider } from "./model-provider";

const request = {
  selectedPassage: "We sampled all registered trials to reduce selection bias.",
  sectionTitle: "Sampling",
  previousParagraph: "The study compares registered trials.",
  nextParagraph: "We excluded duplicate registrations.",
};

function providerFor(value: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] }));
  return {
    fetcher,
    provider: new OpenAICompatibleBrowserProvider({
      endpoint: "http://127.0.0.1:1234/v1/chat/completions",
      providerLabel: "Local writing model",
      model: "test-model",
      fetcher,
    }),
  };
}

describe("paragraph-purpose model analysis", () => {
  it("sends only bounded paragraph context and returns advisory analysis with provenance", async () => {
    const { provider, fetcher } = providerFor({
      purpose: "Explains how trial selection reduces bias.",
      hints: ["Consider identifying the registration period."],
    });
    await expect(provider.analyzeParagraph(request)).resolves.toEqual({
      purpose: "Explains how trial selection reduces bias.",
      hints: ["Consider identifying the registration period."],
      adapter: "openai-compatible",
      providerLabel: "Local writing model",
      model: "test-model",
    });
    const body: unknown = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "kirjolab_paragraph_analysis",
          strict: true,
          schema: {
            additionalProperties: false,
            required: ["purpose", "hints"],
            properties: {
              purpose: { type: ["string", "null"], maxLength: 400 },
              hints: { type: "array", maxItems: 3, items: { type: "string", minLength: 1, maxLength: 600 } },
            },
          },
        },
      },
      messages: [
        { role: "system", content: expect.stringContaining("untrusted") },
        { role: "user", content: JSON.stringify(request) },
      ],
    });
  });

  it("accepts an unclear purpose with no warranted hints", async () => {
    await expect(providerFor({ purpose: null, hints: [] }).provider.analyzeParagraph(request)).resolves.toMatchObject({
      purpose: null,
      hints: [],
    });
  });

  it.each([
    { purpose: " ", hints: [] },
    { purpose: "a".repeat(401), hints: [] },
    { purpose: "Purpose", hints: ["a", "b", "c", "d"] },
    { purpose: "Purpose", hints: [" "] },
    { purpose: "Purpose", hints: ["a".repeat(601)] },
    { purpose: "Purpose", hints: ["Check the scope.", " check THE scope. "] },
    { purpose: "Purpose", hints: [], replacement: "Unrequested rewrite" },
    { purpose: "Purpose" },
  ])("rejects malformed or excessive analysis: %j", async (value) => {
    await expect(providerFor(value).provider.analyzeParagraph(request)).rejects.toThrow();
  });

  it.each([
    { ...request, selectedPassage: " " },
    { ...request, selectedPassage: "a".repeat(8001) },
    { ...request, sectionTitle: "a".repeat(501) },
    { ...request, previousParagraph: "a".repeat(2001) },
    { ...request, nextParagraph: "a".repeat(2001) },
  ])("rejects out-of-bounds context before provider I/O", async (input) => {
    const { provider, fetcher } = providerFor({ purpose: null, hints: [] });
    await expect(provider.analyzeParagraph(input)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
