export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  from: number;
  to: number;
}

// Stryker disable Regex: Syntax expressions are exercised through exact rendering and diagnostic cases; token-level regex mutation mostly creates invalid patterns.

interface BibliographyEntry {
  id: string;
  author: string;
  title: string;
  year: string;
}

interface RenderContext {
  bibliography: Map<string, BibliographyEntry>;
  references: Map<string, ReferenceEntry>;
}

interface ReferenceEntry {
  title: string;
  slug: string;
}

export interface RenderedDocument {
  html: string;
  diagnostics: Diagnostic[];
}

const directivePattern = /:(cite|ref)\[([^\]]*)\](?:\{([^}]*)\})?/gu;
const attributePattern = /([a-z][a-z-]*)="([^"]*)"/giu;

export function renderWorkspaceMarkdown(source: string, bibliographySource: string): RenderedDocument {
  const bibliography = parseBibliography(bibliographySource);
  const references = collectReferences(source);
  const diagnostics = validateDirectives(source, bibliography, references);
  const context = { bibliography, references } satisfies RenderContext;
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${renderInline(paragraph.join(" "), context)}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (list.length === 0) return;
    blocks.push(`<ul>${list.map((item) => `<li>${renderInline(item, context)}</li>`).join("")}</ul>`);
    list = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      if (code === null) code = [];
      else {
        blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }

    const heading = /^(#{2,4})\s+(.+?)(?:\s+\{#([a-zA-Z0-9:_-]+)\})?$/u.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]?.length ?? 2;
      const text = heading[2] ?? "";
      const id = heading[3] ?? slugify(text);
      blocks.push(`<h${level} id="${escapeHtml(id)}">${renderInline(text, context)}</h${level}>`);
      continue;
    }

    const anchor = /^::anchor\[([^\]]+)\]\{([^\}]*)\}$/u.exec(line);
    if (anchor) {
      flushParagraph();
      flushList();
      const attributes = parseAttributes(anchor[2] ?? "");
      const id = attributes.get("slug") ?? slugify(attributes.get("target") ?? anchor[1] ?? "anchor");
      blocks.push(`<span class="semantic-anchor" id="${escapeHtml(id)}" aria-label="${escapeHtml(anchor[1] ?? "anchor")}"></span>`);
      continue;
    }

    if (line.startsWith("::alias[")) continue;

    const listItem = /^[-*]\s+(.+)$/u.exec(line);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1] ?? "");
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  if (code !== null) blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);

  return { html: blocks.join(""), diagnostics };
}

export function parseBibliography(source: string): Map<string, BibliographyEntry> {
  const entries = new Map<string, BibliographyEntry>();
  const entryPattern = /@[a-z]+\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n\s*\}\s*(?:\n|$))/giu;
  for (const match of source.matchAll(entryPattern)) {
    const id = match[1];
    if (!id) continue;
    const body = match[2] ?? "";
    entries.set(id, {
      id,
      author: readBibField(body, "author"),
      title: readBibField(body, "title"),
      year: readBibField(body, "year"),
    });
  }
  return entries;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

function validateDirectives(
  source: string,
  bibliography: Map<string, BibliographyEntry>,
  references: Map<string, ReferenceEntry>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const match of source.matchAll(directivePattern)) {
    const kind = match[1];
    const content = match[2]?.trim() ?? "";
    const attributes = parseAttributes(match[3] ?? "");
    const from = match.index;
    const to = from + match[0].length;
    if (kind === "cite") {
      const mode = attributes.get("mode") ?? "parenthetical";
      if (!new Set(["parenthetical", "textual", "full"]).has(mode)) {
        diagnostics.push({ severity: "error", message: `Unsupported citation mode: ${mode}`, from, to });
      }
      const ids = content
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length === 0) diagnostics.push({ severity: "error", message: "Citation requires an id", from, to });
      for (const id of ids) {
        if (!bibliography.has(id)) diagnostics.push({ severity: "error", message: `Missing citation: ${id}`, from, to });
      }
    } else {
      const target = attributes.get("target") ?? content;
      if (!target) diagnostics.push({ severity: "error", message: "Reference requires a target", from, to });
      else if (!references.has(target)) diagnostics.push({ severity: "error", message: `Missing reference: ${target}`, from, to });
    }
  }

  const seen = new Map<string, number>();
  for (const match of source.matchAll(/\{#([a-zA-Z0-9:_-]+)\}/gu)) {
    const target = match[1];
    if (!target) continue;
    const previous = seen.get(target);
    if (previous !== undefined) {
      diagnostics.push({
        severity: "error",
        message: `Duplicate reference: ${target}`,
        from: match.index,
        to: match.index + match[0].length,
      });
    } else seen.set(target, match.index);
  }
  return diagnostics;
}

function collectReferences(source: string): Map<string, ReferenceEntry> {
  const references = new Map<string, ReferenceEntry>();
  for (const match of source.matchAll(/^(#{2,4})\s+(.+?)\s+\{#([a-zA-Z0-9:_-]+)\}\s*$/gmu)) {
    const title = match[2];
    const target = match[3];
    if (title && target && !references.has(target)) references.set(target, { title, slug: target });
  }
  for (const match of source.matchAll(/^::alias\[([^\]]+)\]\{([^\}]*)\}\s*$/gmu)) {
    const attributes = parseAttributes(match[2] ?? "");
    const target = attributes.get("target");
    if (target) references.set(target, { title: match[1] ?? target, slug: attributes.get("slug") ?? slugify(target) });
  }
  for (const match of source.matchAll(/^::anchor\[([^\]]+)\]\{([^\}]*)\}\s*$/gmu)) {
    const attributes = parseAttributes(match[2] ?? "");
    const target = attributes.get("target");
    if (target) references.set(target, { title: match[1] ?? target, slug: attributes.get("slug") ?? slugify(target) });
  }
  return references;
}

function renderInline(source: string, context: RenderContext): string {
  let cursor = 0;
  const rendered: string[] = [];
  for (const match of source.matchAll(directivePattern)) {
    rendered.push(renderBasicInline(source.slice(cursor, match.index)));
    rendered.push(renderDirective(match, context));
    cursor = match.index + match[0].length;
  }
  rendered.push(renderBasicInline(source.slice(cursor)));
  return rendered.join("");
}

function renderDirective(match: RegExpMatchArray, context: RenderContext): string {
  const kind = match[1];
  const content = match[2]?.trim() ?? "";
  const attributes = parseAttributes(match[3] ?? "");
  if (kind === "ref") {
    const target = attributes.get("target") ?? content;
    const reference = context.references.get(target);
    const label = attributes.get("text") ?? (attributes.has("target") ? content : reference?.title) ?? target;
    return `<a class="semantic-reference" href="#${escapeHtml(reference?.slug ?? slugify(target))}">${escapeHtml(label)}</a>`;
  }

  const mode = attributes.get("mode") ?? "parenthetical";
  const entries = content
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => context.bibliography.get(id) ?? { id, author: id, title: id, year: "n.d." });
  const separator = mode === "textual" ? ", " : "; ";
  const citation = entries.map((entry) => formatCitation(entry, mode)).join(separator);
  const wrapped = mode === "parenthetical" ? `(${citation})` : citation;
  const prefix = attributes.get("prefix") ?? "";
  const locator = attributes.get("locator") ? `, ${attributes.get("locator")}` : "";
  const suffix = attributes.get("suffix") ?? "";
  return `<span class="semantic-citation" data-citation="${escapeHtml(content)}">${escapeHtml(`${prefix}${wrapped}${locator}${suffix}`)}</span>`;
}

function renderBasicInline(source: string): string {
  return escapeHtml(source)
    .replaceAll(/`([^`]+)`/gu, "<code>$1</code>")
    .replaceAll(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replaceAll(/\*([^*]+)\*/gu, "<em>$1</em>")
    .replaceAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gu, '<a href="$2" rel="noreferrer">$1</a>');
}

function formatCitation(entry: BibliographyEntry, mode: string): string {
  const author = entry.author.split(",", 1)[0]?.trim() || entry.id;
  if (mode === "full") return [author, entry.year, entry.title].filter(Boolean).join(". ");
  if (mode === "textual") return `${author} (${entry.year || "n.d."})`;
  return `${author}, ${entry.year || "n.d."}`;
}

function readBibField(body: string, field: string): string {
  const match = new RegExp(`${field}\\s*=\\s*(?:\\{([^}]*)\\}|\"([^\"]*)\")`, "iu").exec(body);
  return (match?.[1] ?? match?.[2])?.trim() ?? "";
}

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(attributePattern)) {
    const name = match[1];
    const value = match[2];
    if (name && value !== undefined) attributes.set(name, value);
  }
  return attributes;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// Stryker restore Regex
