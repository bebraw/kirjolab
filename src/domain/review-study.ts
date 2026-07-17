export const reviewStudyLimits = {
  researchQuestions: 128,
  conceptGroups: 128,
  termsPerGroup: 128,
  sources: 128,
  knownRelevantStudies: 256,
} as const;

export type ReviewProfile = "slr" | "mlr";
export type ProtocolStatus = "draft" | "frozen";
export type PicocFacet = "population" | "intervention" | "comparison" | "outcome" | "context";
export type SearchDialect = "generic" | "scopus" | "web-of-science" | "ieee-xplore" | "acm-dl";
export type SearchFieldScope = "all-fields" | "title-abstract" | "title-abstract-keywords";

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
}

export interface KnownRelevantStudy {
  readonly id: string;
  readonly title: string;
  readonly abstract: string;
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

const facets = ["population", "intervention", "comparison", "outcome", "context"] as const;
const dialects = ["generic", "scopus", "web-of-science", "ieee-xplore", "acm-dl"] as const;
const scopes = ["all-fields", "title-abstract", "title-abstract-keywords"] as const;

export function defaultReviewProtocol(profile: ReviewProfile = "slr"): ReviewProtocolContent {
  return {
    profile,
    objective: "",
    picoc: { population: "", intervention: "", comparison: "", outcome: "", context: "" },
    researchQuestions: [],
    conceptGroups: [],
    sources: [],
    knownRelevantStudies: [],
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
    const url = boundedText(item.url, "Search source URL", 2_000, true);
    if (url) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Search source URL is invalid");
    }
    return { id: stableId(item.id, "Search source"), name: boundedText(item.name, "Search source name", 200), url, dialect, fieldScope };
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
  uniqueIds(researchQuestions, "Research questions");
  uniqueIds(conceptGroups, "Concept groups");
  uniqueIds(sources, "Search sources");
  uniqueIds(knownRelevantStudies, "Known relevant studies");
  return { profile: value.profile, objective, picoc, researchQuestions, conceptGroups, sources, knownRelevantStudies };
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

function uniqueIds(values: readonly { readonly id: string }[], label: string): void {
  uniqueStrings(
    values.map((value) => value.id),
    `${label} IDs`,
  );
}

function uniqueStrings(values: readonly string[], label: string): void {
  if (new Set(values.map((value) => value.toLocaleLowerCase())).size !== values.length) throw new Error(`${label} must be unique`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
