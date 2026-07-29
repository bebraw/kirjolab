import * as v from "valibot";

const stringArraySchema = v.array(v.string());
const readonlyStringArraySchema = v.pipe(stringArraySchema, v.readonly());
const storedNumberSchema = v.custom<number>((value) => typeof value === "number");
const webSourceSchema = v.pipe(
  v.object({ referenceId: v.string(), canonicalUrl: v.string(), createdAt: v.string(), updatedAt: v.string() }),
  v.readonly(),
);
const webSnapshotSchema = v.pipe(
  v.object({
    id: v.string(),
    referenceId: v.string(),
    requestedUrl: v.string(),
    finalUrl: v.string(),
    accessedAt: v.string(),
    status: storedNumberSchema,
    contentType: v.string(),
    rawObjectKey: v.nullable(v.string()),
    readableObjectKey: v.nullable(v.string()),
    rawSize: storedNumberSchema,
    readableSize: storedNumberSchema,
    contentHash: v.string(),
    title: v.string(),
    authors: readonlyStringArraySchema,
    publisher: v.string(),
    publishedAt: v.string(),
    complete: v.boolean(),
    diagnostics: readonlyStringArraySchema,
    redirectChain: readonlyStringArraySchema,
    etag: v.string(),
    lastModified: v.string(),
  }),
  v.readonly(),
);

export type WebSource = v.InferOutput<typeof webSourceSchema>;
export type WebSnapshot = v.InferOutput<typeof webSnapshotSchema>;

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

export function isWebSource(value: unknown): value is WebSource {
  return v.is(webSourceSchema, value);
}

export function isWebSnapshot(value: unknown): value is WebSnapshot {
  return v.is(webSnapshotSchema, value);
}

function isPrivateWebHostname(value: string): boolean {
  const hostname = value
    .replace(/^\[|\]$/gu, "")
    .toLocaleLowerCase()
    .replace(/\.$/u, "");
  if (!hostname || hostname === "localhost" || /\.(localhost|local|internal|lan)$/u.test(hostname)) return true;
  if (hostname.includes(":")) return isPrivateIpv6Hostname(hostname);
  const octets = hostname.split(".");
  if (octets.length !== 4 || !octets.every((octet) => /^\d{1,3}$/u.test(octet) && Number(octet) <= 255)) return false;
  const [first = 0, second = 0] = octets.map(Number);
  return isPrivateIpv4Address(first, second);
}

function isPrivateIpv6Hostname(hostname: string): boolean {
  return (
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    /^fe[89ab]/u.test(hostname) ||
    hostname.startsWith("::ffff:")
  );
}

function isPrivateIpv4Address(first: number, second: number): boolean {
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
