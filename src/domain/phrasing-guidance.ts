import inventoryArtifact from "../../phrasing-guidance/inventory.json";

export type PhrasingPurposeId = "qualify-claim" | "contrast-findings" | "introduce-evidence" | "state-limitation";

export interface PhrasingPurpose {
  readonly id: PhrasingPurposeId;
  readonly label: string;
  readonly description: string;
}

export interface PhrasingPattern {
  readonly id: string;
  readonly purposeId: PhrasingPurposeId;
  readonly template: string;
}

export interface PhrasingGuidanceRelease {
  readonly inventoryVersion: string;
  readonly extractionVersion: string;
  readonly reviewedAt: string;
}

interface ParsedInventory {
  readonly release: PhrasingGuidanceRelease;
  readonly purposes: readonly PhrasingPurpose[];
  readonly patterns: readonly PhrasingPattern[];
}

const allowedPurposes = new Set<PhrasingPurposeId>(["qualify-claim", "contrast-findings", "introduce-evidence", "state-limitation"]);
const allowedLicenses = new Set(["CC0-1.0", "CC-BY-4.0"]);
const parsedInventory = parseInventory(inventoryArtifact);

export function phrasingGuidanceRelease(): PhrasingGuidanceRelease {
  return parsedInventory.release;
}

export function phrasingPurposes(): readonly PhrasingPurpose[] {
  return parsedInventory.purposes;
}

export function phrasingPatternsForPurpose(purposeId: PhrasingPurposeId, limit = 5): readonly PhrasingPattern[] {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 0), 5);
  return parsedInventory.patterns.filter((pattern) => pattern.purposeId === purposeId).slice(0, boundedLimit);
}

export function isPhrasingPurposeId(value: unknown): value is PhrasingPurposeId {
  return typeof value === "string" && allowedPurposes.has(value as PhrasingPurposeId);
}

export function validatePhrasingGuidanceArtifacts(inventoryValue: unknown, ledgerValue: unknown, attribution: string): void {
  const inventory = parseInventoryArtifact(inventoryValue);
  const ledger = record(ledgerValue, "Source ledger");
  integer(ledger.schemaVersion, 1, "Source ledger schema version");
  if (boundedString(ledger.inventoryVersion, 80, "Source ledger inventory version") !== inventory.inventoryVersion) {
    throw new TypeError("Inventory and source ledger versions must match");
  }
  const retrievalService = record(ledger.retrievalService, "Retrieval service");
  boundedString(retrievalService.name, 120, "Retrieval service name");
  httpUrl(retrievalService.url, "Retrieval service URL");
  const sources = array(ledger.sources, "Sources").map(parseSource);
  unique(
    sources.map(({ id }) => id),
    "Source ids",
  );
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const patternsById = new Map(inventory.patterns.map((pattern) => [pattern.id, pattern]));

  for (const pattern of inventory.patterns) {
    const sourceIds = strings(pattern.sourceIds, 3, 20, "Pattern source ids");
    unique(sourceIds, `Source ids for ${pattern.id}`);
    const supporting = sourceIds.map((sourceId) => {
      const source = sourcesById.get(sourceId);
      if (!source) throw new TypeError(`Pattern ${pattern.id} references unknown source ${sourceId}`);
      if (!source.patternIds.includes(pattern.id)) throw new TypeError(`Source ${sourceId} does not reciprocate pattern ${pattern.id}`);
      return source;
    });
    if (new Set(supporting.map(({ venue }) => venue.toLocaleLowerCase())).size < 2) {
      throw new TypeError(`Pattern ${pattern.id} requires at least two venues`);
    }
    for (let left = 0; left < supporting.length; left += 1) {
      for (let right = left + 1; right < supporting.length; right += 1) {
        const rightAuthors = supporting[right]!.normalizedAuthors;
        if ([...supporting[left]!.normalizedAuthors].some((author) => rightAuthors.has(author))) {
          throw new TypeError(`Pattern ${pattern.id} sources must have independent author groups`);
        }
      }
    }
  }
  for (const source of sources) {
    for (const patternId of source.patternIds) {
      const pattern = patternsById.get(patternId);
      if (!pattern) throw new TypeError(`Source ${source.id} references unknown pattern ${patternId}`);
      if (!pattern.sourceIds.includes(source.id)) throw new TypeError(`Pattern ${patternId} does not reciprocate source ${source.id}`);
    }
  }
  if (!attribution.includes(inventory.inventoryVersion) || !attribution.includes("CC BY") || !attribution.includes("sources.json")) {
    throw new TypeError("Attribution must identify the inventory, CC BY terms, and source ledger");
  }
}

function parseInventory(value: unknown): ParsedInventory {
  const inventory = parseInventoryArtifact(value);
  return {
    release: {
      inventoryVersion: inventory.inventoryVersion,
      extractionVersion: inventory.extractionVersion,
      reviewedAt: inventory.reviewedAt,
    },
    purposes: inventory.taxonomy.map(({ id, label, description }) => ({ id, label, description })),
    patterns: inventory.patterns.map(({ id, purposeId, template }) => ({ id, purposeId, template })),
  };
}

function parseInventoryArtifact(value: unknown): {
  readonly inventoryVersion: string;
  readonly extractionVersion: string;
  readonly reviewedAt: string;
  readonly taxonomy: readonly PhrasingPurpose[];
  readonly patterns: readonly ParsedPattern[];
} {
  const inventory = record(value, "Inventory");
  integer(inventory.schemaVersion, 1, "Inventory schema version");
  const inventoryVersion = boundedString(inventory.inventoryVersion, 80, "Inventory version");
  const extractionVersion = boundedString(inventory.extractionVersion, 80, "Extraction version");
  const reviewedAt = isoDate(inventory.reviewedAt, "Inventory review date");
  const taxonomy = array(inventory.taxonomy, "Taxonomy").map((value) => {
    const purpose = record(value, "Purpose");
    if (!isPhrasingPurposeId(purpose.id)) throw new TypeError("Phrasing purpose is not allowlisted");
    return {
      id: purpose.id,
      label: boundedString(purpose.label, 80, "Purpose label"),
      description: boundedString(purpose.description, 240, "Purpose description"),
    };
  });
  unique(
    taxonomy.map(({ id }) => id),
    "Purpose ids",
  );
  if (taxonomy.length !== allowedPurposes.size) throw new TypeError("Inventory must define every allowlisted rhetorical purpose once");
  const purposeIds = new Set(taxonomy.map(({ id }) => id));
  const patterns = array(inventory.patterns, "Patterns").map((value) => parsePattern(value, purposeIds, extractionVersion));
  unique(
    patterns.map(({ id }) => id),
    "Pattern ids",
  );
  return { inventoryVersion, extractionVersion, reviewedAt, taxonomy, patterns };
}

interface ParsedPattern extends PhrasingPattern {
  readonly sourceIds: readonly string[];
}

function parsePattern(value: unknown, purposeIds: ReadonlySet<PhrasingPurposeId>, extractionVersion: string): ParsedPattern {
  const pattern = record(value, "Pattern");
  const id = identifier(pattern.id, "Pattern id");
  if (!isPhrasingPurposeId(pattern.purposeId) || !purposeIds.has(pattern.purposeId))
    throw new TypeError(`Pattern ${id} has an unknown purpose`);
  const template = boundedString(pattern.template, 160, "Pattern template");
  const slots = array(pattern.slots, "Pattern slots").map((value) => {
    const slot = record(value, "Pattern slot");
    const name = identifier(slot.name, "Slot name");
    if (slot.type !== "clause" && slot.type !== "noun-phrase" && slot.type !== "evidence-reference") {
      throw new TypeError(`Pattern ${id} has an unknown slot type`);
    }
    return name;
  });
  unique(slots, `Slot names for ${id}`);
  const placeholders = [...template.matchAll(/\{([a-z][a-z0-9-]*)\}/gu)].map((match) => match[1]!);
  if (placeholders.length === 0 || placeholders.join("\u0000") !== slots.join("\u0000")) {
    throw new TypeError(`Pattern ${id} slots must exactly match its ordered placeholders`);
  }
  const review = record(pattern.review, "Pattern review");
  if (review.decision !== "accepted" || review.distinctiveSourceLanguage !== false) throw new TypeError(`Pattern ${id} is not approved`);
  boundedString(review.reviewedBy, 120, "Pattern reviewer");
  boundedString(review.method, 80, "Similarity review method");
  if (review.extractionVersion !== extractionVersion) throw new TypeError(`Pattern ${id} similarity review is stale`);
  return { id, purposeId: pattern.purposeId, template, sourceIds: strings(pattern.sourceIds, 3, 20, "Pattern source ids") };
}

function parseSource(value: unknown): {
  readonly id: string;
  readonly venue: string;
  readonly normalizedAuthors: Set<string>;
  readonly patternIds: readonly string[];
} {
  const source = record(value, "Source");
  const id = identifier(source.id, "Source id");
  boundedString(source.doi, 120, "Source DOI");
  boundedString(source.title, 500, "Source title");
  const authors = strings(source.authors, 1, 100, "Source authors");
  unique(authors.map(normalize), `Authors for ${id}`);
  const venue = boundedString(source.venue, 160, "Source venue");
  if (typeof source.license !== "string" || !allowedLicenses.has(source.license))
    throw new TypeError(`Source ${id} has a disallowed licence`);
  const retrieval = record(source.retrieval, "Source retrieval");
  if (retrieval.route !== "plos-jats-manuscript" && retrieval.route !== "plos-jats-bulk" && retrieval.route !== "pmc-oa-bulk") {
    throw new TypeError(`Source ${id} has an undesignated retrieval route`);
  }
  httpUrl(retrieval.url, "Source retrieval URL");
  isoDate(retrieval.retrievedAt, "Source retrieval date");
  const patternIds = strings(source.patternIds, 1, 20, "Source pattern ids");
  unique(patternIds, `Pattern ids for ${id}`);
  return { id, venue, normalizedAuthors: new Set(authors.map(normalize)), patternIds };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function strings(value: unknown, minimum: number, maximum: number, label: string): readonly string[] {
  const values = array(value, label);
  if (values.length < minimum || values.length > maximum) throw new RangeError(`${label} must contain ${minimum} to ${maximum} values`);
  return values.map((item) => boundedString(item, 500, label));
}

function boundedString(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new TypeError(`${label} must be a bounded string`);
  return value;
}

function identifier(value: unknown, label: string): string {
  const id = boundedString(value, 80, label);
  if (!/^[a-z][a-z0-9-]*$/u.test(id)) throw new TypeError(`${label} must be kebab-case`);
  return id;
}

function integer(value: unknown, expected: number, label: string): void {
  if (value !== expected) throw new TypeError(`${label} must be ${expected}`);
}

function isoDate(value: unknown, label: string): string {
  const date = boundedString(value, 10, label);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new TypeError(`${label} is invalid`);
  return date;
}

function httpUrl(value: unknown, label: string): void {
  const url = new URL(boundedString(value, 1_000, label));
  if (url.protocol !== "https:") throw new TypeError(`${label} must use HTTPS`);
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must be unique`);
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-z0-9]/giu, "")
    .toLocaleLowerCase();
}
