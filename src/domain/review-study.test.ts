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
    expect(sourceQueryPlan({ id: "all", name: "All", url: "", dialect: "generic", fieldScope: "all-fields" }, "")).toEqual({
      sourceId: "all",
      query: "",
      diagnostics: ["Add at least one concept term before running this query."],
    });
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

  it("round-trips the complete protocol contract and renders every supported source dialect", () => {
    const content = parseReviewProtocolContent({
      ...defaultReviewProtocol(),
      objective: "Review evidence transparently",
      picoc: {
        population: "Software teams",
        intervention: "AI assistants",
        comparison: "Manual work",
        outcome: "Quality",
        context: "Industry",
      },
      researchQuestions: [{ id: "rq-quality", text: "How does quality change?" }],
      conceptGroups: [{ id: "tools", label: "AI tools", facet: null, terms: ['agentic "AI"', "copilot\\tool"] }],
      sources: [
        { id: "ieee", name: "IEEE Xplore", url: "https://ieeexplore.ieee.org", dialect: "ieee-xplore", fieldScope: "title-abstract" },
        { id: "acm", name: "ACM DL", url: "https://dl.acm.org", dialect: "acm-dl", fieldScope: "title-abstract-keywords" },
      ],
      inclusionCriteria: ["Empirical evidence"],
      exclusionCriteria: ["Not in scope"],
      screening: { reviewersPerStage: 2, blinded: true },
      modelAssistance: { mode: "human-first" },
      qualityAssessment: {
        questions: [{ id: "qa-method", text: "Is the method credible?" }],
        answers: [{ id: "pass", label: "Pass", weight: 2, rejects: false }],
        minimumScore: 2,
      },
      extractionFields: [
        {
          id: "study-type",
          label: "Study type",
          type: "enum",
          values: ["Case study", "Experiment"],
          researchQuestionIds: ["rq-quality"],
        },
      ],
    });
    const revision = materializeProtocolRevision(content, 3, "frozen", "Peer reviewed", "owner");

    expect(revision).toMatchObject({
      screening: { reviewersPerStage: 2, blinded: true },
      modelAssistance: { mode: "human-first" },
      qualityAssessment: { minimumScore: 2 },
    });
    expect(revision.sourceQueries.map(({ query }) => query)).toEqual([
      expect.stringContaining('Document Title":" OR "Abstract":"'),
      expect.stringMatching(/^\[\[Abstract:/u),
    ]);
    expect(parseReviewStudySnapshot({ revision: 3, protocol: revision, protocolHistory: [revision] })).toEqual({
      revision: 3,
      protocol: revision,
      protocolHistory: [revision],
    });
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
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        modelAssistance: { mode: "automatic" },
      }),
    ).toThrow("Model assistance");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        qualityAssessment: { questions: [], answers: [{ id: "bad", label: "Bad", weight: 101, rejects: false }], minimumScore: null },
      }),
    ).toThrow("Quality answer");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        extractionFields: [{ id: "kind", label: "Kind", type: "enum", values: [], researchQuestionIds: [] }],
      }),
    ).toThrow("needs values");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        extractionFields: [{ id: "year", label: "Year", type: "integer", values: ["2026"], researchQuestionIds: [] }],
      }),
    ).toThrow("Only enum");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        extractionFields: [{ id: "finding", label: "Finding", type: "string", values: [], researchQuestionIds: ["missing"] }],
      }),
    ).toThrow("unavailable research question");
  });

  it("validates snapshot revision consistency", () => {
    const protocol = materializeProtocolRevision(defaultReviewProtocol(), 1, "draft", "Created", "owner");
    expect(parseReviewStudySnapshot({ revision: 1, protocol, protocolHistory: [protocol] }).protocol).toEqual(protocol);
    const futureProtocol = materializeProtocolRevision(defaultReviewProtocol(), 2, "draft", "Future", "owner");
    expect(() => parseReviewStudySnapshot({ revision: 1, protocol: futureProtocol, protocolHistory: [futureProtocol] })).toThrow(
      "inconsistent",
    );
    expect(() => parseReviewStudySnapshot({ revision: 1, protocol, protocolHistory: [] })).toThrow("history");
    expect(() => materializeProtocolRevision(defaultReviewProtocol(), 0, "draft", "Invalid", "owner")).toThrow("revision");
  });
});
