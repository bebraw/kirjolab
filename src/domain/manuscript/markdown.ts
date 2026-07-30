import {
  headingNumbersByOffset,
  parseBibliography,
  renderSync,
  slugify,
  type RenderedDocument as ScholarmarkDocument,
  type SyncMarkdownRenderOptions,
} from "scholarmark/browser";
import type { CitationStyle } from "../workspace/workspace";

export { headingNumbersByOffset, parseBibliography, slugify };
export type { Diagnostic, HeadingNumbers } from "scholarmark/browser";

export type MarkdownRenderOptions = SyncMarkdownRenderOptions;

export type RenderedDocument = Pick<ScholarmarkDocument, "diagnostics" | "html">;

export function renderWorkspaceMarkdown(
  source: string,
  bibliography: string,
  citationStyle: CitationStyle = "apa",
  options: MarkdownRenderOptions = {},
): RenderedDocument {
  const { diagnostics, html } = renderSync(source, bibliography, citationStyle, options);
  return { html, diagnostics };
}
