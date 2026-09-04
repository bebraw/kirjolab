import { afterEach, describe, expect, it, vi } from "vitest";

import {
  latestExtractionValue,
  researchQuestionReference,
  resolveResearchQuestionReferences,
  reviewIdentityFromApiBase,
  reviewPublicationProjectApi,
  reviewSynthesisPublicationPath,
  reviewSynthesisPublicationRequest,
} from "./review-study-contracts";
import { reviewModelProvider } from "./review-study-ui";

afterEach(() => vi.unstubAllGlobals());

const questions = [
  { id: "rq_internal_first", text: "What changed?" },
  { id: "rq_internal_second", text: "What did it cost?" },
];

describe("review-study research-question references", () => {
  it("resolves visible ordered references to stable internal ids", () => {
    expect(resolveResearchQuestionReferences("RQ1; rq2", questions)).toEqual(["rq_internal_first", "rq_internal_second"]);
    const tenQuestions = Array.from({ length: 10 }, (_, index) => ({ id: `internal-${index + 1}`, text: `Question ${index + 1}` }));
    expect(resolveResearchQuestionReferences("RQ10", tenQuestions)).toEqual(["internal-10"]);
  });

  it("preserves unknown references for domain validation", () => {
    expect(resolveResearchQuestionReferences("RQ3; custom", questions)).toEqual(["RQ3", "custom"]);
    expect(resolveResearchQuestionReferences(" ; xRQ1; RQ1x; ;", questions)).toEqual(["xRQ1", "RQ1x"]);
  });

  it("renders stable ids as visible ordered references", () => {
    expect(researchQuestionReference("rq_internal_second", questions)).toBe("rq2");
    expect(researchQuestionReference("rq_internal_first", questions)).toBe("rq1");
    expect(researchQuestionReference("legacy", questions)).toBe("legacy");
  });
});

describe("review-study extraction state", () => {
  it("returns the latest recorded value for a field", () => {
    const values = [
      {
        id: "first",
        recordId: "record",
        protocolRevision: 1,
        fieldId: "effect",
        criterionId: "effect",
        criterionText: "Effect",
        value: "small",
        missingReason: null,
        evidence: {
          kind: "pdf-annotation" as const,
          resourceId: "pdf-1",
          selectorId: "annotation-1",
          quote: "Small effect",
          page: 1,
          location: "Results",
        },
        reviewer: "one@example.org",
        createdAt: "2026-07-17T10:00:00.000Z",
      },
      {
        id: "second",
        recordId: "record",
        protocolRevision: 1,
        fieldId: "effect",
        criterionId: "effect",
        criterionText: "Effect",
        value: "moderate",
        missingReason: null,
        evidence: {
          kind: "pdf-annotation" as const,
          resourceId: "pdf-1",
          selectorId: "annotation-2",
          quote: "Moderate effect",
          page: 2,
          location: "Results",
        },
        reviewer: "two@example.org",
        createdAt: "2026-07-17T11:00:00.000Z",
      },
    ];

    expect(latestExtractionValue(values, "effect")?.id).toBe("second");
    expect(latestExtractionValue(values, "missing")).toBeNull();
    expect(latestExtractionValue(values.slice(0, 1), "effect")?.id).toBe("first");
  });
});

describe("review-study writing model", () => {
  it("uses the shared tab-scoped Codex companion authentication", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "include",
                criterion: "Empirical",
                rationale: "Reports a study.",
                evidence: "survey",
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() =>
        JSON.stringify({
          connection: "codex",
          endpoint: "http://127.0.0.1:8790/v1/chat/completions",
          model: "gpt-5.6-terra",
          reasoningEffort: "none",
        }),
      ),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    });
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(() => "tab-only-token-with-at-least-24-chars"),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(
      reviewModelProvider().screenReviewRecord({
        title: "A survey",
        abstract: "We report a survey.",
        inclusionCriteria: ["Empirical"],
        exclusionCriteria: [],
      }),
    ).resolves.toMatchObject({ providerLabel: "Codex via local companion", model: "gpt-5.6-terra" });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      authorization: "Bearer tab-only-token-with-at-least-24-chars",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ temperature: 0 });
  });
});

describe("independent review publication", () => {
  const reviewId = "abcdefab-cdef-4abc-8abc-abcdefabcdef";
  const target = {
    projectLinkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workspaceId: "writing-project",
  } as const;

  it("derives the review identity from the canonical API base", () => {
    expect(reviewIdentityFromApiBase(`/api/reviews/${reviewId}`)).toBe(reviewId);
    expect(reviewIdentityFromApiBase(`/api/reviews/${reviewId.toUpperCase()}`)).toBe(reviewId);
    expect(() => reviewIdentityFromApiBase("/api/workspaces/writing-project")).toThrow("API base");
    expect(() => reviewIdentityFromApiBase(`prefix/api/reviews/${reviewId}`)).toThrow("API base");
    expect(() => reviewIdentityFromApiBase(`/api/reviews/${reviewId}/suffix`)).toThrow("API base");
  });

  it("builds the selected-project revision request and explicit publication provenance", () => {
    expect(reviewPublicationProjectApi(target)).toBe("/api/workspaces/writing-project");
    expect(reviewSynthesisPublicationPath(reviewId)).toBe(`review/${reviewId}/synthesis.md`);
    expect(reviewSynthesisPublicationPath(reviewId.toUpperCase())).toBe(`review/${reviewId}/synthesis.md`);
    expect(reviewSynthesisPublicationRequest(reviewId, target, 17, 9)).toEqual({
      projectLinkId: target.projectLinkId,
      expectedProjectRevision: 17,
      reviewRevision: 9,
      artifactId: "synthesis",
      analysisDefinitionId: "review-synthesis-report",
      path: `review/${reviewId}/synthesis.md`,
    });
  });

  it("rejects malformed publication identities and revisions", () => {
    expect(() => reviewPublicationProjectApi({ ...target, workspaceId: "private/project" })).toThrow("target");
    expect(() => reviewSynthesisPublicationRequest("review", target, 1, 1)).toThrow("identity");
    expect(() => reviewSynthesisPublicationRequest(reviewId, target, -1, 1)).toThrow("Project revision");
    expect(reviewSynthesisPublicationRequest(reviewId, target, 0, 1).expectedProjectRevision).toBe(0);
    expect(() => reviewSynthesisPublicationRequest(reviewId, target, 1, 0)).toThrow("Review revision");
    expect(() => reviewSynthesisPublicationRequest(`prefix${reviewId}`, target, 1, 1)).toThrow("identity");
    expect(() => reviewSynthesisPublicationRequest(`${reviewId}suffix`, target, 1, 1)).toThrow("identity");
  });
});
