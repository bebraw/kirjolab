import { describe, expect, it } from "vitest";
import { resolveSubmissionTemplate, submissionPageSize } from "./submission-templates";

describe("submission templates", () => {
  it("resolves bounded presets and paper geometry", () => {
    const base = { citationStyle: "apa", locale: "en-US", paperSize: "a4" } as const;
    expect(resolveSubmissionTemplate({ ...base, submissionTemplate: "article" })).toEqual({
      id: "article",
      label: "Standard article",
      marginPoints: 72,
      lineSpacing: 1,
      columns: 1,
      titlePage: false,
      anonymize: false,
    });
    expect(resolveSubmissionTemplate({ ...base, submissionTemplate: "preprint" })).toEqual({
      id: "preprint",
      label: "Preprint",
      marginPoints: 72,
      lineSpacing: 1.5,
      columns: 1,
      titlePage: true,
      anonymize: false,
    });
    expect(resolveSubmissionTemplate({ ...base, submissionTemplate: "anonymous-review" })).toEqual({
      id: "anonymous-review",
      label: "Anonymous review",
      marginPoints: 90,
      anonymize: true,
      lineSpacing: 2,
      columns: 1,
      titlePage: true,
    });
    expect(resolveSubmissionTemplate({ ...base, submissionTemplate: "journal-two-column" })).toEqual({
      id: "journal-two-column",
      label: "Journal two-column",
      columns: 2,
      marginPoints: 54,
      lineSpacing: 1,
      titlePage: false,
      anonymize: false,
    });
    expect(submissionPageSize({ ...base, submissionTemplate: "article" })).toEqual([595.28, 841.89]);
    expect(submissionPageSize({ ...base, submissionTemplate: "article", paperSize: "letter" })).toEqual([612, 792]);
  });
});
