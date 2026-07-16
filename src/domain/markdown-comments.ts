export interface MarkdownCommentRange {
  readonly from: number;
  readonly to: number;
}

export interface MarkdownCommentProjection {
  readonly masked: string;
  readonly ranges: readonly MarkdownCommentRange[];
  readonly unclosedFrom: number | null;
}

const commentOpening = /^[\t ]*:::[\t ]+comment[\t ]*$/iu;
const commentClosing = /^[\t ]*:::[\t ]*$/u;
const frontmatterDelimiter = /^(?:---|\+\+\+)[\t ]*$/u;
const fenceOpening = /^[\t ]{0,3}(?<marker>`{3,}|~{3,})/u;

export function projectMarkdownComments(source: string): MarkdownCommentProjection {
  const masked: string[] = [];
  const ranges: MarkdownCommentRange[] = [];
  let offset = 0;
  let commentFrom: number | null = null;
  let frontmatter: string | null = null;
  let fence: { readonly marker: "`" | "~"; readonly length: number } | null = null;

  for (const match of source.matchAll(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/gu)) {
    const line = match[0];
    const content = line.replace(/(?:\r\n|\r|\n)$/u, "");
    const newline = line.slice(content.length);
    if (commentFrom !== null) {
      masked.push(" ".repeat(content.length), newline);
      if (commentClosing.test(content)) {
        ranges.push({ from: commentFrom, to: offset + content.length });
        commentFrom = null;
      }
      offset += line.length;
      continue;
    }

    if (frontmatter !== null) {
      masked.push(line);
      if (content.trim() === frontmatter) frontmatter = null;
      offset += line.length;
      continue;
    }
    if (offset === 0 && frontmatterDelimiter.test(content.trim())) {
      frontmatter = content.trim();
      masked.push(line);
      offset += line.length;
      continue;
    }

    if (fence) {
      masked.push(line);
      if (closesFence(content, fence)) fence = null;
      offset += line.length;
      continue;
    }
    const openingFence = fenceOpening.exec(content);
    if (openingFence?.groups?.marker) {
      fence = { marker: openingFence.groups.marker.startsWith("`") ? "`" : "~", length: openingFence.groups.marker.length };
      masked.push(line);
      offset += line.length;
      continue;
    }

    if (commentOpening.test(content)) {
      commentFrom = offset;
      masked.push(" ".repeat(content.length), newline);
    } else {
      masked.push(line);
    }
    offset += line.length;
  }

  if (commentFrom !== null) ranges.push({ from: commentFrom, to: source.length });
  return { masked: masked.join(""), ranges, unclosedFrom: commentFrom };
}

function closesFence(content: string, fence: { readonly marker: "`" | "~"; readonly length: number }): boolean {
  const pattern = fence.marker === "`" ? /^[\t ]{0,3}(`{3,})[\t ]*$/u : /^[\t ]{0,3}(~{3,})[\t ]*$/u;
  return (pattern.exec(content)?.[1]?.length ?? 0) >= fence.length;
}
