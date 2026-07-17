import type { Element as HastElement, ElementContent as HastElementContent, Root as HastRoot, RootContent as HastRootContent } from "hast";
import type { Schema } from "hast-util-sanitize";
import type { Directives } from "mdast-util-directive";
import type { Heading, Html, Root as MdastRoot, RootContent as MdastRootContent } from "mdast";
import type { Node, Parent } from "unist";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";
import {
  citationModeForDirective,
  isCitationDirectiveName,
  publicationBibliographyText,
  publicationCitationAuthorLabel,
  publicationCitationEntries,
  type PublicationCitationEntry,
} from "./scholarly-export";
import type { CitationStyle } from "./workspace";
import { projectMarkdownComments, type MarkdownCommentRange } from "./markdown-comments";
import { parseNativeFigure, renderNativeFigure } from "./native-figures";

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  from: number;
  to: number;
}

type BibliographyEntry = PublicationCitationEntry;

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

export type HeadingNumbers = Readonly<Record<number, string>>;

export interface MarkdownRenderOptions {
  readonly headingNumbers?: HeadingNumbers;
}

// Stryker disable Regex: unified owns Markdown parsing; these expressions only locate the small semantic-directive validation surface.
const directivePattern = /(?<!:):([a-z][a-z-]*)\[([^\]]*)\](?:\{([^}]*)\})?/giu;
const attributePattern = /([a-z][a-z-]*)=(?:"([^"]*)"|([^\s}]+))/giu;
const headingPattern = /^(#{2,4})\s+(.+?)(?:\s+\{#([a-zA-Z0-9:_-]+)\})?\s*$/gmu;
const aliasPattern = /^::alias\[([^\]]*)\]\{([^}]*)\}\s*$/gmu;
const anchorPattern = /^::anchor\[([^\]]*)\]\{([^}]*)\}\s*$/gmu;
const safeTableAlignmentPattern = /^text-align: (?:center|left|right)$/u;

// Stryker disable all: The static sanitizer vocabulary is covered by the complete rendered-output test; static mutants cannot isolate its module initialization reliably.
const safeElements = [
  "a",
  "b",
  "blockquote",
  "br",
  "button",
  "code",
  "del",
  "em",
  "figcaption",
  "figure",
  "g",
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
  "svg",
  "span",
  "strong",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "title",
  "ul",
  "line",
  "rect",
  "text",
];

const previewSchema: Schema = {
  tagNames: safeElements,
  attributes: {
    "*": ["dataSourceFrom", "dataSourceTo"],
    a: ["ariaDescribedBy", "ariaLabel", "className", "dataFootnoteBackref", "dataFootnoteRef", "href", "id", "title"],
    button: ["ariaLabel", "className", "dataCitation", "dataLocator", ["type", "button"]],
    code: ["className"],
    figure: ["className", "id"],
    figcaption: ["className"],
    h1: ["className", "id"],
    h2: ["className", "id"],
    h3: ["className", "id"],
    h5: ["className", "id"],
    h6: ["className", "id"],
    img: ["alt", "src", "title"],
    input: ["checked", "disabled", ["type", "checkbox"]],
    li: ["className", "id"],
    ol: ["className", "start"],
    pre: ["className"],
    section: ["className", "dataFootnotes"],
    svg: ["ariaLabelledBy", "className", "role", "viewBox"],
    line: ["className", "x1", "x2", "y1", "y2"],
    rect: ["className", "height", "width", "x", "y"],
    text: ["className", "id", "x", "y"],
    title: ["id"],
    span: ["ariaLabel", "className", "dataCitation", "id"],
    td: [["style", safeTableAlignmentPattern]],
    th: [["style", safeTableAlignmentPattern]],
    ul: ["className"],
  },
  clobber: [],
  clobberPrefix: "",
  protocols: { href: ["http", "https", "mailto"], src: ["http", "https"] },
  required: { input: { disabled: true, type: "checkbox" } },
};
// Stryker restore all

export function renderWorkspaceMarkdown(
  source: string,
  bibliographySource: string,
  citationStyle: CitationStyle = "apa",
  options: MarkdownRenderOptions = {},
): RenderedDocument {
  const normalized = source.replaceAll("\r\n", "\n");
  const comments = projectMarkdownComments(normalized);
  const bibliography = parseBibliography(bibliographySource);
  const citedIds = collectCitationIds(comments.masked);
  const references = collectReferences(comments.masked);
  const diagnostics = [
    ...(comments.unclosedFrom === null
      ? []
      : [
          {
            severity: "error" as const,
            message: "Comment block is not closed",
            from: comments.unclosedFrom,
            to: normalized.indexOf("\n", comments.unclosedFrom) < 0 ? normalized.length : normalized.indexOf("\n", comments.unclosedFrom),
          },
        ]),
    ...validateSyntax(comments.masked, bibliography, references),
  ];

  try {
    const result = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkFrontmatter, ["yaml", "toml"])
      .use(remarkDirective)
      .use(removeMarkdownComments)
      .use(escapeAuthoredHtml)
      .use(readHeadingAttributes)
      .use(renderSemanticDirectives, { bibliography, citedIds, references, citationStyle, diagnostics })
      .use(remarkRehype)
      .use(annotatePreviewSourcePositions)
      .use(renderNumberedHeadings, options.headingNumbers)
      .use(normalizeTableAlignment)
      .use(rehypeSanitize, previewSchema)
      .use(rehypeStringify)
      .processSync(normalized);
    return { html: String(result), diagnostics: diagnostics.sort((left, right) => left.from - right.from) };
  } catch (error) {
    return {
      html: `<pre><code>${escapeHtml(normalized)}</code></pre>`,
      diagnostics: [
        ...diagnostics,
        {
          severity: "error",
          message: error instanceof Error ? error.message : "The Markdown renderer could not parse this document",
          from: 0,
          to: normalized.length,
        },
      ],
    };
  }
}

export function headingNumbersByOffset(source: string): HeadingNumbers {
  const normalized = source.replaceAll("\r\n", "\n");
  const masked = projectMarkdownComments(normalized).masked;
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml", "toml"]).use(remarkDirective).parse(masked);
  const counters = { h2: 0, h3: 0 };
  const numbers: Record<number, string> = {};
  visit(tree, "heading", (node: Heading) => {
    if (node.depth !== 2 && node.depth !== 3) return;
    const offset = node.position?.start.offset;
    if (offset === undefined) return;
    numbers[offset] = getHeadingNumber(`h${node.depth}`, counters);
  });
  return numbers;
}

function annotatePreviewSourcePositions() {
  return (tree: HastRoot): void => {
    visit(tree, "element", (node: HastElement) => {
      const from = node.position?.start.offset;
      const to = node.position?.end.offset;
      if (from === undefined || to === undefined || to <= from) return;
      node.properties.dataSourceFrom = String(from);
      node.properties.dataSourceTo = String(to);
    });
  };
}

function removeMarkdownComments() {
  return (tree: MdastRoot, file: { value: unknown }): void => {
    const source = String(file.value);
    pruneCommentChildren(tree, projectMarkdownComments(source).ranges, source);
  };
}

function pruneCommentChildren(parent: Parent, ranges: readonly MarkdownCommentRange[], source: string): void {
  parent.children = parent.children.flatMap((child) => pruneCommentNode(child, ranges, source));
}

function pruneCommentNode(node: Node, ranges: readonly MarkdownCommentRange[], source: string): Node[] {
  const from = node.position?.start.offset;
  const to = node.position?.end.offset;
  if (from === undefined || to === undefined) return [node];
  if (ranges.some((range) => from >= range.from && to <= range.to)) return [];
  const overlapping = ranges.filter((range) => range.from < to && range.to > from);
  if (overlapping.length === 0) return [node];
  if (isParent(node)) {
    pruneCommentChildren(node, overlapping, source);
    return node.children.length > 0 ? [node] : [];
  }
  if (!isValueNode(node) || source.slice(from, to) !== node.value) return [];
  let cursor = from;
  const visible: string[] = [];
  for (const range of overlapping) {
    if (range.from > cursor) visible.push(source.slice(cursor, Math.min(range.from, to)));
    cursor = Math.max(cursor, range.to);
  }
  if (cursor < to) visible.push(source.slice(cursor, to));
  node.value = visible.join("");
  return node.value ? [node] : [];
}

function isParent(node: Node): node is Parent {
  return "children" in node && Array.isArray(node.children);
}

function isValueNode(node: Node): node is Node & { value: string } {
  return "value" in node && typeof node.value === "string";
}

export function parseBibliography(source: string): Map<string, BibliographyEntry> {
  return new Map(publicationCitationEntries(source));
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("`", "")
    .trim()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

function escapeAuthoredHtml() {
  return (tree: MdastRoot): void => {
    visit(tree, "html", (node: Html, index, parent) => {
      if (index === undefined || !parent) return;
      parent.children[index] = { type: "text", value: node.value };
    });
  };
}

function readHeadingAttributes() {
  return (tree: MdastRoot, file: { value: unknown }): void => {
    const source = String(file.value);
    visit(tree, "heading", (node: Heading) => {
      const from = node.position?.start.offset;
      const to = node.position?.end.offset;
      if (from === undefined || to === undefined) return;
      const headingSource = source.slice(from, to);
      const match = /\s+\{([^{}]*)\}\s*$/u.exec(headingSource);
      if (!match) return;
      const attributeStart = from + match.index;
      node.children = node.children.flatMap((child) => {
        const childFrom = child.position?.start.offset;
        const childTo = child.position?.end.offset;
        if (childFrom === undefined || childTo === undefined || childTo <= attributeStart) return [child];
        if (childFrom >= attributeStart || child.type !== "text") return [];
        return [{ ...child, value: child.value.slice(0, attributeStart - childFrom) }];
      });
      const attributes = match[1] ?? "";
      const id = /(?:^|\s)#([a-zA-Z0-9:_-]+)/u.exec(attributes)?.[1];
      const className = [...attributes.matchAll(/(?:^|\s)\.([a-zA-Z0-9_-]+)/gu)]
        .map((item) => item[1])
        .filter((value): value is string => value !== undefined);
      node.data = {
        ...node.data,
        hProperties: {
          ...(id ? { id } : {}),
          ...(className.length > 0 ? { className } : {}),
        },
      };
    });
  };
}

interface SemanticOptions {
  bibliography: Map<string, BibliographyEntry>;
  citedIds: ReadonlySet<string>;
  references: Map<string, ReferenceEntry>;
  citationStyle: CitationStyle;
  diagnostics: Diagnostic[];
}

function renderSemanticDirectives(options: SemanticOptions) {
  return (tree: MdastRoot, file: { value: unknown }): void => {
    const source = String(file.value);
    visit(tree, (node, index, parent) => {
      if (node.type !== "textDirective" && node.type !== "leafDirective" && node.type !== "containerDirective") return;
      if (index === undefined || !parent) return;
      const directive: Directives = node;
      const content = mdastText(directive).trim();
      const directiveName = directive.name.toLocaleLowerCase();
      if (directive.type === "containerDirective" && directiveName === "figure") {
        const parsed = parseNativeFigure(directive);
        if (parsed.figure) {
          const rendered = renderNativeFigure(parsed.figure, directive.position?.start.offset ?? 0);
          directive.children = [];
          directive.data = {
            ...directive.data,
            hName: rendered.tagName,
            hProperties: rendered.properties,
            hChildren: rendered.children,
          };
        } else {
          options.diagnostics.push(
            ...parsed.issues.map((issue) => ({ severity: "error" as const, message: issue.message, from: issue.from, to: issue.to })),
          );
          const from = directive.position?.start.offset ?? 0;
          const to = directive.position?.end.offset ?? from;
          directive.children = [];
          directive.data = {
            ...directive.data,
            hName: "pre",
            hProperties: { className: ["native-figure-error"] },
            hChildren: [
              {
                type: "element",
                tagName: "code",
                properties: {},
                children: [{ type: "text", value: source.slice(from, to) }],
              },
            ],
          };
        }
        return [SKIP];
      }
      if ((directiveName === "box" || directiveName === "caption") && directive.type === "leafDirective") {
        const from = directive.position?.start.offset ?? 0;
        const to = directive.position?.end.offset ?? from;
        options.diagnostics.push({
          severity: "error",
          message: `::${directiveName} must be inside a :::figure container`,
          from,
          to,
        });
        directive.children = [];
        directive.data = {
          ...directive.data,
          hName: "code",
          hProperties: { className: ["native-figure-error"] },
          hChildren: [{ type: "text", value: source.slice(from, to) }],
        };
        return;
      }
      if (directive.type === "textDirective" && isCitationDirectiveName(directiveName)) {
        const locator = attributeValue(directive.attributes?.locator);
        const prefix = attributeValue(directive.attributes?.prefix);
        const suffix = attributeValue(directive.attributes?.suffix);
        const citation = {
          ids: splitIds(content),
          mode: citationModeForDirective(directiveName, attributeValue(directive.attributes?.mode)),
          ...(locator ? { locator } : {}),
          ...(prefix ? { prefix } : {}),
          ...(suffix ? { suffix } : {}),
        } satisfies Citation;
        directive.children = [];
        directive.data = {
          ...directive.data,
          hName: "span",
          hProperties: { className: ["semantic-citation-group"] },
          hChildren: citationChildren(citation, options.bibliography, options.citationStyle),
        };
        return;
      }
      if (directive.type === "textDirective" && directive.name === "ref") {
        const target = attributeValue(directive.attributes?.target) ?? content;
        const reference = options.references.get(target);
        const customText = attributeValue(directive.attributes?.text) ?? (directive.attributes?.target ? content : undefined);
        const label = customText || reference?.title || target;
        directive.children = [];
        directive.data = {
          ...directive.data,
          hName: "a",
          hProperties: { className: ["semantic-reference"], href: `#${reference?.slug ?? slugify(target)}` },
          hChildren: [{ type: "text", value: label }],
        };
        return;
      }
      if (directive.type === "leafDirective" && directive.name === "alias") {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      if (directive.type === "leafDirective" && directive.name === "anchor") {
        const target = attributeValue(directive.attributes?.target) ?? "";
        const slug = attributeValue(directive.attributes?.slug) ?? slugify(target);
        directive.children = [];
        directive.data = {
          ...directive.data,
          hName: "span",
          hProperties: { ariaLabel: content, className: ["semantic-anchor"], id: slug },
          hChildren: [],
        };
        return;
      }
      if (directive.type === "leafDirective" && directive.name === "bibliography") {
        const entries = [...options.bibliography.values()].filter((entry) => options.citedIds.has(entry.id));
        directive.children = [];
        directive.data = {
          ...directive.data,
          hName: "ol",
          hProperties: { className: ["semantic-bibliography"] },
          hChildren: entries.map((entry) => ({
            type: "element",
            tagName: "li",
            properties: {},
            children: [{ type: "text", value: publicationBibliographyText(entry, options.citationStyle) }],
          })),
        };
        return;
      }
      parent.children[index] = { type: "text", value: content };
    });
  };
}

function renderNumberedHeadings(headingNumbers: HeadingNumbers = {}) {
  return (tree: HastRoot): void => {
    const counters = { h2: 0, h3: 0 };
    const foundIds: Record<string, number> = {};
    visit(tree, "element", (node: HastElement, index, parent) => {
      if (node.tagName !== "h2" && node.tagName !== "h3" && node.tagName !== "h4") return;
      if (node.tagName === "h4") {
        if (index !== undefined && parent) parent.children[index] = { ...node, tagName: "b", properties: {} };
        return;
      }
      const raw = hastText(node);
      const explicitId = typeof node.properties.id === "string" ? node.properties.id : undefined;
      const slug = explicitId ?? getUniqueSlug(raw, foundIds);
      const generatedNumber = getHeadingNumber(node.tagName, counters);
      const number =
        node.position?.start.offset === undefined ? generatedNumber : (headingNumbers[node.position.start.offset] ?? generatedNumber);
      node.properties.id = slug;
      node.children.unshift({
        type: "element",
        tagName: "span",
        properties: { className: ["section-number"] },
        children: [{ type: "text", value: `${number} ` }],
      });
    });
  };
}

function normalizeTableAlignment() {
  return (tree: HastRoot): void => {
    visit(tree, "element", (node: HastElement) => {
      if (node.tagName !== "th" && node.tagName !== "td") return;
      const alignment = node.properties.align;
      delete node.properties.align;
      if (alignment === "center" || alignment === "left" || alignment === "right") {
        node.properties.style = `text-align: ${alignment}`;
      }
    });
  };
}

function citationChildren(
  citation: Citation,
  bibliography: Map<string, BibliographyEntry>,
  citationStyle: CitationStyle,
): HastElementContent[] {
  const entries = citation.ids.map((id) => bibliography.get(id) ?? { id, author: id, title: id, year: "n.d.", number: 0 });
  const separator = citationStyle === "ieee" || citation.mode === "textual" ? ", " : "; ";
  const children: HastElementContent[] = [];
  if (citation.prefix) children.push({ type: "text", value: citation.prefix });
  if (citation.mode === "parenthetical") children.push({ type: "text", value: citationStyle === "ieee" ? "[" : "(" });
  for (const [index, entry] of entries.entries()) {
    if (index > 0) children.push({ type: "text", value: separator });
    children.push({
      type: "element",
      tagName: "button",
      properties: {
        type: "button",
        className: ["semantic-citation"],
        dataCitation: entry.id,
        ...(citation.locator ? { dataLocator: citation.locator } : {}),
        ariaLabel: `Open reference ${entry.title || entry.id}`,
      },
      children: [
        {
          type: "text",
          value: formatCitation(entry, citation.mode, citationStyle, [...bibliography.keys()].indexOf(entry.id) + 1),
        },
      ],
    });
  }
  if (citation.mode === "parenthetical") children.push({ type: "text", value: citationStyle === "ieee" ? "]" : ")" });
  if (citation.locator) children.push({ type: "text", value: `, ${citation.locator}` });
  if (citation.suffix) children.push({ type: "text", value: citation.suffix });
  return children;
}

function mdastText(node: MdastRoot | MdastRootContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  return "children" in node ? node.children.map((child) => mdastText(child)).join("") : "";
}

function hastText(node: HastRoot | HastRootContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  return "children" in node ? node.children.map((child) => hastText(child)).join("") : "";
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

function collectCitationIds(source: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const match of source.matchAll(directivePattern)) {
    if (!isCitationDirectiveName(match[1]?.toLocaleLowerCase() ?? "")) continue;
    for (const id of splitIds(match[2] ?? "")) ids.add(id);
  }
  return ids;
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
    if (isCitationDirectiveName(kind)) {
      const mode = citationModeForDirective(kind, attributes.get("mode"));
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
  let bibliographyMarkers = 0;
  for (const match of source.matchAll(/^::([a-z][a-z-]*)\[([^\]]*)\](?:\{([^}]*)\})?\s*$/gimu)) {
    const kind = match[1]?.toLowerCase() ?? "";
    if (kind === "bibliography") {
      bibliographyMarkers += 1;
      if ((match[2]?.trim() ?? "") || (match[3]?.trim() ?? "")) {
        diagnostics.push(toDiagnostic("Bibliography marker must be exactly ::bibliography[]", match));
      } else if (bibliographyMarkers > 1) diagnostics.push(toDiagnostic("Duplicate bibliography marker", match));
    } else if (kind !== "alias" && kind !== "anchor" && kind !== "box" && kind !== "caption") {
      diagnostics.push(toDiagnostic(`Unsupported leaf directive: ::${kind}`, match));
    }
  }
  for (const match of source.matchAll(/^:::[ \t]*([a-z][a-z-]*)\b.*$/gimu)) {
    const kind = match[1]?.toLowerCase() ?? "";
    if (kind !== "figure") diagnostics.push(toDiagnostic(`Unsupported container directive: :::${kind}`, match));
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

function formatCitation(entry: BibliographyEntry, mode: string, citationStyle: CitationStyle, number: number): string {
  const author = publicationCitationAuthorLabel(entry);
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

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// Stryker restore Regex
