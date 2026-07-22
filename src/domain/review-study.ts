const reviewStudyLimits = {
  researchQuestions: 128,
  conceptGroups: 128,
  termsPerGroup: 128,
  sources: 128,
  knownRelevantStudies: 256,
  eligibilityCriteria: 256,
  methodRules: 128,
  credibilityDimensions: 64,
  extractionFields: 512,
  amendmentRecordIds: 50_000,
} as const;

export type ReviewProfile = "slr" | "mlr";
export type ProtocolStatus = "draft" | "frozen";
export type PicocFacet = "population" | "intervention" | "comparison" | "outcome" | "context";
export type SearchDialect = "generic" | "scopus" | "web-of-science" | "ieee-xplore" | "acm-dl";
export type SearchFieldScope = "all-fields" | "title-abstract" | "title-abstract-keywords";
export type ReviewModelAssistanceMode = "off" | "human-first" | "assisted";
export type ReviewEligibilityKind = "include" | "exclude";
export type ReviewEligibilityStage = "title-abstract" | "full-text";
export type ReviewEvidenceClass = "formal" | "grey";
export type ReviewSourceClass =
  | "bibliographic-database"
  | "publisher-library"
  | "citation-search"
  | "manual-search"
  | "web-search"
  | "organization-site"
  | "grey-repository";
export type ReviewGreySourceClass =
  | "government"
  | "industry"
  | "professional-association"
  | "research-institute"
  | "community"
  | "news-media"
  | "other";
export type ReviewProtocolImpactStage =
  | "search"
  | "deduplication"
  | "title-abstract"
  | "full-text"
  | "appraisal"
  | "extraction"
  | "synthesis"
  | "reporting";
export type ExtractionFieldType =
  | "text"
  | "integer"
  | "decimal"
  | "boolean"
  | "date"
  | "single-choice"
  | "multiple-choice"
  | "source-selector";
export type ExtractionFieldRequiredness = "required" | "optional" | "conditional";
export type ExtractionFieldCardinality = "single" | "repeatable";

export interface ReviewResearchQuestion {
  readonly id: string;
  readonly text: string;
}

export interface ReviewConceptGroup {
  readonly id: string;
  readonly label: string;
  readonly facet: PicocFacet | null;
  readonly terms: readonly string[];
}

export interface ReviewSearchSource {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly dialect: SearchDialect;
  readonly fieldScope: SearchFieldScope;
  readonly sourceClass: ReviewSourceClass;
  readonly evidenceClass: ReviewEvidenceClass;
  readonly greySourceClass: ReviewGreySourceClass | null;
}

export interface KnownRelevantStudy {
  readonly id: string;
  readonly title: string;
  readonly abstract: string;
}

export interface QualityQuestion {
  readonly id: string;
  readonly text: string;
}

export interface QualityAnswerOption {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly rejects: boolean;
}

export interface ReviewEligibilityCriterion {
  readonly id: string;
  readonly kind: ReviewEligibilityKind;
  readonly text: string;
  readonly applicableStages: readonly ReviewEligibilityStage[];
}

export interface ReviewMethodRule {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly evidenceClasses: readonly ReviewEvidenceClass[];
}

export interface ReviewCredibilityDimension {
  readonly id: string;
  readonly label: string;
  readonly guidance: string;
  readonly evidenceClasses: readonly ReviewEvidenceClass[];
}

export interface ReviewMethodConfiguration {
  readonly evidenceClasses: readonly ReviewEvidenceClass[];
  readonly sourceClasses: readonly ReviewSourceClass[];
  readonly greySourceClasses: readonly ReviewGreySourceClass[];
  readonly searchRules: readonly ReviewMethodRule[];
  readonly stoppingRules: readonly ReviewMethodRule[];
  readonly credibilityDimensions: readonly ReviewCredibilityDimension[];
  readonly formalGreySynthesis: {
    readonly enabled: boolean;
    readonly dimensions: readonly ("evidence-class" | "source-class" | "credibility-dimension")[];
  };
}

export interface ReviewProtocolAmendmentImpact {
  readonly stages: readonly ReviewProtocolImpactStage[];
  readonly recordIds: readonly string[];
}

export interface ExtractionFieldDefinition {
  readonly id: string;
  readonly label: string;
  readonly type: ExtractionFieldType;
  readonly values: readonly string[];
  readonly researchQuestionIds: readonly string[];
  readonly requiredness: ExtractionFieldRequiredness;
  readonly cardinality: ExtractionFieldCardinality;
  readonly condition: string | null;
}

export interface SourceQueryPlan {
  readonly sourceId: string;
  readonly query: string;
  readonly diagnostics: readonly string[];
}

export interface QueryCalibrationResult {
  readonly total: number;
  readonly matched: number;
  readonly missedStudyIds: readonly string[];
}

export interface ReviewProtocolContent {
  readonly profile: ReviewProfile;
  readonly objective: string;
  readonly picoc: Readonly<Record<PicocFacet, string>>;
  readonly researchQuestions: readonly ReviewResearchQuestion[];
  readonly conceptGroups: readonly ReviewConceptGroup[];
  readonly sources: readonly ReviewSearchSource[];
  readonly knownRelevantStudies: readonly KnownRelevantStudy[];
  readonly eligibilityCriteria: readonly ReviewEligibilityCriterion[];
  readonly methodConfiguration: ReviewMethodConfiguration;
  readonly amendmentImpact: ReviewProtocolAmendmentImpact | null;
  readonly screening: {
    readonly reviewersPerStage: 1 | 2;
    readonly blinded: boolean;
  };
  readonly modelAssistance: {
    readonly mode: ReviewModelAssistanceMode;
  };
  readonly qualityAssessment: {
    readonly questions: readonly QualityQuestion[];
    readonly answers: readonly QualityAnswerOption[];
    readonly minimumScore: number | null;
  };
  readonly extractionFields: readonly ExtractionFieldDefinition[];
}

export interface ReviewProtocolRevision extends ReviewProtocolContent {
  readonly revision: number;
  readonly status: ProtocolStatus;
  readonly rationale: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly logicalQuery: string;
  readonly sourceQueries: readonly SourceQueryPlan[];
  readonly calibration: QueryCalibrationResult;
}

export interface ReviewStudySnapshot {
  readonly revision: number;
  readonly protocol: ReviewProtocolRevision;
  readonly protocolHistory: readonly ReviewProtocolRevision[];
}

export interface ReviewReassessmentObligation {
  readonly id: string;
  readonly amendmentProtocolRevision: number;
  readonly stage: ReviewProtocolImpactStage;
  readonly recordId: string | null;
  readonly status: "open" | "completed";
  readonly createdRevision: number;
  readonly completedRevision: number | null;
  readonly completedAt: string | null;
  readonly completedBy: string | null;
  readonly completionRationale: string | null;
}

export interface ReviewReassessmentSnapshot {
  readonly revision: number;
  readonly obligations: readonly ReviewReassessmentObligation[];
}

const facets = ["population", "intervention", "comparison", "outcome", "context"] as const;
const dialects = ["generic", "scopus", "web-of-science", "ieee-xplore", "acm-dl"] as const;
const scopes = ["all-fields", "title-abstract", "title-abstract-keywords"] as const;
const eligibilityKinds = ["include", "exclude"] as const;
const eligibilityStages = ["title-abstract", "full-text"] as const;
const evidenceClasses = ["formal", "grey"] as const;
const sourceClasses = [
  "bibliographic-database",
  "publisher-library",
  "citation-search",
  "manual-search",
  "web-search",
  "organization-site",
  "grey-repository",
] as const;
const greySourceClasses = [
  "government",
  "industry",
  "professional-association",
  "research-institute",
  "community",
  "news-media",
  "other",
] as const;
const protocolImpactStages = [
  "search",
  "deduplication",
  "title-abstract",
  "full-text",
  "appraisal",
  "extraction",
  "synthesis",
  "reporting",
] as const;
const extractionFieldTypes = [
  "text",
  "integer",
  "decimal",
  "boolean",
  "date",
  "single-choice",
  "multiple-choice",
  "source-selector",
] as const;
const extractionRequiredness = ["required", "optional", "conditional"] as const;
const extractionCardinalities = ["single", "repeatable"] as const;
const formalGreyDimensions = ["evidence-class", "source-class", "credibility-dimension"] as const;

export function defaultReviewProtocol(profile: ReviewProfile = "slr"): ReviewProtocolContent {
  return {
    profile,
    objective: "",
    picoc: { population: "", intervention: "", comparison: "", outcome: "", context: "" },
    researchQuestions: [],
    conceptGroups: [],
    sources: [],
    knownRelevantStudies: [],
    eligibilityCriteria: [],
    methodConfiguration: defaultReviewMethodConfiguration(profile),
    amendmentImpact: null,
    screening: { reviewersPerStage: 1, blinded: false },
    modelAssistance: { mode: "off" },
    qualityAssessment: {
      questions: [],
      answers: [
        { id: "yes", label: "Yes", weight: 1, rejects: false },
        { id: "partly", label: "Partly", weight: 0.5, rejects: false },
        { id: "no", label: "No", weight: 0, rejects: false },
        { id: "reject", label: "Reject", weight: 0, rejects: true },
      ],
      minimumScore: null,
    },
    extractionFields: [],
  };
}

export function defaultReviewMethodConfiguration(profile: ReviewProfile): ReviewMethodConfiguration {
  const registeredSourcesRule: ReviewMethodRule = {
    id: "registered-sources",
    label: "Registered sources",
    description: "Search every registered source using its frozen source query.",
    evidenceClasses: profile === "mlr" ? ["formal", "grey"] : ["formal"],
  };
  const registeredSearchesComplete: ReviewMethodRule = {
    id: "registered-searches-complete",
    label: "Registered searches complete",
    description: "Stop after every registered search and documented update search is complete.",
    evidenceClasses: profile === "mlr" ? ["formal", "grey"] : ["formal"],
  };
  if (profile === "slr") {
    return {
      evidenceClasses: ["formal"],
      sourceClasses: ["bibliographic-database", "publisher-library", "citation-search", "manual-search"],
      greySourceClasses: [],
      searchRules: [registeredSourcesRule],
      stoppingRules: [registeredSearchesComplete],
      credibilityDimensions: [],
      formalGreySynthesis: { enabled: false, dimensions: [] },
    };
  }
  return {
    evidenceClasses: ["formal", "grey"],
    sourceClasses: [
      "bibliographic-database",
      "publisher-library",
      "citation-search",
      "manual-search",
      "web-search",
      "organization-site",
      "grey-repository",
    ],
    greySourceClasses: ["government", "industry", "professional-association", "research-institute", "community", "news-media", "other"],
    searchRules: [
      registeredSourcesRule,
      {
        id: "documented-grey-search",
        label: "Documented grey search",
        description: "Record every grey-literature search route and exact executed query.",
        evidenceClasses: ["grey"],
      },
    ],
    stoppingRules: [
      registeredSearchesComplete,
      {
        id: "documented-grey-stopping",
        label: "Documented grey stopping",
        description: "Apply and report the registered grey-literature stopping condition.",
        evidenceClasses: ["grey"],
      },
    ],
    credibilityDimensions: [
      credibilityDimension("authority", "Authority", "Assess the identifiable authority and relevant expertise."),
      credibilityDimension("objectivity", "Objectivity", "Assess purpose, interests, and balance."),
      credibilityDimension("evidence-support", "Evidence support", "Assess whether claims are supported by inspectable evidence."),
      credibilityDimension("currency", "Currency", "Assess whether publication timing is suitable for the review question."),
      credibilityDimension("outlet-reputation", "Outlet reputation", "Assess the accountability and reputation of the outlet."),
    ],
    formalGreySynthesis: {
      enabled: true,
      dimensions: ["evidence-class", "source-class", "credibility-dimension"],
    },
  };
}

export function parseReviewProtocolContent(value: unknown): ReviewProtocolContent {
  if (!isRecord(value) || (value.profile !== "slr" && value.profile !== "mlr")) throw new Error("Review profile is invalid");
  const objective = boundedText(value.objective, "Objective", 4_000, true);
  if (!isRecord(value.picoc)) throw new Error("PICOC is invalid");
  const picocValue = value.picoc;
  const picoc = Object.fromEntries(facets.map((facet) => [facet, boundedText(picocValue[facet], `PICOC ${facet}`, 1_000, true)])) as Record<
    PicocFacet,
    string
  >;
  const methodConfiguration = parseReviewMethodConfiguration(value.methodConfiguration, value.profile);
  const researchQuestions = parseArray(value.researchQuestions, reviewStudyLimits.researchQuestions, "research questions", (item) => {
    if (!isRecord(item)) throw new Error("Research question is invalid");
    return { id: stableId(item.id, "Research question"), text: boundedText(item.text, "Research question", 2_000) };
  });
  const conceptGroups = parseArray(value.conceptGroups, reviewStudyLimits.conceptGroups, "concept groups", (item) => {
    if (!isRecord(item)) throw new Error("Concept group is invalid");
    const facet = item.facet === null ? null : facets.find((candidate) => candidate === item.facet);
    if (facet === undefined) throw new Error("Concept group PICOC facet is invalid");
    const terms = parseArray(item.terms, reviewStudyLimits.termsPerGroup, "concept terms", (term) =>
      boundedText(term, "Concept term", 300),
    );
    uniqueStrings(terms, "Concept terms");
    return { id: stableId(item.id, "Concept group"), label: boundedText(item.label, "Concept group label", 200), facet, terms };
  });
  const sources = parseArray(value.sources, reviewStudyLimits.sources, "search sources", (item) => {
    if (!isRecord(item)) throw new Error("Search source is invalid");
    const dialect = dialects.find((candidate) => candidate === item.dialect);
    const fieldScope = scopes.find((candidate) => candidate === item.fieldScope);
    if (!dialect || !fieldScope) throw new Error("Search source syntax is invalid");
    const sourceClass =
      item.sourceClass === undefined ? legacySourceClass(dialect) : sourceClasses.find((candidate) => candidate === item.sourceClass);
    const evidenceClass =
      item.evidenceClass === undefined ? "formal" : evidenceClasses.find((candidate) => candidate === item.evidenceClass);
    const greySourceClass =
      item.greySourceClass === undefined || item.greySourceClass === null
        ? null
        : greySourceClasses.find((candidate) => candidate === item.greySourceClass);
    if (!sourceClass || !evidenceClass || (item.greySourceClass !== undefined && item.greySourceClass !== null && !greySourceClass)) {
      throw new Error("Search source classification is invalid");
    }
    const normalizedGreySourceClass = greySourceClass ?? null;
    if (!methodConfiguration.sourceClasses.includes(sourceClass) || !methodConfiguration.evidenceClasses.includes(evidenceClass)) {
      throw new Error("Search source classification is unavailable in the method configuration");
    }
    if (
      (evidenceClass === "grey" && normalizedGreySourceClass === null) ||
      (evidenceClass === "formal" && normalizedGreySourceClass !== null)
    ) {
      throw new Error("Grey source classification is inconsistent with its evidence class");
    }
    if (normalizedGreySourceClass !== null && !methodConfiguration.greySourceClasses.includes(normalizedGreySourceClass)) {
      throw new Error("Grey source class is unavailable in the method configuration");
    }
    const url = boundedText(item.url, "Search source URL", 2_000, true);
    if (url) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Search source URL is invalid");
    }
    return {
      id: stableId(item.id, "Search source"),
      name: boundedText(item.name, "Search source name", 200),
      url,
      dialect,
      fieldScope,
      sourceClass,
      evidenceClass,
      greySourceClass: normalizedGreySourceClass,
    };
  });
  const knownRelevantStudies = parseArray(
    value.knownRelevantStudies,
    reviewStudyLimits.knownRelevantStudies,
    "known relevant studies",
    (item) => {
      if (!isRecord(item)) throw new Error("Known relevant study is invalid");
      return {
        id: stableId(item.id, "Known relevant study"),
        title: boundedText(item.title, "Known relevant study title", 1_000),
        abstract: boundedText(item.abstract, "Known relevant study abstract", 20_000, true),
      };
    },
  );
  const eligibilityCriteria = parseEligibilityCriteria(value);
  const amendmentImpact = parseAmendmentImpact(value.amendmentImpact);
  const screeningValue = isRecord(value.screening) ? value.screening : { reviewersPerStage: 1, blinded: false };
  if ((screeningValue.reviewersPerStage !== 1 && screeningValue.reviewersPerStage !== 2) || typeof screeningValue.blinded !== "boolean") {
    throw new Error("Screening policy is invalid");
  }
  const modelAssistanceValue = isRecord(value.modelAssistance) ? value.modelAssistance : { mode: "off" };
  if (modelAssistanceValue.mode !== "off" && modelAssistanceValue.mode !== "human-first" && modelAssistanceValue.mode !== "assisted") {
    throw new Error("Model assistance mode is invalid");
  }
  const qualityValue = isRecord(value.qualityAssessment) ? value.qualityAssessment : defaultReviewProtocol().qualityAssessment;
  const qualityQuestions = parseArray(qualityValue.questions, 256, "quality questions", (item) => {
    if (!isRecord(item)) throw new Error("Quality question is invalid");
    return { id: stableId(item.id, "Quality question"), text: boundedText(item.text, "Quality question", 2_000) };
  });
  const qualityAnswers = parseArray(qualityValue.answers, 32, "quality answers", (item) => {
    if (
      !isRecord(item) ||
      typeof item.weight !== "number" ||
      !Number.isFinite(item.weight) ||
      item.weight < -100 ||
      item.weight > 100 ||
      typeof item.rejects !== "boolean"
    ) {
      throw new Error("Quality answer is invalid");
    }
    return {
      id: stableId(item.id, "Quality answer"),
      label: boundedText(item.label, "Quality answer label", 200),
      weight: item.weight,
      rejects: item.rejects,
    };
  });
  const minimumScore = qualityValue.minimumScore;
  if (minimumScore !== null && (typeof minimumScore !== "number" || !Number.isFinite(minimumScore))) {
    throw new Error("Quality minimum score is invalid");
  }
  const extractionFields = parseArray(value.extractionFields ?? [], reviewStudyLimits.extractionFields, "extraction fields", (item) => {
    if (!isRecord(item)) {
      throw new Error("Extraction field is invalid");
    }
    const type = normalizedExtractionFieldType(item.type);
    if (!type) throw new Error("Extraction field is invalid");
    const values = parseArray(item.values ?? [], 128, "extraction values", (entry) => boundedText(entry, "Extraction option", 500));
    const researchQuestionIds = parseArray(item.researchQuestionIds ?? [], 128, "extraction research questions", (entry) =>
      stableId(entry, "Extraction research question"),
    );
    const requiredness = item.requiredness === undefined ? "required" : extractionRequiredness.find((value) => value === item.requiredness);
    const cardinality = item.cardinality === undefined ? "single" : extractionCardinalities.find((value) => value === item.cardinality);
    if (!requiredness || !cardinality) throw new Error("Extraction field occurrence policy is invalid");
    const condition =
      item.condition === undefined || item.condition === null ? null : boundedText(item.condition, "Extraction condition", 2_000);
    const controlledChoice = type === "single-choice" || type === "multiple-choice";
    if (controlledChoice && values.length === 0) throw new Error("Controlled-choice extraction field needs values");
    if (!controlledChoice && values.length > 0) throw new Error("Only controlled-choice extraction fields can define values");
    if (requiredness === "conditional" && condition === null) throw new Error("Conditional extraction field needs a condition");
    if (requiredness !== "conditional" && condition !== null) throw new Error("Only conditional extraction fields can define a condition");
    uniqueStrings(values, "Extraction options");
    uniqueStrings(researchQuestionIds, "Extraction research questions");
    return {
      id: stableId(item.id, "Extraction field"),
      label: boundedText(item.label, "Extraction field label", 300),
      type,
      values,
      researchQuestionIds,
      requiredness,
      cardinality,
      condition,
    };
  });
  uniqueIds(researchQuestions, "Research questions");
  uniqueIds(conceptGroups, "Concept groups");
  uniqueIds(sources, "Search sources");
  uniqueIds(knownRelevantStudies, "Known relevant studies");
  uniqueIds(qualityQuestions, "Quality questions");
  uniqueIds(qualityAnswers, "Quality answers");
  uniqueIds(extractionFields, "Extraction fields");
  const researchQuestionIds = new Set(researchQuestions.map((question) => question.id));
  if (extractionFields.some((field) => field.researchQuestionIds.some((id) => !researchQuestionIds.has(id)))) {
    throw new Error("Extraction field references an unavailable research question");
  }
  return {
    profile: value.profile,
    objective,
    picoc,
    researchQuestions,
    conceptGroups,
    sources,
    knownRelevantStudies,
    eligibilityCriteria,
    methodConfiguration,
    amendmentImpact,
    screening: { reviewersPerStage: screeningValue.reviewersPerStage, blinded: screeningValue.blinded },
    modelAssistance: { mode: modelAssistanceValue.mode },
    qualityAssessment: { questions: qualityQuestions, answers: qualityAnswers, minimumScore },
    extractionFields,
  };
}

function parseEligibilityCriteria(value: Record<string, unknown>): ReviewEligibilityCriterion[] {
  const legacyInclusion = value.inclusionCriteria;
  const legacyExclusion = value.exclusionCriteria;
  const structuredCriteria = value.eligibilityCriteria;
  const hasLegacy = Array.isArray(legacyInclusion) || Array.isArray(legacyExclusion);
  const hasStructured = Array.isArray(structuredCriteria);
  const legacyHasEntries =
    (Array.isArray(legacyInclusion) && legacyInclusion.length > 0) || (Array.isArray(legacyExclusion) && legacyExclusion.length > 0);
  if (hasLegacy && hasStructured && structuredCriteria.length > 0 && legacyHasEntries) {
    throw new Error("Review eligibility criteria have conflicting authorities");
  }
  const criteria =
    legacyHasEntries || (hasLegacy && !hasStructured)
      ? [
          ...parseLegacyEligibilityCriteria(legacyInclusion ?? [], "include"),
          ...parseLegacyEligibilityCriteria(legacyExclusion ?? [], "exclude"),
        ]
      : parseArray(structuredCriteria ?? [], reviewStudyLimits.eligibilityCriteria, "eligibility criteria", (item) => {
          if (!isRecord(item)) throw new Error("Eligibility criterion is invalid");
          const kind = eligibilityKinds.find((candidate) => candidate === item.kind);
          if (!kind) throw new Error("Eligibility criterion kind is invalid");
          const applicableStages = parseArray(item.applicableStages, eligibilityStages.length, "eligibility stages", (stage) => {
            const parsed = eligibilityStages.find((candidate) => candidate === stage);
            if (!parsed) throw new Error("Eligibility criterion stage is invalid");
            return parsed;
          });
          if (applicableStages.length === 0) throw new Error("Eligibility criterion needs an applicable stage");
          uniqueStrings(applicableStages, "Eligibility criterion stages");
          return {
            id: stableId(item.id, "Eligibility criterion"),
            kind,
            text: boundedText(item.text, "Eligibility criterion", 1_000),
            applicableStages,
          };
        });
  if (criteria.length > reviewStudyLimits.eligibilityCriteria) throw new Error("Review eligibility criteria are invalid");
  uniqueIds(criteria, "Eligibility criteria");
  return criteria;
}

function parseLegacyEligibilityCriteria(value: unknown, kind: ReviewEligibilityKind): ReviewEligibilityCriterion[] {
  const label = kind === "include" ? "inclusion criteria" : "exclusion criteria";
  const texts = parseArray(value, reviewStudyLimits.eligibilityCriteria, label, (item) =>
    boundedText(item, kind === "include" ? "Inclusion criterion" : "Exclusion criterion", 1_000),
  );
  uniqueStrings(texts, kind === "include" ? "Inclusion criteria" : "Exclusion criteria");
  return texts.map((text) => ({
    id: `legacy-${kind}-${stableTextHash(text)}`,
    kind,
    text,
    applicableStages: ["title-abstract", "full-text"],
  }));
}

function parseReviewMethodConfiguration(value: unknown, profile: ReviewProfile): ReviewMethodConfiguration {
  if (value === undefined) return defaultReviewMethodConfiguration(profile);
  if (!isRecord(value)) throw new Error("Review method configuration is invalid");
  const configuredEvidenceClasses = parseEnumArray(value.evidenceClasses, evidenceClasses, "method evidence classes");
  const configuredSourceClasses = parseEnumArray(value.sourceClasses, sourceClasses, "method source classes");
  const configuredGreySourceClasses = parseEnumArray(value.greySourceClasses, greySourceClasses, "grey source classes");
  if (configuredEvidenceClasses.length === 0 || configuredSourceClasses.length === 0) {
    throw new Error("Review method classes are invalid");
  }
  const searchRules = parseArray(value.searchRules, reviewStudyLimits.methodRules, "method search rules", (item) =>
    parseMethodRule(item, configuredEvidenceClasses, "Search rule"),
  );
  const stoppingRules = parseArray(value.stoppingRules, reviewStudyLimits.methodRules, "method stopping rules", (item) =>
    parseMethodRule(item, configuredEvidenceClasses, "Stopping rule"),
  );
  const credibilityDimensions = parseArray(
    value.credibilityDimensions,
    reviewStudyLimits.credibilityDimensions,
    "credibility dimensions",
    (item) => {
      if (!isRecord(item)) throw new Error("Credibility dimension is invalid");
      const dimensionEvidenceClasses = parseEnumArray(item.evidenceClasses, evidenceClasses, "credibility evidence classes");
      if (dimensionEvidenceClasses.length === 0) throw new Error("Credibility dimension needs an evidence class");
      assertSubset(dimensionEvidenceClasses, configuredEvidenceClasses, "Credibility dimension evidence class");
      return {
        id: stableId(item.id, "Credibility dimension"),
        label: boundedText(item.label, "Credibility dimension label", 200),
        guidance: boundedText(item.guidance, "Credibility dimension guidance", 2_000, true),
        evidenceClasses: dimensionEvidenceClasses,
      };
    },
  );
  if (!isRecord(value.formalGreySynthesis) || typeof value.formalGreySynthesis.enabled !== "boolean") {
    throw new Error("Formal-versus-grey synthesis configuration is invalid");
  }
  const synthesisDimensions = parseEnumArray(
    value.formalGreySynthesis.dimensions,
    formalGreyDimensions,
    "formal-versus-grey synthesis dimensions",
  );
  uniqueIds(searchRules, "Search rules");
  uniqueIds(stoppingRules, "Stopping rules");
  uniqueIds(credibilityDimensions, "Credibility dimensions");
  if (searchRules.length === 0 || stoppingRules.length === 0) throw new Error("Review method requires search and stopping rules");
  if (profile === "slr" && (configuredEvidenceClasses.includes("grey") || configuredGreySourceClasses.length > 0)) {
    throw new Error("SLR method configuration cannot enable grey evidence");
  }
  if (
    profile === "mlr" &&
    (!configuredEvidenceClasses.includes("formal") ||
      !configuredEvidenceClasses.includes("grey") ||
      configuredGreySourceClasses.length === 0 ||
      credibilityDimensions.length === 0)
  ) {
    throw new Error("MLR method configuration requires formal, grey, and credibility configuration");
  }
  if (
    value.formalGreySynthesis.enabled &&
    (!configuredEvidenceClasses.includes("formal") || !configuredEvidenceClasses.includes("grey") || synthesisDimensions.length === 0)
  ) {
    throw new Error("Formal-versus-grey synthesis requires both evidence classes and a dimension");
  }
  if (!value.formalGreySynthesis.enabled && synthesisDimensions.length > 0) {
    throw new Error("Disabled formal-versus-grey synthesis cannot define dimensions");
  }
  return {
    evidenceClasses: configuredEvidenceClasses,
    sourceClasses: configuredSourceClasses,
    greySourceClasses: configuredGreySourceClasses,
    searchRules,
    stoppingRules,
    credibilityDimensions,
    formalGreySynthesis: { enabled: value.formalGreySynthesis.enabled, dimensions: synthesisDimensions },
  };
}

function parseMethodRule(value: unknown, configuredEvidenceClasses: readonly ReviewEvidenceClass[], label: string): ReviewMethodRule {
  if (!isRecord(value)) throw new Error(`${label} is invalid`);
  const ruleEvidenceClasses = parseEnumArray(value.evidenceClasses, evidenceClasses, `${label.toLocaleLowerCase()} evidence classes`);
  if (ruleEvidenceClasses.length === 0) throw new Error(`${label} needs an evidence class`);
  assertSubset(ruleEvidenceClasses, configuredEvidenceClasses, `${label} evidence class`);
  return {
    id: stableId(value.id, label),
    label: boundedText(value.label, `${label} label`, 200),
    description: boundedText(value.description, `${label} description`, 2_000),
    evidenceClasses: ruleEvidenceClasses,
  };
}

function parseAmendmentImpact(value: unknown): ReviewProtocolAmendmentImpact | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error("Protocol amendment impact is invalid");
  const stages = parseEnumArray(value.stages, protocolImpactStages, "protocol amendment stages");
  const recordIds = parseArray(value.recordIds, reviewStudyLimits.amendmentRecordIds, "protocol amendment record IDs", (item) =>
    stableId(item, "Review record"),
  );
  uniqueStrings(recordIds, "Protocol amendment record IDs");
  if (stages.length === 0 && recordIds.length === 0) throw new Error("Protocol amendment impact must name a stage or record");
  return { stages, recordIds };
}

export function materializeProtocolRevision(
  content: ReviewProtocolContent,
  revision: number,
  status: ProtocolStatus,
  rationale: string,
  createdBy: string,
  createdAt = new Date().toISOString(),
): ReviewProtocolRevision {
  const parsed = parseReviewProtocolContent(content);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Protocol revision is invalid");
  const logicalQuery = buildLogicalQuery(parsed.conceptGroups);
  return {
    ...parsed,
    revision,
    status,
    rationale: boundedText(rationale, "Protocol rationale", 2_000, true),
    createdAt,
    createdBy: boundedText(createdBy, "Protocol author", 320),
    logicalQuery,
    sourceQueries: parsed.sources.map((source) => sourceQueryPlan(source, logicalQuery)),
    calibration: calibrateKnownStudies(parsed.conceptGroups, parsed.knownRelevantStudies),
  };
}

export function parseReviewStudySnapshot(value: unknown): ReviewStudySnapshot {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) || typeof value.revision !== "number" || value.revision < 1) {
    throw new Error("Review study snapshot is invalid");
  }
  if (!Array.isArray(value.protocolHistory) || value.protocolHistory.length === 0) throw new Error("Review protocol history is invalid");
  const protocolHistory = value.protocolHistory.map(parseProtocolRevision);
  const protocol = parseProtocolRevision(value.protocol);
  if (protocol.revision > value.revision || protocolHistory.at(-1)?.revision !== protocol.revision) {
    throw new Error("Review protocol revision is inconsistent");
  }
  return { revision: value.revision, protocol, protocolHistory };
}

export function parseReviewReassessmentSnapshot(value: unknown): ReviewReassessmentSnapshot {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) || typeof value.revision !== "number" || value.revision < 1) {
    throw new Error("Review reassessment snapshot is invalid");
  }
  if (!Array.isArray(value.obligations)) throw new Error("Review reassessment obligations are invalid");
  return {
    revision: value.revision,
    obligations: value.obligations.map((item) => {
      if (!isRecord(item)) throw new Error("Review reassessment obligation is invalid");
      const stage = protocolImpactStages.find((candidate) => candidate === item.stage);
      const status = item.status === "open" || item.status === "completed" ? item.status : null;
      const amendmentProtocolRevision = positiveSafeInteger(item.amendmentProtocolRevision, "Amendment protocol revision");
      const createdRevision = positiveSafeInteger(item.createdRevision, "Reassessment creation revision");
      const completedRevision =
        item.completedRevision === null ? null : positiveSafeInteger(item.completedRevision, "Reassessment completion revision");
      const completedAt = item.completedAt === null ? null : boundedText(item.completedAt, "Reassessment completion time", 100);
      const completedBy = item.completedBy === null ? null : boundedText(item.completedBy, "Reassessment completer", 320);
      const completionRationale =
        item.completionRationale === null ? null : boundedText(item.completionRationale, "Reassessment completion rationale", 2_000);
      if (!stage || !status) throw new Error("Review reassessment obligation is invalid");
      if (
        (status === "open" &&
          (completedRevision !== null || completedAt !== null || completedBy !== null || completionRationale !== null)) ||
        (status === "completed" &&
          (completedRevision === null || completedAt === null || completedBy === null || completionRationale === null))
      ) {
        throw new Error("Review reassessment completion is inconsistent");
      }
      return {
        id: stableId(item.id, "Reassessment obligation"),
        amendmentProtocolRevision,
        stage,
        recordId: item.recordId === null ? null : stableId(item.recordId, "Review record"),
        status,
        createdRevision,
        completedRevision,
        completedAt,
        completedBy,
        completionRationale,
      };
    }),
  };
}

export function buildLogicalQuery(groups: readonly ReviewConceptGroup[]): string {
  return groups
    .filter((group) => group.terms.length > 0)
    .map((group) => `(${group.terms.map(quoteTerm).join(" OR ")})`)
    .join(" AND ");
}

export function sourceQueryPlan(source: ReviewSearchSource, logicalQuery: string): SourceQueryPlan {
  const diagnostics: string[] = [];
  if (!logicalQuery) diagnostics.push("Add at least one concept term before running this query.");
  if (source.dialect === "generic" && source.fieldScope !== "all-fields") {
    diagnostics.push("Generic syntax cannot guarantee the requested field scope; verify it in the source UI.");
  }
  const query = wrapSourceQuery(source.dialect, source.fieldScope, logicalQuery);
  return { sourceId: source.id, query, diagnostics };
}

export function calibrateKnownStudies(
  groups: readonly ReviewConceptGroup[],
  studies: readonly KnownRelevantStudy[],
): QueryCalibrationResult {
  const activeGroups = groups.filter((group) => group.terms.length > 0);
  const missedStudyIds = studies
    .filter((study) => {
      const haystack = `${study.title}\n${study.abstract}`.toLocaleLowerCase();
      return !activeGroups.every((group) => group.terms.some((term) => haystack.includes(term.toLocaleLowerCase())));
    })
    .map((study) => study.id);
  return { total: studies.length, matched: studies.length - missedStudyIds.length, missedStudyIds };
}

function wrapSourceQuery(dialect: SearchDialect, scope: SearchFieldScope, query: string): string {
  if (!query || scope === "all-fields") return query;
  if (dialect === "scopus") return `${scope === "title-abstract" ? "TITLE-ABS" : "TITLE-ABS-KEY"}(${query})`;
  if (dialect === "web-of-science") return `${scope === "title-abstract" ? "TI" : "TS"}=(${query})`;
  if (dialect === "ieee-xplore") {
    const field = scope === "title-abstract" ? 'Document Title":" OR "Abstract":"' : 'All Metadata":"';
    return `"${field}${query.replaceAll('"', '\\"')}"`;
  }
  if (dialect === "acm-dl") return `[[${scope === "title-abstract" ? "Title" : "Abstract"}: ${query}]]`;
  return query;
}

function legacySourceClass(dialect: SearchDialect): ReviewSourceClass {
  if (dialect === "scopus" || dialect === "web-of-science") return "bibliographic-database";
  if (dialect === "ieee-xplore" || dialect === "acm-dl") return "publisher-library";
  return "manual-search";
}

function parseProtocolRevision(value: unknown): ReviewProtocolRevision {
  if (
    !isRecord(value) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    (value.status !== "draft" && value.status !== "frozen") ||
    typeof value.rationale !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.createdBy !== "string"
  ) {
    throw new Error("Review protocol revision is invalid");
  }
  return materializeProtocolRevision(
    parseReviewProtocolContent(value),
    value.revision,
    value.status,
    value.rationale,
    value.createdBy,
    value.createdAt,
  );
}

function quoteTerm(term: string): string {
  const escaped = term.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return /\s/u.test(term) ? `"${escaped}"` : escaped;
}

function parseArray<Result>(value: unknown, maximum: number, label: string, parse: (item: unknown) => Result): Result[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Review ${label} are invalid`);
  return value.map(parse);
}

function parseEnumArray<const Value extends string>(value: unknown, allowed: readonly Value[], label: string): Value[] {
  const parsed = parseArray(value, allowed.length, label, (item) => {
    const match = allowed.find((candidate) => candidate === item);
    if (!match) throw new Error(`Review ${label} are invalid`);
    return match;
  });
  uniqueStrings(parsed, label);
  return parsed;
}

function stableId(value: unknown, label: string): string {
  const id = boundedText(value, `${label} ID`, 100);
  if (!/^[a-z0-9][a-z0-9_-]*$/iu.test(id)) throw new Error(`${label} ID is invalid`);
  return id;
}

function boundedText(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const text = value.trim();
  if ((!allowEmpty && !text) || text.length > maximum) throw new Error(`${label} is invalid`);
  return text;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${label} is invalid`);
  return value;
}

function uniqueIds(values: readonly { readonly id: string }[], label: string): void {
  uniqueStrings(
    values.map((value) => value.id),
    `${label} IDs`,
  );
}

function uniqueStrings(values: readonly string[], label: string): void {
  if (new Set(values.map((value) => value.toLocaleLowerCase())).size !== values.length) throw new Error(`${label} must be unique`);
}

function assertSubset<Value extends string>(values: readonly Value[], allowed: readonly Value[], label: string): void {
  if (values.some((value) => !allowed.includes(value))) throw new Error(`${label} is unavailable in the method configuration`);
}

function credibilityDimension(id: string, label: string, guidance: string): ReviewCredibilityDimension {
  return { id, label, guidance, evidenceClasses: ["grey"] };
}

function stableTextHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value.normalize("NFKC").toLowerCase()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedExtractionFieldType(value: unknown): ExtractionFieldType | undefined {
  if (value === "string") return "text";
  if (value === "enum") return "single-choice";
  return extractionFieldTypes.find((candidate) => candidate === value);
}
