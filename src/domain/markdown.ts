import { defineHastPlugin, defineMdastPlugin, markdownToHtml } from "satteri";
import { parseBibTeX } from "./bibliography";
import type { CitationStyle } from "./workspace";

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  from: number;
  to: number;
}

interface BibliographyEntry {
  id: string;
  author: string;
  title: string;
  year: string;
}

interface ReferenceEntry {
  title: string;
  slug: string;
}

interface Citation {
  ids: string[];
  mode: string;
  locator?: string;
  prefix?: string;
  suffix?: string;
}

export interface RenderedDocument {
  html: string;
  diagnostics: Diagnostic[];
}

// Stryker disable Regex: Satteri owns Markdown parsing; these expressions only locate the small semantic-directive validation surface.
const directivePattern = /(?<!:):([a-z][a-z-]*)\[([^\]]*)\](?:\{([^}]*)\})?/giu;
const attributePattern = /([a-z][a-z-]*)=(?:"([^"]*)"|([^\s}]+))/giu;
const headingPattern = /^(#{2,4})\s+(.+?)(?:\s+\{#([a-zA-Z0-9:_-]+)\})?\s*$/gmu;
const aliasPattern = /^::alias\[([^\]]*)\]\{([^}]*)\}\s*$/gmu;
const anchorPattern = /^::anchor\[([^\]]*)\]\{([^}]*)\}\s*$/gmu;
const safeTableAlignmentPattern = /^text-align: (?:center|left|right)$/u;

// Stryker disable all: The static sanitizer vocabulary is covered by the complete rendered-output test; static mutants cannot isolate its module initialization reliably.
const safeElements = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "button",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "span",
  "strong",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

const safePropertiesByElement: Readonly<Record<string, ReadonlySet<string>>> = {
  a: new Set(["ariaDescribedBy", "ariaLabel", "className", "dataFootnoteBackref", "dataFootnoteRef", "href", "id", "title"]),
  button: new Set(["ariaLabel", "className", "dataCitation", "type"]),
  code: new Set(["className"]),
  h1: new Set(["className", "id"]),
  h2: new Set(["className", "id"]),
  h3: new Set(["className", "id"]),
  h5: new Set(["className", "id"]),
  h6: new Set(["className", "id"]),
  img: new Set(["alt", "src", "title"]),
  input: new Set(["checked", "disabled", "type"]),
  li: new Set(["className", "id"]),
  ol: new Set(["start"]),
  section: new Set(["className", "dataFootnotes"]),
  span: new Set(["ariaLabel", "class", "className", "dataCitation", "id"]),
  td: new Set(["style"]),
  th: new Set(["style"]),
  ul: new Set(["className"]),
};
// Stryker restore all
const noSafeProperties = new Set<string>();

export function renderWorkspaceMarkdown(
  source: string,
  bibliographySource: string,
  citationStyle: CitationStyle = "apa",
): RenderedDocument {
  const normalized = source.replaceAll("\r\n", "\n");
  const bibliography = parseBibliography(bibliographySource);
  const references = collectReferences(normalized);
  const diagnostics = validateSyntax(normalized, bibliography, references);

  try {
    const result = markdownToHtml(normalized, {
      features: { directive: true, frontmatter: true, gfm: true, headingAttributes: true },
      mdastPlugins: [createSemanticPlugin(bibliography, references, citationStyle)],
      hastPlugins: [createHeadingPlugin(), createSecurityPlugin()],
    });
    return { html: result.html, diagnostics };
  } catch (error) {
    return {
      html: `<pre><code>${escapeHtml(normalized)}</code></pre>`,
      diagnostics: [
        ...diagnostics,
        {
          severity: "error",
          message: error instanceof Error ? error.message : "Satteri could not parse this document",
          from: 0,
          to: normalized.length,
        },
      ],
    };
  }
}

export function parseBibliography(source: string): Map<string, BibliographyEntry> {
  const entries = new Map<string, BibliographyEntry>();
  for (const entry of parseBibTeX(source)) {
    entries.set(entry.citationKey, {
      id: entry.citationKey,
      author: entry.fields.author ?? "",
      title: entry.fields.title ?? "",
      year: entry.fields.year ?? "",
    });
  }
  return entries;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("`", "")
    .trim()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

function createSemanticPlugin(
  bibliography: Map<string, BibliographyEntry>,
  references: Map<string, ReferenceEntry>,
  citationStyle: CitationStyle,
) {
  return defineMdastPlugin({
    name: "kirjolab-scientific-writing-semantics",
    html(node) {
      return { type: "text", value: node.value };
    },
    textDirective(node, context) {
      const content = context.textContent(node).trim();
      if (node.name === "cite") {
        const locator = attributeValue(node.attributes?.locator);
        const prefix = attributeValue(node.attributes?.prefix);
        const suffix = attributeValue(node.attributes?.suffix);
        const citation = {
          ids: splitIds(content),
          mode: attributeValue(node.attributes?.mode) ?? "parenthetical",
          ...(locator ? { locator } : {}),
          ...(prefix ? { prefix } : {}),
          ...(suffix ? { suffix } : {}),
        } satisfies Citation;
        return { type: "html", value: renderCitation(citation, bibliography, citationStyle) };
      }
      if (node.name === "ref") {
        const target = attributeValue(node.attributes?.target) ?? content;
        const reference = references.get(target);
        const customText = attributeValue(node.attributes?.text) ?? (node.attributes?.target ? content : undefined);
        const label = customText || reference?.title || target;
        return {
          type: "html",
          value: `<a class="semantic-reference" href="#${escapeHtml(reference?.slug ?? slugify(target))}">${escapeHtml(label)}</a>`,
        };
      }
      return { type: "text", value: context.textContent(node) };
    },
    leafDirective(node, context) {
      const title = context.textContent(node).trim();
      if (node.name !== "alias" && node.name !== "anchor") return { type: "text", value: title };
      if (node.name === "alias") return { type: "html", value: "" };
      const target = attributeValue(node.attributes?.target) ?? "";
      const slug = attributeValue(node.attributes?.slug) ?? slugify(target);
      return { type: "html", value: `<span class="semantic-anchor" id="${escapeHtml(slug)}" aria-label="${escapeHtml(title)}"></span>` };
    },
    containerDirective(node, context) {
      return { type: "text", value: context.textContent(node) };
    },
  });
}

function createSecurityPlugin() {
  return defineHastPlugin({
    name: "kirjolab-preview-security",
    element: {
      filter: [],
      visit(node, context) {
        if (!safeElements.has(node.tagName)) {
          context.removeNode(node);
          return;
        }

        const safeProperties = safePropertiesByElement[node.tagName] ?? noSafeProperties;
        for (const property of Object.keys(node.properties ?? {})) {
          if (!safeProperties.has(property)) context.setProperty(node, property, null);
        }

        const href = typeof node.properties?.href === "string" ? node.properties.href : "";
        if (href && !isSafeUrl(href, false)) context.setProperty(node, "href", null);

        const source = typeof node.properties?.src === "string" ? node.properties.src : "";
        if (source && !isSafeUrl(source, true)) context.setProperty(node, "src", null);

        const style = typeof node.properties?.style === "string" ? node.properties.style : "";
        if (style && !safeTableAlignmentPattern.test(style)) context.setProperty(node, "style", null);
      },
    },
  });
}

function createHeadingPlugin() {
  const counters = { h2: 0, h3: 0 };
  const foundIds: Record<string, number> = {};
  return defineHastPlugin({
    name: "kirjolab-scientific-writing-headings",
    element: [
      {
        filter: ["h2", "h3", "h4"],
        visit(node, context) {
          const raw = context.textContent(node);
          if (node.tagName === "h4") {
            context.replaceNode(node, { type: "element", tagName: "b", properties: {}, children: node.children });
            return;
          }
          const explicitId = typeof node.properties?.id === "string" ? node.properties.id : undefined;
          const slug = explicitId ?? getUniqueSlug(raw, foundIds);
          const number = getHeadingNumber(node.tagName, counters);
          context.setProperty(node, "id", slug);
          context.prependChild(node, {
            type: "element",
            tagName: "span",
            properties: { class: "section-number" },
            children: [{ type: "text", value: `${number} ` }],
          });
        },
      },
    ],
  });
}

function collectReferences(source: string): Map<string, ReferenceEntry> {
  const references = new Map<string, ReferenceEntry>();
  const headings = [...source.matchAll(headingPattern)];
  const aliases = [...source.matchAll(aliasPattern)];
  const counters = { h2: 0, h3: 0 };
  const foundIds: Record<string, number> = {};
  for (const heading of headings) {
    const level = `h${heading[1]?.length ?? 2}`;
    const raw = heading[2] ?? "";
    const explicitId = heading[3];
    const slug = explicitId ?? getUniqueSlug(raw, foundIds);
    const number = level === "h4" ? "" : getHeadingNumber(level, counters);
    const title = [number, raw].filter(Boolean).join(" ");
    if (explicitId && !references.has(explicitId)) references.set(explicitId, { title, slug });
    for (const alias of aliases) {
      const attributes = parseAttributes(alias[2] ?? "");
      const target = attributes.get("target");
      const aliasSlug = attributes.get("slug");
      if (target && aliasSlug === slug && !references.has(target)) references.set(target, { title, slug });
    }
  }
  for (const anchor of source.matchAll(anchorPattern)) {
    const attributes = parseAttributes(anchor[2] ?? "");
    const target = attributes.get("target");
    if (target && !references.has(target)) {
      references.set(target, { title: anchor[1] ?? target, slug: attributes.get("slug") ?? slugify(target) });
    }
  }
  return references;
}

function validateSyntax(
  source: string,
  bibliography: Map<string, BibliographyEntry>,
  references: Map<string, ReferenceEntry>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const match of source.matchAll(directivePattern)) {
    const kind = match[1]?.toLowerCase() ?? "";
    const content = match[2]?.trim() ?? "";
    const attributes = parseAttributes(match[3] ?? "");
    if (kind === "cite") {
      const mode = attributes.get("mode") ?? "parenthetical";
      if (!new Set(["parenthetical", "textual", "full"]).has(mode))
        diagnostics.push(toDiagnostic(`Unsupported citation mode: ${mode}`, match));
      const ids = splitIds(content);
      if (ids.length === 0) diagnostics.push(toDiagnostic("Citation requires an id", match));
      for (const id of ids) if (!bibliography.has(id)) diagnostics.push(toDiagnostic(`Missing citation: ${id}`, match));
    } else if (kind === "ref") {
      const target = attributes.get("target") ?? content;
      if (!target) diagnostics.push(toDiagnostic("Reference requires a target", match));
      else if (!references.has(target)) diagnostics.push(toDiagnostic(`Missing reference: ${target}`, match));
    } else diagnostics.push(toDiagnostic(`Unsupported text directive: :${kind}`, match));
  }
  diagnostics.push(...validateReferenceDeclarations(source));
  for (const match of source.matchAll(/^#\s+.+$/gmu))
    diagnostics.push(toDiagnostic("Chapter source must start sections at level two", match));
  return diagnostics.sort((left, right) => left.from - right.from);
}

function validateReferenceDeclarations(source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declarations: Array<{ target: string; match: RegExpMatchArray }> = [];
  for (const match of source.matchAll(/^::([a-z][a-z-]*)\[[^\]]*\](?:\{[^}]*\})?\s*$/gimu)) {
    const kind = match[1]?.toLowerCase() ?? "";
    if (kind !== "alias" && kind !== "anchor") diagnostics.push(toDiagnostic(`Unsupported leaf directive: ::${kind}`, match));
  }
  for (const match of source.matchAll(/^:::([a-z][a-z-]*)\b.*$/gimu)) {
    diagnostics.push(toDiagnostic(`Unsupported container directive: :::${match[1]?.toLowerCase() ?? ""}`, match));
  }
  for (const heading of source.matchAll(/\{#([a-zA-Z0-9:_-]+)\}/gu)) {
    if (heading[1]) declarations.push({ target: heading[1], match: heading });
  }
  for (const match of source.matchAll(/^::(alias|anchor)\[([^\]]*)\]\{([^}]*)\}\s*$/gmu)) {
    const kind = match[1] ?? "anchor";
    const title = match[2]?.trim() ?? "";
    const attributes = parseAttributes(match[3] ?? "");
    const target = attributes.get("target") ?? "";
    if (!title) diagnostics.push(toDiagnostic(`${capitalize(kind)} requires a title`, match));
    if (!target) diagnostics.push(toDiagnostic(`${capitalize(kind)} requires a target`, match));
    else declarations.push({ target, match });
    if (kind === "alias" && target) {
      const slug = attributes.get("slug") ?? "";
      const hasHeading = [...source.matchAll(headingPattern)].some((heading) => slugify(heading[2] ?? "") === slug);
      if (!slug || !hasHeading) diagnostics.push(toDiagnostic(`Alias does not match heading slug: ${slug || "(empty)"}`, match));
    }
  }
  const seen = new Set<string>();
  for (const declaration of declarations) {
    if (seen.has(declaration.target)) diagnostics.push(toDiagnostic(`Duplicate reference: ${declaration.target}`, declaration.match));
    seen.add(declaration.target);
  }
  return diagnostics;
}

function renderCitation(citation: Citation, bibliography: Map<string, BibliographyEntry>, citationStyle: CitationStyle): string {
  const entries = citation.ids.map((id) => bibliography.get(id) ?? { id, author: id, title: id, year: "n.d." });
  const separator = citationStyle === "ieee" || citation.mode === "textual" ? ", " : "; ";
  const value = entries
    .map(
      (entry) =>
        `<button type="button" class="semantic-citation" data-citation="${escapeHtml(entry.id)}" aria-label="Open reference ${escapeHtml(entry.title || entry.id)}">${escapeHtml(formatCitation(entry, citation.mode, citationStyle, [...bibliography.keys()].indexOf(entry.id) + 1))}</button>`,
    )
    .join(separator);
  const wrapped = citation.mode === "parenthetical" ? (citationStyle === "ieee" ? `[${value}]` : `(${value})`) : value;
  const locator = citation.locator ? `, ${escapeHtml(citation.locator)}` : "";
  return `<span class="semantic-citation-group">${escapeHtml(citation.prefix ?? "")}${wrapped}${locator}${escapeHtml(citation.suffix ?? "")}</span>`;
}

function formatCitation(entry: BibliographyEntry, mode: string, citationStyle: CitationStyle, number: number): string {
  const author = entry.author.split(",", 1)[0]?.trim() || entry.id;
  if (citationStyle === "ieee") return mode === "textual" ? `${author} [${number}]` : String(number);
  if (mode === "full") return [author, entry.year, entry.title].filter(Boolean).join(". ");
  if (mode === "textual") return `${author} (${entry.year || "n.d."})`;
  return citationStyle === "chicago-author-date" ? `${author} ${entry.year || "n.d."}` : `${author}, ${entry.year || "n.d."}`;
}

function getHeadingNumber(type: string, counters: { h2: number; h3: number }): string {
  if (type === "h2") {
    counters.h2 += 1;
    counters.h3 = 0;
    return String(counters.h2);
  }
  counters.h3 += 1;
  return `${counters.h2}.${counters.h3}`;
}

function getUniqueSlug(raw: string, foundIds: Record<string, number>): string {
  const base = slugify(raw);
  const count = foundIds[base] ?? 0;
  foundIds[base] = count + 1;
  return count === 0 ? base : `${base}-${count + 1}`;
}

function splitIds(value: string): string[] {
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(attributePattern)) {
    const name = match[1];
    const value = match[2] ?? match[3];
    if (name && value !== undefined) attributes.set(name, value);
  }
  return attributes;
}

function attributeValue(value: string | null | undefined): string | undefined {
  return value || undefined;
}

function toDiagnostic(message: string, match: RegExpMatchArray): Diagnostic {
  const from = match.index ?? 0;
  return { severity: "error", message, from, to: from + match[0].length };
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function isSafeUrl(value: string, image: boolean): boolean {
  if (/^(?:https?:|\/|\.\/|\.\.\/|#)/iu.test(value)) return true;
  return !image && /^mailto:/iu.test(value);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// Stryker restore Regex
