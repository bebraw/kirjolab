import { describe, expect, it } from "vitest";
import { isCitationResearchQueue, isQueueCitationReferenceInput } from "./citation-research-queue";

describe("citation research queue contracts", () => {
  const item = {
    referenceId: "reference-2",
    seedReferenceId: "reference-1",
    direction: "references" as const,
    addedAt: "2026-07-30T08:00:00.000Z",
  };

  it("validates bounded directional queue items", () => {
    expect(isCitationResearchQueue([item])).toBe(true);
    expect(isCitationResearchQueue([{ ...item, referenceId: item.seedReferenceId }])).toBe(false);
    expect(isCitationResearchQueue([{ ...item, direction: "sideways" }])).toBe(false);
    expect(isCitationResearchQueue(Array.from({ length: 129 }, () => item))).toBe(false);
  });

  it("accepts only a seed and citation direction as mutation input", () => {
    expect(isQueueCitationReferenceInput({ seedReferenceId: item.seedReferenceId, direction: "citations" })).toBe(true);
    expect(isQueueCitationReferenceInput({ seedReferenceId: item.seedReferenceId, direction: "references", addedAt: item.addedAt })).toBe(
      false,
    );
    expect(isQueueCitationReferenceInput({ seedReferenceId: item.seedReferenceId, direction: "other" })).toBe(false);
  });
});
