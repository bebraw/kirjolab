import { describe, expect, it } from "vitest";
import { resolveSubmissionTemplate, submissionPageSize } from "./submission-templates";

describe("submission templates", () => {
  it("resolves bounded presets and paper geometry", () => {
    const base = { citationStyle: "apa", locale: "en-US", paperSize: "a4" } as const;
    expect(resolveSubmissionTemplate({ ...base, submissionTemplate: "article" })).toMatchObject({ marginPoints: 72, titlePage: false });
    expect(resolveSubmissionTemplate({ ...base, submissionTemplate: "preprint" })).toMatchObject({ lineSpacing: 1.5, titlePage: true });
    expect(resolveSubmissionTemplate({ ...base, submissionTemplate: "anonymous-review" })).toMatchObject({
      anonymize: true,
      lineSpacing: 2,
    });
    expect(resolveSubmissionTemplate({ ...base, submissionTemplate: "journal-two-column" })).toMatchObject({
      columns: 2,
      marginPoints: 54,
    });
    expect(submissionPageSize({ ...base, submissionTemplate: "article" })).toEqual([595.28, 841.89]);
    expect(submissionPageSize({ ...base, submissionTemplate: "article", paperSize: "letter" })).toEqual([612, 792]);
  });
});
