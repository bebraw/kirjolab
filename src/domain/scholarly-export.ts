import { parseBibTeX } from "./bibliography";
import type { CitationStyle } from "./workspace";

export interface PublicationTextDirective {
  readonly kind: "cite" | "ref";
  readonly content: string;
  readonly attributes: ReadonlyMap<string, string>;
}

export interface PublicationCitationEntry {
  readonly id: string;
  readonly author: string;
  readonly title: string;
  readonly year: string;
  readonly number: number;
}

export type CitationDirectiveName = "cite" | "citet" | "citep";

const textDirective = /(?<!:):(?<kind>cite|citet|citep|ref)\[(?<content>[^\]\r\n]*)\](?:\{(?<attributes>[^}\r\n]*)\})?/giu;
const declaration = /^[ \t]*::(?<kind>alias|anchor)\[(?<title>[^\]\r\n]*)\]\{(?<attributes>[^}\r\n]*)\}[ \t]*$/iu;
const bibliographyDirective = /^[ \t]*::bibliography\[\][ \t]*$/iu;
const attribute = /(?<name>[a-z][a-z-]*)=(?:"(?<quoted>[^"]*)"|(?<bare>[^\s}]+))/giu;
const heading = /^(?<marks>#{1,6})[ \t]+(?<title>.+?)[ \t]*(?:\{#(?<id>[^}\r\n]+)\})?[ \t]*$/u;

export function replacePublicationTextDirectives(value: string, replacement: (directive: PublicationTextDirective) => string): string {
  return value.replace(textDirective, (_match, ...values: unknown[]) => {
    const groups = values.at(-1);
    if (!isStringRecord(groups) || !groups.kind) return "";
    const name = groups.kind.toLocaleLowerCase();
    if (name !== "ref" && !isCitationDirectiveName(name)) return "";
    const attributes = new Map(directiveAttributes(groups.attributes ?? ""));
    if (name !== "ref" && name !== "cite" && !attributes.has("mode")) attributes.set("mode", citationModeForDirective(name));
    return replacement({
      kind: name === "ref" ? "ref" : "cite",
      content: (groups.content ?? "").trim(),
      attributes,
    });
  });
}

export function isCitationDirectiveName(value: string): value is CitationDirectiveName {
  return value === "cite" || value === "citet" || value === "citep";
}

export function citationModeForDirective(name: CitationDirectiveName, explicitMode?: string): string {
  return explicitMode ?? (name === "citet" ? "textual" : "parenthetical");
}

export function isPublicationReferenceDeclaration(line: string): boolean {
  return declaration.test(line);
}

export function isPublicationBibliographyDirective(line: string): boolean {
  return bibliographyDirective.test(line);
}

export function publicationReferenceLabels(markdown: string): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  const headingsBySlug = new Map<string, string>();
  for (const line of markdown.split(/\r?\n/u)) {
    const match = heading.exec(line);
    if (!match?.groups?.title) continue;
    const title = plainInlineText(match.groups.title);
    const slug = publicationSlug(title);
    if (slug) headingsBySlug.set(slug, title);
    if (match.groups.id) labels.set(match.groups.id, title);
  }
  for (const line of markdown.split(/\r?\n/u)) {
    const match = declaration.exec(line);
    if (!match?.groups) continue;
    const attributes = directiveAttributes(match.groups.attributes ?? "");
    const target = attributes.get("target");
    if (!target) continue;
    const title = plainInlineText(match.groups.title ?? "") || target;
    labels.set(target, match.groups.kind === "alias" ? (headingsBySlug.get(attributes.get("slug") ?? "") ?? title) : title);
  }
  for (const [slug, title] of headingsBySlug) if (!labels.has(slug)) labels.set(slug, title);
  return labels;
}

export function publicationReferenceLabel(directive: PublicationTextDirective, references: ReadonlyMap<string, string>): string {
  const target = directive.attributes.get("target") ?? directive.content;
  const customText = directive.attributes.get("text") ?? (directive.attributes.has("target") ? directive.content : "");
  return plainInlineText(customText || references.get(target) || target);
}

export function publicationCitationEntries(bibliography: string): ReadonlyMap<string, PublicationCitationEntry> {
  return new Map(
    parseBibTeX(bibliography).map((entry, index) => [
      entry.citationKey,
      {
        id: entry.citationKey,
        author: entry.fields.author ?? "",
        title: entry.fields.title ?? "",
        year: entry.fields.year ?? "",
        number: index + 1,
      },
    ]),
  );
}

export function publicationCitationText(
  directive: PublicationTextDirective,
  bibliography: ReadonlyMap<string, PublicationCitationEntry>,
  citationStyle: CitationStyle,
): string {
  const mode = directive.attributes.get("mode") ?? "parenthetical";
  const entries = directive.content
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => bibliography.get(id) ?? { id, author: id, title: id, year: "n.d.", number: 0 });
  const separator = citationStyle === "ieee" || mode === "textual" ? ", " : "; ";
  const value = entries.map((entry) => formatCitation(entry, mode, citationStyle)).join(separator);
  const wrapped = mode === "parenthetical" ? (citationStyle === "ieee" ? `[${value}]` : `(${value})`) : value;
  const locator = directive.attributes.get("locator");
  return `${directive.attributes.get("prefix") ?? ""}${wrapped}${locator ? `, ${locator}` : ""}${directive.attributes.get("suffix") ?? ""}`;
}

export function publicationBibliographyText(entry: PublicationCitationEntry, citationStyle: CitationStyle): string {
  const author = entry.author.trim() || entry.id;
  const title = entry.title.trim() || entry.id;
  const year = entry.year.trim() || "n.d.";
  if (citationStyle === "ieee") return `[${entry.number}] ${author}, “${title},” ${year}.`;
  if (citationStyle === "chicago-author-date") return `${author}. ${year}. ${title}.`;
  return `${author} (${year}). ${title}.`;
}

export function publicationCitationAuthorLabel(entry: Pick<PublicationCitationEntry, "author" | "id">): string {
  const authors = entry.author
    .split(/\s+and\s+/iu)
    .map(citationFamilyName)
    .filter(Boolean);
  const [first, second] = authors;
  if (!first) return entry.id;
  if (!second) return first;
  if (authors.length === 2) return `${first} and ${second}`;
  return `${first} et al.`;
}

function directiveAttributes(value: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  for (const match of value.matchAll(attribute)) {
    const name = match.groups?.name?.toLocaleLowerCase();
    if (name) attributes.set(name, match.groups?.quoted ?? match.groups?.bare ?? "");
  }
  return attributes;
}

function plainInlineText(value: string): string {
  return value.replace(/[*_`~]/gu, "").trim();
}

function publicationSlug(value: string): string {
  return value
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

function formatCitation(entry: PublicationCitationEntry, mode: string, citationStyle: CitationStyle): string {
  const author = publicationCitationAuthorLabel(entry);
  if (citationStyle === "ieee") return mode === "textual" ? `${author} [${entry.number || entry.id}]` : String(entry.number || entry.id);
  if (mode === "full") return [author, entry.year, entry.title].filter(Boolean).join(". ");
  if (mode === "textual") return `${author} (${entry.year || "n.d."})`;
  return citationStyle === "chicago-author-date" ? `${author} ${entry.year || "n.d."}` : `${author}, ${entry.year || "n.d."}`;
}

function citationFamilyName(value: string): string {
  const author = value.trim();
  if (author.startsWith("{") && author.endsWith("}")) return author.slice(1, -1).trim();
  if (author.includes(",")) return author.slice(0, author.indexOf(",")).trim();
  return author.split(/\s+/u).at(-1) ?? "";
}

function isStringRecord(value: unknown): value is Record<string, string | undefined> {
  return typeof value === "object" && value !== null;
}
