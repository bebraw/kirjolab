import { describe, expect, it } from "vitest";
import {
  buildLogicalQuery,
  calibrateKnownStudies,
  defaultReviewProtocol,
  materializeProtocolRevision,
  parseReviewProtocolContent,
  parseReviewStudySnapshot,
  sourceQueryPlan,
  type ReviewConceptGroup,
} from "./review-study";

const groups: ReviewConceptGroup[] = [
  { id: "population", label: "Population", facet: "population", terms: ["computer science education", "CSEd"] },
  { id: "intervention", label: "Intervention", facet: "intervention", terms: ["artificial intelligence", "AI"] },
];

describe("review study protocol", () => {
  it("builds portable and source-specific title/abstract queries", () => {
    const logical = buildLogicalQuery(groups);
    expect(logical).toBe('("computer science education" OR CSEd) AND ("artificial intelligence" OR AI)');
    expect(
      sourceQueryPlan(
        { id: "scopus", name: "Scopus", url: "https://scopus.com", dialect: "scopus", fieldScope: "title-abstract" },
        logical,
      ),
    ).toEqual({ sourceId: "scopus", query: `TITLE-ABS(${logical})`, diagnostics: [] });
    expect(
      sourceQueryPlan({ id: "manual", name: "Manual", url: "", dialect: "generic", fieldScope: "title-abstract" }, logical).diagnostics,
    ).toContain("Generic syntax cannot guarantee the requested field scope; verify it in the source UI.");
  });

  it("calibrates recall against known relevant studies", () => {
    expect(
      calibrateKnownStudies(groups, [
        { id: "hit", title: "AI in computer science education", abstract: "" },
        { id: "miss", title: "AI tutors", abstract: "Education broadly" },
      ]),
    ).toEqual({ total: 2, matched: 1, missedStudyIds: ["miss"] });
  });

  it("materializes immutable derived protocol details", () => {
    const content = {
      ...defaultReviewProtocol("mlr"),
      objective: "Map the evidence",
      researchQuestions: [{ id: "rq1", text: "What evidence exists?" }],
      conceptGroups: groups,
      sources: [
        {
          id: "wos",
          name: "Web of Science",
          url: "https://www.webofscience.com",
          dialect: "web-of-science" as const,
          fieldScope: "title-abstract-keywords" as const,
        },
      ],
      knownRelevantStudies: [{ id: "seed", title: "Artificial intelligence in CSEd", abstract: "" }],
    };
    const revision = materializeProtocolRevision(
      content,
      2,
      "frozen",
      "Search approved",
      "reviewer@example.com",
      "2026-07-17T00:00:00.000Z",
    );
    expect(revision).toMatchObject({ revision: 2, status: "frozen", profile: "mlr", calibration: { total: 1, matched: 1 } });
    expect(revision.sourceQueries[0]?.query).toMatch(/^TS=/u);
  });

  it("rejects malformed, duplicate, and oversized protocol content", () => {
    expect(() => parseReviewProtocolContent({ ...defaultReviewProtocol(), profile: "invalid" })).toThrow("profile");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        researchQuestions: [
          { id: "rq", text: "One" },
          { id: "RQ", text: "Two" },
        ],
      }),
    ).toThrow("unique");
    expect(() => parseReviewProtocolContent({ ...defaultReviewProtocol(), objective: "x".repeat(4_001) })).toThrow("Objective");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        sources: [{ id: "source", name: "Source", url: "javascript:alert(1)", dialect: "generic", fieldScope: "all-fields" }],
      }),
    ).toThrow("URL");
  });

  it("validates snapshot revision consistency", () => {
    const protocol = materializeProtocolRevision(defaultReviewProtocol(), 1, "draft", "Created", "owner");
    expect(parseReviewStudySnapshot({ revision: 1, protocol, protocolHistory: [protocol] }).protocol).toEqual(protocol);
    const futureProtocol = materializeProtocolRevision(defaultReviewProtocol(), 2, "draft", "Future", "owner");
    expect(() => parseReviewStudySnapshot({ revision: 1, protocol: futureProtocol, protocolHistory: [futureProtocol] })).toThrow(
      "inconsistent",
    );
  });
});
