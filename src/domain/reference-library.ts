import { normalizeDoi, projectBibTeXPublication, type BibTeXEntry } from "./bibliography";

export type ReferenceMetadataField = "type" | "title" | "authors" | "year" | "venue" | "doi" | "url" | "abstract";
export type CrossrefMetadataField = ReferenceMetadataField;
export type ScholarlyMetadataProvider = "openalex" | "crossref" | "datacite" | "semantic-scholar";
export type MetadataProvenanceMethod = "bibtex" | ScholarlyMetadataProvider | "filename" | "manual" | "pdf-metadata" | "web" | "migration";

export const crossrefMetadataFields = ["type", "title", "authors", "year", "venue", "doi", "url", "abstract"] as const;

export interface ReviewedPdfMetadata {
  readonly title?: string;
  readonly authors?: readonly string[];
  readonly year?: string;
  readonly doi?: string;
}

export interface CrossrefMetadata {
  readonly type: string;
  readonly title: string;
  readonly authors: string[];
  readonly year: string;
  readonly venue: string;
  readonly doi: string;
  readonly url: string;
  readonly abstract: string;
}

export interface CrossrefLibraryPreview {
  readonly referenceId: string;
  readonly doi: string;
  readonly metadata: CrossrefMetadata;
  readonly metadataFingerprint: string;
}

export interface MetadataRefinementCandidate {
  readonly provider: ScholarlyMetadataProvider;
  readonly match: "doi" | "bibliographic";
  readonly score: number | null;
  readonly metadata: CrossrefMetadata;
  readonly metadataFingerprint: string;
}

export interface MetadataRefinementPreview {
  readonly referenceId: string;
  readonly artifactId: string;
  readonly candidates: readonly MetadataRefinementCandidate[];
}

export interface MetadataFieldProvenance {
  readonly method: MetadataProvenanceMethod;
  readonly capturedAt: string;
  readonly actor: string;
}

export interface BibliographicRecord {
  readonly id: string;
  readonly referenceKey: string;
  readonly type: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly venue: string;
  readonly doi: string;
  readonly url: string;
  readonly abstract: string;
  readonly provenance: Readonly<Partial<Record<ReferenceMetadataField, MetadataFieldProvenance>>>;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BibliographicSnapshot {
  readonly referenceId: string;
  readonly type: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly venue: string;
  readonly doi: string;
  readonly url: string;
  readonly capturedAt: string;
  readonly tombstone: boolean;
  readonly webSnapshot: WebCitationSnapshot | null;
}

export interface WebSource {
  readonly referenceId: string;
  readonly canonicalUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WebSnapshot {
  readonly id: string;
  readonly referenceId: string;
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly accessedAt: string;
  readonly status: number;
  readonly contentType: string;
  readonly rawObjectKey: string | null;
  readonly readableObjectKey: string | null;
  readonly rawSize: number;
  readonly readableSize: number;
  readonly contentHash: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly publisher: string;
  readonly publishedAt: string;
  readonly complete: boolean;
  readonly diagnostics: readonly string[];
  readonly redirectChain: readonly string[];
  readonly etag: string;
  readonly lastModified: string;
}

export interface WebCitationSnapshot {
  readonly id: string;
  readonly accessedAt: string;
  readonly finalUrl: string;
  readonly contentHash: string;
  readonly complete: boolean;
  readonly diagnostics: readonly string[];
}

export interface WebCaptureRegistration {
  readonly snapshot: Omit<WebSnapshot, "referenceId">;
  readonly canonicalUrl: string;
  readonly actor: string;
}

export interface WebDocumentExtraction {
  readonly title: string;
  readonly authors: readonly string[];
  readonly publisher: string;
  readonly publishedAt: string;
  readonly readableText: string;
  readonly diagnostics: readonly string[];
}

export interface WebSnapshotDiffHunk {
  readonly beforeLine: number;
  readonly afterLine: number;
  readonly removed: readonly string[];
  readonly added: readonly string[];
  readonly truncated: boolean;
}

export interface WebSnapshotComparison {
  readonly identical: boolean;
  readonly beforeLines: number;
  readonly afterLines: number;
  readonly addedLines: number;
  readonly removedLines: number;
  readonly hunks: readonly WebSnapshotDiffHunk[];
}

export interface LibraryPdfArtifact {
  readonly id: string;
  readonly referenceId: string | null;
  readonly name: string;
  readonly contentType: "application/pdf";
  readonly size: number;
  readonly objectKey: string;
  readonly fingerprint: string;
  readonly rights: "private" | "shareable" | "unknown";
  readonly createdAt: string;
}

export interface PdfDraftResult {
  readonly reference: BibliographicRecord;
  readonly artifact: LibraryPdfArtifact;
  readonly created: boolean;
}

export interface LibraryNote {
  readonly id: string;
  readonly referenceId: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LibraryHighlight {
  readonly id: string;
  readonly referenceId: string;
  readonly artifactId: string;
  readonly page: number;
  readonly quote: string;
  readonly comment: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReadingState {
  readonly referenceId: string;
  readonly status: "unread" | "reading" | "read";
  readonly rating: number | null;
  readonly priority: "low" | "normal" | "high";
  readonly updatedAt: string;
}

export type ReferenceKeyState = "provisional" | "final";

export interface ReferenceLibrarySnapshot {
  readonly references: readonly BibliographicRecord[];
  readonly referenceKeyStates: Readonly<Record<string, ReferenceKeyState>>;
  readonly artifacts: readonly LibraryPdfArtifact[];
  readonly webSources: readonly WebSource[];
  readonly webSnapshots: readonly WebSnapshot[];
  readonly notes: readonly LibraryNote[];
  readonly highlights: readonly LibraryHighlight[];
  readonly tags: Readonly<Record<string, readonly string[]>>;
  readonly collections: Readonly<Record<string, readonly string[]>>;
  readonly reading: readonly ReadingState[];
}

export type ResearchShareKind = "artifact" | "note" | "highlight" | "web-snapshot";

export type SharedResearchContent =
  | { readonly kind: "artifact"; readonly name: string; readonly size: number; readonly fingerprint: string; readonly objectKey: string }
  | { readonly kind: "note"; readonly body: string }
  | { readonly kind: "highlight"; readonly page: number; readonly quote: string; readonly comment: string }
  | {
      readonly kind: "web-snapshot";
      readonly snapshotId: string;
      readonly accessedAt: string;
      readonly finalUrl: string;
      readonly contentHash: string;
      readonly rawObjectKey: string | null;
      readonly readableObjectKey: string | null;
      readonly complete: boolean;
      readonly diagnostics: readonly string[];
    };

export interface ResearchShareSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly referenceId: string;
  readonly resourceId: string;
  readonly kind: ResearchShareKind;
  readonly content: SharedResearchContent;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

const requiredFieldsByType: Readonly<Record<string, readonly ReferenceMetadataField[]>> = {
  article: ["title", "authors", "year", "venue"],
  book: ["title", "authors", "year", "venue"],
  inbook: ["title", "authors", "year", "venue"],
  incollection: ["title", "authors", "year", "venue"],
  inproceedings: ["title", "authors", "year", "venue"],
  manual: ["title"],
  mastersthesis: ["title", "authors", "year", "venue"],
  misc: ["title"],
  phdthesis: ["title", "authors", "year", "venue"],
  proceedings: ["title", "year"],
  techreport: ["title", "authors", "year", "venue"],
  unpublished: ["title", "authors"],
};

export function bibliographicSnapshot(
  record: BibliographicRecord,
  capturedAt = new Date().toISOString(),
  webSnapshot: WebSnapshot | null = null,
): BibliographicSnapshot {
  return {
    referenceId: record.id,
    type: record.type,
    title: webSnapshot?.title || record.title,
    authors: webSnapshot ? [...webSnapshot.authors] : [...record.authors],
    year: webSnapshot ? (/^(\d{4})/u.exec(webSnapshot.publishedAt.trim())?.[1] ?? "") : record.year,
    venue: webSnapshot?.publisher ?? record.venue,
    doi: record.doi,
    url: record.url,
    capturedAt,
    tombstone: record.deletedAt !== null,
    webSnapshot: webSnapshot
      ? {
          id: webSnapshot.id,
          accessedAt: webSnapshot.accessedAt,
          finalUrl: webSnapshot.finalUrl,
          contentHash: webSnapshot.contentHash,
          complete: webSnapshot.complete,
          diagnostics: [...webSnapshot.diagnostics],
        }
      : null,
  };
}

export function normalizeWebSourceUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Web source URL must use HTTP or HTTPS");
  if (url.username || url.password) throw new Error("Web source URL must not contain credentials");
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new Error("Web source URL must use a standard HTTP port");
  }
  if (isPrivateWebHostname(url.hostname)) throw new Error("Web source URL must resolve to a public host");
  url.hash = "";
  return url.href;
}

export function extractWebDocument(source: string, contentTypeValue: string): WebDocumentExtraction {
  const contentType = contentTypeValue.split(";", 1)[0]?.trim().toLocaleLowerCase() ?? "";
  if (contentType === "text/plain") {
    return {
      title: "",
      authors: [],
      publisher: "",
      publishedAt: "",
      readableText: normalizeReadableText(source),
      diagnostics: ["Plain-text sources do not expose structured citation metadata."],
    };
  }
  if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
    return {
      title: "",
      authors: [],
      publisher: "",
      publishedAt: "",
      readableText: "",
      diagnostics: [`${contentType || "Unknown media type"} cannot be extracted as readable web text.`],
    };
  }
  const metadata = htmlMetadata(source);
  const readableText = normalizeReadableText(
    decodeHtmlEntities(
      source
        .replaceAll(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ")
        .replaceAll(/<(br|hr)\b[^>]*\/?\s*>/giu, "\n")
        .replaceAll(
          /<\/(address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)\s*>/giu,
          "\n",
        )
        .replaceAll(/<[^>]+>/gu, " "),
    ),
  );
  const diagnostics: string[] = [];
  if (!metadata.title) diagnostics.push("No page title was detected; enter one before saving the source.");
  if (readableText.length < 80)
    diagnostics.push("Very little readable text was extracted; the page may require scripts or authentication.");
  return { ...metadata, readableText, diagnostics };
}

export function compareWebSnapshotText(beforeValue: string, afterValue: string): WebSnapshotComparison {
  const before = comparisonLines(beforeValue);
  const after = comparisonLines(afterValue);
  const hunks: WebSnapshotDiffHunk[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;
  let addedLines = 0;
  let removedLines = 0;
  while (beforeIndex < before.length || afterIndex < after.length) {
    if (before[beforeIndex] === after[afterIndex]) {
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }
    const sync = nearestLineSync(before, after, beforeIndex, afterIndex);
    const beforeEnd = sync?.beforeIndex ?? before.length;
    const afterEnd = sync?.afterIndex ?? after.length;
    const removed = before.slice(beforeIndex, beforeEnd);
    const added = after.slice(afterIndex, afterEnd);
    removedLines += removed.length;
    addedLines += added.length;
    const maximumExcerptLines = 24;
    hunks.push({
      beforeLine: beforeIndex + 1,
      afterLine: afterIndex + 1,
      removed: removed.slice(0, maximumExcerptLines),
      added: added.slice(0, maximumExcerptLines),
      truncated: removed.length > maximumExcerptLines || added.length > maximumExcerptLines,
    });
    beforeIndex = beforeEnd;
    afterIndex = afterEnd;
    if (hunks.length >= 100 && (beforeIndex < before.length || afterIndex < after.length)) {
      const remainingRemoved = before.length - beforeIndex;
      const remainingAdded = after.length - afterIndex;
      removedLines += remainingRemoved;
      addedLines += remainingAdded;
      hunks.push({
        beforeLine: beforeIndex + 1,
        afterLine: afterIndex + 1,
        removed: before.slice(beforeIndex, beforeIndex + maximumExcerptLines),
        added: after.slice(afterIndex, afterIndex + maximumExcerptLines),
        truncated: true,
      });
      break;
    }
  }
  return {
    identical: hunks.length === 0,
    beforeLines: before.length,
    afterLines: after.length,
    addedLines,
    removedLines,
    hunks,
  };
}

export function missingRequiredBibliographicFields(record: Pick<BibliographicRecord, ReferenceMetadataField>): ReferenceMetadataField[] {
  const required = requiredFieldsByType[record.type.toLowerCase()] ?? requiredFieldsByType.misc ?? ["title"];
  return required.filter((field) => {
    const value = record[field];
    return typeof value === "string" ? value.trim().length === 0 : value.length === 0;
  });
}

export function referenceFromBibTeX(
  entry: BibTeXEntry,
  id: string,
  provenance: MetadataFieldProvenance,
  createdAt = provenance.capturedAt,
): BibliographicRecord {
  const projected = projectBibTeXPublication(entry);
  const fields = Object.fromEntries(
    (["type", "title", "authors", "year", "venue", "doi", "url", "abstract"] as const).map((field) => [field, provenance]),
  );
  return {
    id,
    referenceKey: memorableReferenceKey(projected),
    ...projected,
    doi: normalizeDoi(projected.doi),
    provenance: fields,
    archivedAt: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function memorableReferenceKey(record: Pick<BibliographicRecord, "title" | "authors" | "year">, includeTopic = false): string {
  const author = record.authors[0]?.trim() ?? "";
  const surname = author.includes(",") ? (author.split(",", 1)[0] ?? "") : (author.split(/\s+/u).at(-1) ?? "");
  const family = referenceKeyPart(surname) || "source";
  const year = /(?:^|\D)(\d{4})(?:\D|$)/u.exec(record.year)?.[1] ?? "undated";
  const topic = record.title
    .split(/[^\p{L}\p{N}]+/gu)
    .map(referenceKeyPart)
    .find((part) => part.length >= 3 && part !== family && !referenceKeyStopWords.has(part));
  const needsTopic = includeTopic || family === "source" || year === "undated";
  return `${family}${year}${needsTopic ? (topic ?? "work") : ""}`.slice(0, 80);
}

export function likelyReferenceIdentity(record: Pick<BibliographicRecord, "title" | "authors" | "year" | "doi">): string {
  const doi = normalizeDoi(record.doi);
  if (doi) return `doi:${doi}`;
  return `work:${normalizeIdentityText(record.title)}|${record.year.trim()}|${normalizeIdentityText(record.authors[0] ?? "")}`;
}

export function isReferenceLibrarySnapshot(value: unknown): value is ReferenceLibrarySnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.references) &&
    value.references.every(isBibliographicRecord) &&
    isRecord(value.referenceKeyStates) &&
    Object.values(value.referenceKeyStates).every((state) => state === "provisional" || state === "final") &&
    Array.isArray(value.artifacts) &&
    Array.isArray(value.webSources) &&
    value.webSources.every(isWebSource) &&
    Array.isArray(value.webSnapshots) &&
    value.webSnapshots.every(isWebSnapshot) &&
    Array.isArray(value.notes) &&
    Array.isArray(value.highlights) &&
    isStringArrayRecord(value.tags) &&
    isStringArrayRecord(value.collections) &&
    Array.isArray(value.reading) &&
    value.reading.every(
      (item) =>
        isRecord(item) &&
        typeof item.referenceId === "string" &&
        (item.status === "unread" || item.status === "reading" || item.status === "read") &&
        (item.rating === null ||
          (typeof item.rating === "number" && Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5)) &&
        (item.priority === "low" || item.priority === "normal" || item.priority === "high") &&
        typeof item.updatedAt === "string",
    )
  );
}

export function isPdfDraftResult(value: unknown): value is PdfDraftResult {
  return (
    isRecord(value) && isBibliographicRecord(value.reference) && isLibraryPdfArtifact(value.artifact) && typeof value.created === "boolean"
  );
}

export function isCrossrefLibraryPreview(value: unknown): value is CrossrefLibraryPreview {
  return (
    isRecord(value) &&
    typeof value.referenceId === "string" &&
    typeof value.doi === "string" &&
    isCrossrefMetadata(value.metadata) &&
    typeof value.metadataFingerprint === "string" &&
    /^[a-f0-9]{64}$/u.test(value.metadataFingerprint)
  );
}

export function isMetadataRefinementPreview(value: unknown): value is MetadataRefinementPreview {
  return (
    isRecord(value) &&
    typeof value.referenceId === "string" &&
    typeof value.artifactId === "string" &&
    Array.isArray(value.candidates) &&
    value.candidates.length <= 5 &&
    value.candidates.every(isMetadataRefinementCandidate)
  );
}

function isMetadataRefinementCandidate(value: unknown): value is MetadataRefinementCandidate {
  return (
    isRecord(value) &&
    ["openalex", "crossref", "datacite", "semantic-scholar"].includes(String(value.provider)) &&
    (value.match === "doi" || value.match === "bibliographic") &&
    (value.score === null || (typeof value.score === "number" && Number.isFinite(value.score))) &&
    isCrossrefMetadata(value.metadata) &&
    typeof value.metadataFingerprint === "string" &&
    /^[a-f0-9]{64}$/u.test(value.metadataFingerprint)
  );
}

export function isCrossrefMetadata(value: unknown): value is CrossrefMetadata {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    value.type.length > 0 &&
    value.type.length <= 100 &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    value.title.length <= 2_000 &&
    Array.isArray(value.authors) &&
    value.authors.length <= 100 &&
    value.authors.every((author) => typeof author === "string" && author.length <= 500) &&
    typeof value.year === "string" &&
    value.year.length <= 100 &&
    typeof value.venue === "string" &&
    value.venue.length <= 2_000 &&
    typeof value.doi === "string" &&
    value.doi.length > 0 &&
    value.doi.length <= 500 &&
    typeof value.url === "string" &&
    value.url.length <= 2_000 &&
    typeof value.abstract === "string" &&
    value.abstract.length <= 20_000
  );
}

function isStringArrayRecord(value: unknown): value is Readonly<Record<string, readonly string[]>> {
  return isRecord(value) && Object.values(value).every((items) => Array.isArray(items) && items.every((item) => typeof item === "string"));
}

function isWebSource(value: unknown): value is WebSource {
  return (
    isRecord(value) &&
    typeof value.referenceId === "string" &&
    typeof value.canonicalUrl === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isWebSnapshot(value: unknown): value is WebSnapshot {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.referenceId === "string" &&
    typeof value.requestedUrl === "string" &&
    typeof value.finalUrl === "string" &&
    typeof value.accessedAt === "string" &&
    typeof value.status === "number" &&
    typeof value.contentType === "string" &&
    (value.rawObjectKey === null || typeof value.rawObjectKey === "string") &&
    (value.readableObjectKey === null || typeof value.readableObjectKey === "string") &&
    typeof value.rawSize === "number" &&
    typeof value.readableSize === "number" &&
    typeof value.contentHash === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.authors) &&
    value.authors.every((author) => typeof author === "string") &&
    typeof value.publisher === "string" &&
    typeof value.publishedAt === "string" &&
    typeof value.complete === "boolean" &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every((diagnostic) => typeof diagnostic === "string") &&
    Array.isArray(value.redirectChain) &&
    value.redirectChain.every((url) => typeof url === "string") &&
    typeof value.etag === "string" &&
    typeof value.lastModified === "string"
  );
}

const referenceKeyStopWords = new Set(["a", "an", "and", "for", "from", "in", "of", "on", "the", "to", "with"]);

function referenceKeyPart(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/\p{Mark}/gu, "")
    .replaceAll(/[^\p{L}\p{N}]/gu, "");
}

function isBibliographicRecord(value: unknown): value is BibliographicRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.referenceKey === "string" &&
    value.referenceKey.length > 0 &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.authors) &&
    value.authors.every((author) => typeof author === "string") &&
    typeof value.year === "string" &&
    typeof value.venue === "string" &&
    typeof value.doi === "string" &&
    typeof value.url === "string" &&
    typeof value.abstract === "string" &&
    isRecord(value.provenance) &&
    (value.archivedAt === null || typeof value.archivedAt === "string") &&
    (value.deletedAt === null || typeof value.deletedAt === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isLibraryPdfArtifact(value: unknown): value is LibraryPdfArtifact {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.referenceId === null || typeof value.referenceId === "string") &&
    typeof value.name === "string" &&
    value.contentType === "application/pdf" &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    typeof value.objectKey === "string" &&
    typeof value.fingerprint === "string" &&
    (value.rights === "private" || value.rights === "shareable" || value.rights === "unknown") &&
    typeof value.createdAt === "string"
  );
}

function normalizeIdentityText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isPrivateWebHostname(value: string): boolean {
  const hostname = value
    .replace(/^\[|\]$/gu, "")
    .toLocaleLowerCase()
    .replace(/\.$/u, "");
  if (!hostname || hostname === "localhost" || /\.(localhost|local|internal|lan)$/u.test(hostname)) return true;
  const isIpv6Literal = hostname.includes(":");
  if (isIpv6Literal && (hostname === "::" || hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd"))) return true;
  if (isIpv6Literal && (/^fe[89ab]/u.test(hostname) || hostname.startsWith("::ffff:"))) return true;
  const octets = hostname.split(".");
  if (octets.length !== 4 || !octets.every((octet) => /^\d{1,3}$/u.test(octet) && Number(octet) <= 255)) return false;
  const [first = 0, second = 0] = octets.map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function htmlMetadata(source: string): Omit<WebDocumentExtraction, "readableText" | "diagnostics"> {
  const metas = [...source.matchAll(/<meta\b[^>]*>/giu)].map((match) => htmlAttributes(match[0] ?? ""));
  const valueFor = (...names: string[]): string => {
    const wanted = new Set(names.map((name) => name.toLocaleLowerCase()));
    const match = metas.find((attributes) => wanted.has((attributes.property ?? attributes.name ?? "").toLocaleLowerCase()));
    return normalizeReadableText(decodeHtmlEntities(match?.content ?? ""));
  };
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu.exec(source)?.[1] ?? "";
  const title =
    valueFor("og:title", "twitter:title", "citation_title") ||
    normalizeReadableText(decodeHtmlEntities(titleTag.replaceAll(/<[^>]+>/gu, " ")));
  const authors = metas
    .filter((attributes) =>
      ["author", "article:author", "citation_author"].includes((attributes.property ?? attributes.name ?? "").toLocaleLowerCase()),
    )
    .map((attributes) => normalizeReadableText(decodeHtmlEntities(attributes.content ?? "")))
    .filter(Boolean);
  return {
    title,
    authors: [...new Set(authors)],
    publisher: valueFor("og:site_name", "application-name", "citation_publisher"),
    publishedAt: valueFor("article:published_time", "date", "dc.date", "citation_publication_date"),
  };
}

function htmlAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)) {
    const name = match[1]?.toLocaleLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name) attributes[name] = value;
  }
  return attributes;
}

function decodeHtmlEntities(value: string): string {
  const named: Readonly<Record<string, string>> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return value.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) return safeCodePoint(entity, Number.parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return safeCodePoint(entity, Number.parseInt(body.slice(1), 10));
    return named[body.toLocaleLowerCase()] ?? entity;
  });
}

function safeCodePoint(fallback: string, value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : fallback;
}

function normalizeReadableText(value: string): string {
  return value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.replaceAll(/\s+/gu, " ").trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join("\n")
    .trim();
}

function comparisonLines(value: string): string[] {
  const normalized = normalizeReadableText(value);
  return normalized ? normalized.split("\n") : [];
}

function nearestLineSync(
  before: readonly string[],
  after: readonly string[],
  beforeIndex: number,
  afterIndex: number,
): { beforeIndex: number; afterIndex: number } | null {
  const lookahead = 20;
  for (let distance = 1; distance <= lookahead; distance += 1) {
    for (let beforeOffset = 0; beforeOffset <= distance; beforeOffset += 1) {
      const afterOffset = distance - beforeOffset;
      const candidateBefore = beforeIndex + beforeOffset;
      const candidateAfter = afterIndex + afterOffset;
      if (candidateBefore < before.length && candidateAfter < after.length && before[candidateBefore] === after[candidateAfter]) {
        return { beforeIndex: candidateBefore, afterIndex: candidateAfter };
      }
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
