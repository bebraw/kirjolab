import { describe, expect, it } from "vitest";
import {
  buildLogicalQuery,
  calibrateKnownStudies,
  defaultReviewMethodConfiguration,
  defaultReviewProtocol,
  materializeProtocolRevision,
  parseReviewProtocolContent,
  parseReviewReassessmentSnapshot,
  parseReviewStudySnapshot,
  sourceQueryPlan,
  type ReviewConceptGroup,
} from "./review-study";

const groups: ReviewConceptGroup[] = [
  { id: "population", label: "Population", facet: "population", terms: ["computer science education", "CSEd"] },
  { id: "intervention", label: "Intervention", facet: "intervention", terms: ["artificial intelligence", "AI"] },
];

function expectInvalidProtocol(value: unknown, message: string): void {
  expect(() => parseReviewProtocolContent(value)).toThrow(message);
}

describe("review study protocol", () => {
  it("builds portable and source-specific title/abstract queries", () => {
    const logical = buildLogicalQuery(groups);
    expect(logical).toBe('("computer science education" OR CSEd) AND ("artificial intelligence" OR AI)');
    expect(
      sourceQueryPlan(
        {
          id: "scopus",
          name: "Scopus",
          url: "https://scopus.com",
          dialect: "scopus",
          fieldScope: "title-abstract",
          sourceClass: "bibliographic-database",
          evidenceClass: "formal",
          greySourceClass: null,
        },
        logical,
      ),
    ).toEqual({ sourceId: "scopus", query: `TITLE-ABS(${logical})`, diagnostics: [] });
    expect(
      sourceQueryPlan(
        {
          id: "manual",
          name: "Manual",
          url: "",
          dialect: "generic",
          fieldScope: "title-abstract",
          sourceClass: "manual-search",
          evidenceClass: "formal",
          greySourceClass: null,
        },
        logical,
      ).diagnostics,
    ).toContain("Generic syntax cannot guarantee the requested field scope; verify it in the source UI.");
    expect(
      sourceQueryPlan(
        {
          id: "all",
          name: "All",
          url: "",
          dialect: "generic",
          fieldScope: "all-fields",
          sourceClass: "manual-search",
          evidenceClass: "formal",
          greySourceClass: null,
        },
        "",
      ),
    ).toEqual({
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
          sourceClass: "bibliographic-database" as const,
          evidenceClass: "formal" as const,
          greySourceClass: null,
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
    expect(revision.methodConfiguration).toMatchObject({
      evidenceClasses: ["formal", "grey"],
      formalGreySynthesis: { enabled: true },
    });
    expect(revision.methodConfiguration.greySourceClasses).toContain("industry");
    expect(revision.methodConfiguration.credibilityDimensions.map((dimension) => dimension.id)).toEqual([
      "authority",
      "objectivity",
      "evidence-support",
      "currency",
      "outlet-reputation",
    ]);
    expect(revision.sourceQueries[0]?.query).toMatch(/^TS=/u);
  });

  it("exposes explicit deterministic SLR and MLR method contracts", () => {
    const slr = defaultReviewMethodConfiguration("slr");
    const mlr = defaultReviewMethodConfiguration("mlr");

    expect(slr).toMatchObject({
      evidenceClasses: ["formal"],
      greySourceClasses: [],
      searchRules: [{ id: "registered-sources" }],
      stoppingRules: [{ id: "registered-searches-complete" }],
      formalGreySynthesis: { enabled: false, dimensions: [] },
    });
    expect(mlr).toMatchObject({
      evidenceClasses: ["formal", "grey"],
      formalGreySynthesis: {
        enabled: true,
        dimensions: ["evidence-class", "source-class", "credibility-dimension"],
      },
    });
    expect(defaultReviewMethodConfiguration("mlr")).toEqual(mlr);
    expect(
      parseReviewProtocolContent({
        ...defaultReviewProtocol("mlr"),
        sources: [
          {
            id: "government-guidance",
            name: "Government guidance",
            url: "https://example.test/guidance",
            dialect: "generic",
            fieldScope: "all-fields",
            sourceClass: "organization-site",
            evidenceClass: "grey",
            greySourceClass: "government",
          },
        ],
      }).sources[0],
    ).toMatchObject({ sourceClass: "organization-site", evidenceClass: "grey", greySourceClass: "government" });
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
      eligibilityCriteria: [
        {
          id: "include-empirical",
          kind: "include",
          text: "Empirical evidence",
          applicableStages: ["title-abstract", "full-text"],
        },
        { id: "exclude-scope", kind: "exclude", text: "Not in scope", applicableStages: ["title-abstract"] },
      ],
      amendmentImpact: { stages: ["full-text", "extraction"], recordIds: ["record-1", "record-2"] },
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
          type: "multiple-choice",
          values: ["Case study", "Experiment"],
          researchQuestionIds: ["rq-quality"],
          requiredness: "conditional",
          cardinality: "repeatable",
          condition: "When the study reports an empirical method",
        },
      ],
    });
    const revision = materializeProtocolRevision(content, 3, "frozen", "Peer reviewed", "owner");

    expect(revision).toMatchObject({
      screening: { reviewersPerStage: 2, blinded: true },
      modelAssistance: { mode: "human-first" },
      qualityAssessment: { minimumScore: 2 },
      eligibilityCriteria: [
        { id: "include-empirical", kind: "include", applicableStages: ["title-abstract", "full-text"] },
        { id: "exclude-scope", kind: "exclude", applicableStages: ["title-abstract"] },
      ],
      amendmentImpact: { stages: ["full-text", "extraction"], recordIds: ["record-1", "record-2"] },
      extractionFields: [
        {
          type: "multiple-choice",
          requiredness: "conditional",
          cardinality: "repeatable",
          condition: "When the study reports an empirical method",
        },
      ],
    });
    expect(revision.sourceQueries.map(({ query }) => query)).toEqual([
      expect.stringContaining('Document Title":" OR "Abstract":"'),
      expect.stringMatching(/^\[\[Abstract:/u),
    ]);
    expect(
      revision.sources.map(({ sourceClass, evidenceClass, greySourceClass }) => ({ sourceClass, evidenceClass, greySourceClass })),
    ).toEqual([
      { sourceClass: "publisher-library", evidenceClass: "formal", greySourceClass: null },
      { sourceClass: "publisher-library", evidenceClass: "formal", greySourceClass: null },
    ]);
    expect(parseReviewStudySnapshot({ revision: 3, protocol: revision, protocolHistory: [revision] })).toEqual({
      revision: 3,
      protocol: revision,
      protocolHistory: [revision],
    });
  });

  it("normalizes legacy criteria, profile defaults, and extraction schemas deterministically", () => {
    const defaults = defaultReviewProtocol("mlr");
    const legacy = {
      ...defaults,
      eligibilityCriteria: undefined,
      methodConfiguration: undefined,
      amendmentImpact: undefined,
      inclusionCriteria: ["Empirical evidence"],
      exclusionCriteria: ["Not in scope"],
      extractionFields: [
        { id: "finding", label: "Finding", type: "string", values: [], researchQuestionIds: [] },
        { id: "method", label: "Method", type: "enum", values: ["Case study"], researchQuestionIds: [] },
      ],
    };

    const first = parseReviewProtocolContent(legacy);
    const second = parseReviewProtocolContent(legacy);
    expect(first).toEqual(second);
    expect(first.eligibilityCriteria).toEqual([
      {
        id: expect.stringMatching(/^legacy-include-[a-f0-9]{8}$/u),
        kind: "include",
        text: "Empirical evidence",
        applicableStages: ["title-abstract", "full-text"],
      },
      {
        id: expect.stringMatching(/^legacy-exclude-[a-f0-9]{8}$/u),
        kind: "exclude",
        text: "Not in scope",
        applicableStages: ["title-abstract", "full-text"],
      },
    ]);
    expect(first).not.toHaveProperty("inclusionCriteria");
    expect(first).not.toHaveProperty("exclusionCriteria");
    expect(first.methodConfiguration).toEqual(defaultReviewMethodConfiguration("mlr"));
    expect(first.amendmentImpact).toBeNull();
    expect(first.extractionFields).toMatchObject([
      { type: "text", requiredness: "required", cardinality: "single", condition: null },
      { type: "single-choice", requiredness: "required", cardinality: "single", condition: null },
    ]);
  });

  it("normalizes the bounded extraction type, requiredness, and cardinality contract", () => {
    const field = (id: string, type: string, values: string[] = []) => ({
      id,
      label: id,
      type,
      values,
      researchQuestionIds: [],
      requiredness: "optional",
      cardinality: "single",
      condition: null,
    });
    const parsed = parseReviewProtocolContent({
      ...defaultReviewProtocol(),
      extractionFields: [
        field("text", "text"),
        field("integer", "integer"),
        field("decimal", "decimal"),
        field("boolean", "boolean"),
        field("date", "date"),
        field("choice", "single-choice", ["A"]),
        { ...field("choices", "multiple-choice", ["A", "B"]), cardinality: "repeatable" },
        field("source", "source-selector"),
      ],
    });

    expect(parsed.extractionFields.map(({ type }) => type)).toEqual([
      "text",
      "integer",
      "decimal",
      "boolean",
      "date",
      "single-choice",
      "multiple-choice",
      "source-selector",
    ]);
    expect(parsed.extractionFields.find(({ id }) => id === "choices")).toMatchObject({
      requiredness: "optional",
      cardinality: "repeatable",
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
        extractionFields: [
          {
            id: "kind",
            label: "Kind",
            type: "multiple-choice",
            values: [],
            researchQuestionIds: [],
            requiredness: "optional",
            cardinality: "single",
            condition: null,
          },
        ],
      }),
    ).toThrow("needs values");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        extractionFields: [
          {
            id: "year",
            label: "Year",
            type: "integer",
            values: ["2026"],
            researchQuestionIds: [],
            requiredness: "required",
            cardinality: "single",
            condition: null,
          },
        ],
      }),
    ).toThrow("Only controlled-choice");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        extractionFields: [
          {
            id: "finding",
            label: "Finding",
            type: "text",
            values: [],
            researchQuestionIds: ["missing"],
            requiredness: "conditional",
            cardinality: "repeatable",
            condition: "When reported",
          },
        ],
      }),
    ).toThrow("unavailable research question");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        extractionFields: [
          {
            id: "finding",
            label: "Finding",
            type: "text",
            values: [],
            researchQuestionIds: [],
            requiredness: "conditional",
            cardinality: "single",
            condition: null,
          },
        ],
      }),
    ).toThrow("needs a condition");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        eligibilityCriteria: [
          { id: "criterion", kind: "include", text: "One", applicableStages: ["title-abstract"] },
          { id: "CRITERION", kind: "exclude", text: "Two", applicableStages: ["full-text"] },
        ],
      }),
    ).toThrow("unique");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol("mlr"),
        methodConfiguration: defaultReviewMethodConfiguration("slr"),
      }),
    ).toThrow("MLR method configuration");
    expect(() =>
      parseReviewProtocolContent({
        ...defaultReviewProtocol(),
        amendmentImpact: { stages: [], recordIds: [] },
      }),
    ).toThrow("must name");
  });

  it("rejects malformed nested protocol contracts", () => {
    const protocol = defaultReviewProtocol();
    const mlr = defaultReviewProtocol("mlr");

    expect(() => parseReviewProtocolContent({ ...protocol, picoc: null })).toThrow("PICOC");
    expect(() => parseReviewProtocolContent({ ...protocol, researchQuestions: [null] })).toThrow("Research question");
    expect(() => parseReviewProtocolContent({ ...protocol, conceptGroups: [null] })).toThrow("Concept group");
    expect(() =>
      parseReviewProtocolContent({
        ...protocol,
        conceptGroups: [{ id: "group", label: "Group", facet: "invalid", terms: [] }],
      }),
    ).toThrow("PICOC facet");
    expect(() => parseReviewProtocolContent({ ...protocol, sources: [null] })).toThrow("Search source");
    expect(() =>
      parseReviewProtocolContent({
        ...protocol,
        sources: [{ id: "source", name: "Source", url: "", dialect: "invalid", fieldScope: "all-fields" }],
      }),
    ).toThrow("syntax");
    expect(() =>
      parseReviewProtocolContent({
        ...protocol,
        sources: [
          {
            id: "source",
            name: "Source",
            url: "",
            dialect: "generic",
            fieldScope: "all-fields",
            sourceClass: "invalid",
          },
        ],
      }),
    ).toThrow("classification");
    expect(() =>
      parseReviewProtocolContent({
        ...protocol,
        methodConfiguration: {
          ...protocol.methodConfiguration,
          sourceClasses: ["bibliographic-database"],
        },
        sources: [{ id: "source", name: "Source", url: "", dialect: "generic", fieldScope: "all-fields" }],
      }),
    ).toThrow("unavailable in the method configuration");
    expect(() =>
      parseReviewProtocolContent({
        ...mlr,
        sources: [
          {
            id: "source",
            name: "Source",
            url: "",
            dialect: "generic",
            fieldScope: "all-fields",
            sourceClass: "organization-site",
            evidenceClass: "formal",
            greySourceClass: "government",
          },
        ],
      }),
    ).toThrow("inconsistent");
    expect(() =>
      parseReviewProtocolContent({
        ...mlr,
        methodConfiguration: { ...mlr.methodConfiguration, greySourceClasses: ["industry"] },
        sources: [
          {
            id: "source",
            name: "Source",
            url: "",
            dialect: "generic",
            fieldScope: "all-fields",
            sourceClass: "organization-site",
            evidenceClass: "grey",
            greySourceClass: "government",
          },
        ],
      }),
    ).toThrow("Grey source class is unavailable");
    expect(() => parseReviewProtocolContent({ ...protocol, knownRelevantStudies: [null] })).toThrow("Known relevant study");
    expect(() => parseReviewProtocolContent({ ...protocol, screening: { reviewersPerStage: 3, blinded: false } })).toThrow(
      "Screening policy",
    );
    expect(() =>
      parseReviewProtocolContent({
        ...protocol,
        qualityAssessment: { ...protocol.qualityAssessment, questions: [null] },
      }),
    ).toThrow("Quality question");
    expect(() =>
      parseReviewProtocolContent({
        ...protocol,
        qualityAssessment: { ...protocol.qualityAssessment, minimumScore: "high" },
      }),
    ).toThrow("minimum score");
    expect(() => parseReviewProtocolContent({ ...protocol, extractionFields: [null] })).toThrow("Extraction field");
    expect(() =>
      parseReviewProtocolContent({
        ...protocol,
        extractionFields: [{ id: "field", label: "Field", type: "invalid", values: [], researchQuestionIds: [] }],
      }),
    ).toThrow("Extraction field");
    expect(() =>
      parseReviewProtocolContent({
        ...protocol,
        extractionFields: [
          {
            id: "field",
            label: "Field",
            type: "text",
            values: [],
            researchQuestionIds: [],
            requiredness: "sometimes",
            cardinality: "single",
          },
        ],
      }),
    ).toThrow("occurrence policy");
    expect(() =>
      parseReviewProtocolContent({
        ...protocol,
        extractionFields: [
          {
            id: "field",
            label: "Field",
            type: "text",
            values: [],
            researchQuestionIds: [],
            requiredness: "required",
            cardinality: "single",
            condition: "Only when applicable",
          },
        ],
      }),
    ).toThrow("Only conditional");
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

  it("parses durable amendment reassessment obligations", () => {
    expect(
      parseReviewReassessmentSnapshot({
        revision: 8,
        obligations: [
          {
            id: "obligation-1",
            amendmentProtocolRevision: 2,
            stage: "full-text",
            recordId: "record-1",
            status: "open",
            createdRevision: 7,
            completedRevision: null,
            completedAt: null,
            completedBy: null,
            completionRationale: null,
          },
          {
            id: "obligation-2",
            amendmentProtocolRevision: 2,
            stage: "reporting",
            recordId: null,
            status: "completed",
            createdRevision: 7,
            completedRevision: 8,
            completedAt: "2026-07-19T10:00:00.000Z",
            completedBy: "reviewer@example.com",
            completionRationale: "Updated the reporting outputs.",
          },
        ],
      }).obligations,
    ).toMatchObject([
      { status: "open", recordId: "record-1" },
      { status: "completed", recordId: null },
    ]);
    expect(() =>
      parseReviewReassessmentSnapshot({
        revision: 8,
        obligations: [
          {
            id: "obligation",
            amendmentProtocolRevision: 2,
            stage: "full-text",
            recordId: null,
            status: "open",
            createdRevision: 7,
            completedRevision: 8,
            completedAt: null,
            completedBy: null,
            completionRationale: null,
          },
        ],
      }),
    ).toThrow("inconsistent");
  });

  it("fails closed on protocol envelope and collection boundaries", () => {
    const protocol = defaultReviewProtocol();
    expectInvalidProtocol(null, "Review profile is invalid");
    expectInvalidProtocol([], "Review profile is invalid");
    expectInvalidProtocol({ ...protocol, profile: "other" }, "Review profile is invalid");
    expectInvalidProtocol({ ...protocol, objective: 1 }, "Objective is invalid");
    expectInvalidProtocol({ ...protocol, objective: "x".repeat(4_001) }, "Objective is invalid");
    expectInvalidProtocol({ ...protocol, picoc: [] }, "PICOC is invalid");
    expectInvalidProtocol({ ...protocol, picoc: { ...protocol.picoc, population: 1 } }, "PICOC population is invalid");
    expectInvalidProtocol({ ...protocol, researchQuestions: "invalid" }, "Review research questions are invalid");
    expectInvalidProtocol(
      { ...protocol, researchQuestions: Array.from({ length: 129 }, (_, index) => ({ id: `rq-${index}`, text: "Question" })) },
      "Review research questions are invalid",
    );
    expectInvalidProtocol({ ...protocol, researchQuestions: [{ id: "bad id", text: "Question" }] }, "Research question ID is invalid");
    expectInvalidProtocol(
      { ...protocol, conceptGroups: [{ id: "group", label: "Group", facet: null, terms: ["A", "a"] }] },
      "Concept terms must be unique",
    );
    expectInvalidProtocol({ ...protocol, sources: "invalid" }, "Review search sources are invalid");
    expectInvalidProtocol({ ...protocol, knownRelevantStudies: [null] }, "Known relevant study is invalid");
    expectInvalidProtocol(
      { ...protocol, qualityAssessment: { ...protocol.qualityAssessment, answers: "invalid" } },
      "Review quality answers are invalid",
    );
    expectInvalidProtocol(
      {
        ...protocol,
        qualityAssessment: {
          ...protocol.qualityAssessment,
          answers: [{ id: "answer", label: "Answer", weight: Number.NaN, rejects: false }],
        },
      },
      "Quality answer is invalid",
    );
    expectInvalidProtocol(
      { ...protocol, qualityAssessment: { ...protocol.qualityAssessment, minimumScore: Number.POSITIVE_INFINITY } },
      "Quality minimum score is invalid",
    );
  });

  it("enforces eligibility authority, kinds, stages, and uniqueness", () => {
    const protocol = defaultReviewProtocol();
    expectInvalidProtocol(
      {
        ...protocol,
        inclusionCriteria: ["Include"],
        exclusionCriteria: [],
        eligibilityCriteria: [{ id: "criterion", kind: "include", text: "Include", applicableStages: ["title-abstract"] }],
      },
      "Review eligibility criteria have conflicting authorities",
    );
    expectInvalidProtocol({ ...protocol, eligibilityCriteria: [null] }, "Eligibility criterion is invalid");
    expectInvalidProtocol(
      { ...protocol, eligibilityCriteria: [{ id: "criterion", kind: "other", text: "Text", applicableStages: ["title-abstract"] }] },
      "Eligibility criterion kind is invalid",
    );
    expectInvalidProtocol(
      { ...protocol, eligibilityCriteria: [{ id: "criterion", kind: "include", text: "Text", applicableStages: ["other"] }] },
      "Eligibility criterion stage is invalid",
    );
    expectInvalidProtocol(
      { ...protocol, eligibilityCriteria: [{ id: "criterion", kind: "include", text: "Text", applicableStages: [] }] },
      "Eligibility criterion needs an applicable stage",
    );
    expectInvalidProtocol(
      {
        ...protocol,
        eligibilityCriteria: [{ id: "criterion", kind: "include", text: "Text", applicableStages: ["title-abstract", "title-abstract"] }],
      },
      "Eligibility criterion stages must be unique",
    );
    expectInvalidProtocol(
      { ...protocol, inclusionCriteria: ["Same", "same"], exclusionCriteria: [], eligibilityCriteria: [] },
      "Inclusion criteria must be unique",
    );
  });

  it("enforces complete review method configuration contracts", () => {
    const protocol = defaultReviewProtocol();
    const slr = defaultReviewMethodConfiguration("slr");
    const mlr = defaultReviewMethodConfiguration("mlr");
    expectInvalidProtocol({ ...protocol, methodConfiguration: null }, "Review method configuration is invalid");
    expectInvalidProtocol({ ...protocol, methodConfiguration: { ...slr, evidenceClasses: [] } }, "Review method classes are invalid");
    expectInvalidProtocol(
      { ...protocol, methodConfiguration: { ...slr, evidenceClasses: ["formal", "formal"] } },
      "method evidence classes must be unique",
    );
    expectInvalidProtocol(
      { ...protocol, methodConfiguration: { ...slr, evidenceClasses: ["other"] } },
      "Review method evidence classes are invalid",
    );
    expectInvalidProtocol(
      { ...protocol, methodConfiguration: { ...slr, searchRules: [] } },
      "Review method requires search and stopping rules",
    );
    expectInvalidProtocol({ ...protocol, methodConfiguration: { ...slr, searchRules: [null] } }, "Search rule is invalid");
    expectInvalidProtocol(
      {
        ...protocol,
        methodConfiguration: {
          ...slr,
          searchRules: [{ id: "rule", label: "Rule", description: "Description", evidenceClasses: [] }],
        },
      },
      "Search rule needs an evidence class",
    );
    expectInvalidProtocol(
      {
        ...protocol,
        methodConfiguration: {
          ...slr,
          searchRules: [{ id: "rule", label: "Rule", description: "Description", evidenceClasses: ["grey"] }],
        },
      },
      "Search rule evidence class is unavailable in the method configuration",
    );
    expectInvalidProtocol(
      { ...protocol, methodConfiguration: { ...slr, formalGreySynthesis: null } },
      "Formal-versus-grey synthesis configuration is invalid",
    );
    expectInvalidProtocol(
      {
        ...protocol,
        methodConfiguration: { ...slr, formalGreySynthesis: { enabled: false, dimensions: ["source-class"] } },
      },
      "Disabled formal-versus-grey synthesis cannot define dimensions",
    );
    expectInvalidProtocol(
      { ...protocol, methodConfiguration: { ...slr, evidenceClasses: ["formal", "grey"] } },
      "SLR method configuration cannot enable grey evidence",
    );
    expectInvalidProtocol(
      { ...defaultReviewProtocol("mlr"), methodConfiguration: { ...mlr, credibilityDimensions: [] } },
      "MLR method configuration requires formal, grey, and credibility configuration",
    );
    expectInvalidProtocol(
      {
        ...defaultReviewProtocol("mlr"),
        methodConfiguration: { ...mlr, formalGreySynthesis: { enabled: true, dimensions: [] } },
      },
      "Formal-versus-grey synthesis requires both evidence classes and a dimension",
    );
  });

  it("validates snapshot and reassessment fields at their exact boundaries", () => {
    const protocol = materializeProtocolRevision(defaultReviewProtocol(), 1, "draft", "Created", "owner");
    expect(() => parseReviewStudySnapshot(null)).toThrow("Review study snapshot is invalid");
    expect(() => parseReviewStudySnapshot({ revision: 0, protocol, protocolHistory: [protocol] })).toThrow(
      "Review study snapshot is invalid",
    );
    expect(() => parseReviewStudySnapshot({ revision: 1, protocol, protocolHistory: null })).toThrow("Review protocol history is invalid");
    expect(() =>
      parseReviewStudySnapshot({ revision: 1, protocol: { ...protocol, status: "other" }, protocolHistory: [protocol] }),
    ).toThrow("Review protocol revision is invalid");
    expect(() => parseReviewReassessmentSnapshot(null)).toThrow("Review reassessment snapshot is invalid");
    expect(() => parseReviewReassessmentSnapshot({ revision: 0, obligations: [] })).toThrow("Review reassessment snapshot is invalid");
    expect(() => parseReviewReassessmentSnapshot({ revision: 1, obligations: null })).toThrow(
      "Review reassessment obligations are invalid",
    );
    expect(() => parseReviewReassessmentSnapshot({ revision: 1, obligations: [null] })).toThrow(
      "Review reassessment obligation is invalid",
    );
    expect(() =>
      parseReviewReassessmentSnapshot({
        revision: 1,
        obligations: [
          {
            id: "obligation",
            amendmentProtocolRevision: 0,
            stage: "full-text",
            recordId: null,
            status: "open",
            createdRevision: 1,
            completedRevision: null,
            completedAt: null,
            completedBy: null,
            completionRationale: null,
          },
        ],
      }),
    ).toThrow("Amendment protocol revision is invalid");
  });

  it("validates every nested protocol text and identifier contract", () => {
    const protocol = defaultReviewProtocol();
    const invalidCases: Array<readonly [unknown, string]> = [
      [{ ...protocol, researchQuestions: [{ id: "", text: "Question" }] }, "Research question ID is invalid"],
      [{ ...protocol, researchQuestions: [{ id: "rq", text: "" }] }, "Research question is invalid"],
      [{ ...protocol, conceptGroups: [{ id: "", label: "Group", facet: null, terms: [] }] }, "Concept group ID is invalid"],
      [{ ...protocol, conceptGroups: [{ id: "group", label: "", facet: null, terms: [] }] }, "Concept group label is invalid"],
      [{ ...protocol, conceptGroups: [{ id: "group", label: "Group", facet: null, terms: [""] }] }, "Concept term is invalid"],
      [
        {
          ...protocol,
          sources: [{ id: "", name: "Source", url: "", dialect: "generic", fieldScope: "all-fields" }],
        },
        "Search source ID is invalid",
      ],
      [
        {
          ...protocol,
          sources: [{ id: "source", name: "", url: "", dialect: "generic", fieldScope: "all-fields" }],
        },
        "Search source name is invalid",
      ],
      [
        {
          ...protocol,
          knownRelevantStudies: [{ id: "", title: "Study", abstract: "" }],
        },
        "Known relevant study ID is invalid",
      ],
      [
        {
          ...protocol,
          knownRelevantStudies: [{ id: "study", title: "", abstract: "" }],
        },
        "Known relevant study title is invalid",
      ],
      [
        {
          ...protocol,
          knownRelevantStudies: [{ id: "study", title: "Study", abstract: "x".repeat(20_001) }],
        },
        "Known relevant study abstract is invalid",
      ],
      [
        {
          ...protocol,
          qualityAssessment: { ...protocol.qualityAssessment, questions: [{ id: "", text: "Question" }] },
        },
        "Quality question ID is invalid",
      ],
      [
        {
          ...protocol,
          qualityAssessment: { ...protocol.qualityAssessment, questions: [{ id: "question", text: "" }] },
        },
        "Quality question is invalid",
      ],
      [
        {
          ...protocol,
          qualityAssessment: {
            ...protocol.qualityAssessment,
            answers: [{ id: "", label: "Answer", weight: 0, rejects: false }],
          },
        },
        "Quality answer ID is invalid",
      ],
      [
        {
          ...protocol,
          qualityAssessment: {
            ...protocol.qualityAssessment,
            answers: [{ id: "answer", label: "", weight: 0, rejects: false }],
          },
        },
        "Quality answer label is invalid",
      ],
      [
        {
          ...protocol,
          extractionFields: [
            {
              id: "",
              label: "Field",
              type: "text",
              values: [],
              researchQuestionIds: [],
              requiredness: "required",
              cardinality: "single",
              condition: null,
            },
          ],
        },
        "Extraction field ID is invalid",
      ],
      [
        {
          ...protocol,
          extractionFields: [
            {
              id: "field",
              label: "",
              type: "text",
              values: [],
              researchQuestionIds: [],
              requiredness: "required",
              cardinality: "single",
              condition: null,
            },
          ],
        },
        "Extraction field label is invalid",
      ],
    ];
    for (const [value, message] of invalidCases) expectInvalidProtocol(value, message);
  });

  it("distinguishes exact query dialect, scope, escaping, and calibration behavior", () => {
    expect(buildLogicalQuery([{ id: "empty", label: "Empty", facet: null, terms: [] }])).toBe("");
    expect(buildLogicalQuery([{ id: "escaped", label: "Escaped", facet: null, terms: ['a\\b "c"'] }])).toBe('("a\\\\b \\"c\\"")');
    const source = {
      id: "source",
      name: "Source",
      url: "",
      sourceClass: "bibliographic-database",
      evidenceClass: "formal",
      greySourceClass: null,
    } as const;
    expect(sourceQueryPlan({ ...source, dialect: "scopus", fieldScope: "title-abstract-keywords" }, "term").query).toBe(
      "TITLE-ABS-KEY(term)",
    );
    expect(sourceQueryPlan({ ...source, dialect: "web-of-science", fieldScope: "title-abstract" }, "term").query).toBe("TI=(term)");
    expect(sourceQueryPlan({ ...source, dialect: "web-of-science", fieldScope: "title-abstract-keywords" }, "term").query).toBe(
      "TS=(term)",
    );
    expect(sourceQueryPlan({ ...source, dialect: "ieee-xplore", fieldScope: "title-abstract" }, '"term"').query).toBe(
      '"Document Title":" OR "Abstract":"\\"term\\""',
    );
    expect(sourceQueryPlan({ ...source, dialect: "ieee-xplore", fieldScope: "title-abstract-keywords" }, "term").query).toBe(
      '"All Metadata":"term"',
    );
    expect(sourceQueryPlan({ ...source, dialect: "acm-dl", fieldScope: "title-abstract" }, "term").query).toBe("[[Title: term]]");
    expect(sourceQueryPlan({ ...source, dialect: "acm-dl", fieldScope: "title-abstract-keywords" }, "term").query).toBe(
      "[[Abstract: term]]",
    );
    expect(sourceQueryPlan({ ...source, dialect: "scopus", fieldScope: "all-fields" }, "term").query).toBe("term");
    expect(
      calibrateKnownStudies(
        [{ id: "group", label: "Group", facet: null, terms: ["Alpha", "Beta"] }],
        [
          { id: "matched", title: "ALPHA result", abstract: "" },
          { id: "missed", title: "Gamma", abstract: "" },
        ],
      ),
    ).toEqual({ total: 2, matched: 1, missedStudyIds: ["missed"] });
  });

  it("requires each completed reassessment field and rejects each open completion field", () => {
    const base = {
      id: "obligation",
      amendmentProtocolRevision: 1,
      stage: "full-text",
      recordId: null,
      createdRevision: 1,
    } as const;
    const completed = {
      ...base,
      status: "completed",
      completedRevision: 2,
      completedAt: "2026-07-19T10:00:00.000Z",
      completedBy: "reviewer@example.com",
      completionRationale: "Done",
    };
    for (const field of ["completedRevision", "completedAt", "completedBy", "completionRationale"] as const) {
      expect(() =>
        parseReviewReassessmentSnapshot({
          revision: 2,
          obligations: [{ ...completed, [field]: null }],
        }),
      ).toThrow("Review reassessment completion is inconsistent");
    }
    expect(() =>
      parseReviewReassessmentSnapshot({
        revision: 2,
        obligations: [{ ...completed, status: "open" }],
      }),
    ).toThrow("Review reassessment completion is inconsistent");
    expect(() =>
      parseReviewReassessmentSnapshot({
        revision: 2,
        obligations: [{ ...completed, stage: "unknown" }],
      }),
    ).toThrow("Review reassessment obligation is invalid");
  });
});
