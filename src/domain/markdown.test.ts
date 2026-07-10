import { describe, expect, it } from "vitest";
import { parseBibliography, renderWorkspaceMarkdown, slugify } from "./markdown";

const bibliography = `@article{merton1942,
  author = {Merton, Robert K.},
  title = {The Normative Structure of Science},
  year = {1942}
}
`;

describe("renderWorkspaceMarkdown", () => {
  it("renders meaningful Markdown and extended scholarly directives", () => {
    const source = `::alias[Evidence]{target="sec:legacy" slug="evidence"}

## Evidence {#evidence}

Text with **weight**, *emphasis*, \`code\`, [source](https://example.com), :cite[merton1942]{mode="textual" locator="p. 4"}, and :ref[sec:legacy].

::anchor[table]{target="table:one" slug="table-one"}

- one
- two

\`\`\`ts
const answer = 42;
\`\`\`
`;
    const rendered = renderWorkspaceMarkdown(source, bibliography);

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain('<h2 id="evidence">Evidence</h2>');
    expect(rendered.html).toContain("Merton (1942), p. 4");
    expect(rendered.html).toContain('<a class="semantic-reference"');
    expect(rendered.html).toContain("<strong>weight</strong>");
    expect(rendered.html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(rendered.html).toContain("const answer = 42;");
    expect(rendered.html).toContain('id="table-one"');
    expect(rendered.html).toBe(
      '<h2 id="evidence">Evidence</h2><p>Text with <strong>weight</strong>, <em>emphasis</em>, <code>code</code>, <a href="https://example.com" rel="noreferrer">source</a>, <span class="semantic-citation" data-citation="merton1942">Merton (1942), p. 4</span>, and <a class="semantic-reference" href="#evidence">Evidence</a>.</p><span class="semantic-anchor" id="table-one" aria-label="table"></span><ul><li>one</li><li>two</li></ul><pre><code>const answer = 42;</code></pre>',
    );
  });

  it("reports missing, duplicate, empty, and unsupported directives", () => {
    const source = `## One {#same}
## Two {#same}

:cite[missing]{mode="unknown"} :cite[] :ref[absent] :ref[]
`;
    const messages = renderWorkspaceMarkdown(source, bibliography).diagnostics.map((diagnostic) => diagnostic.message);

    expect(messages).toContain("Missing citation: missing");
    expect(messages).toContain("Unsupported citation mode: unknown");
    expect(messages).toContain("Citation requires an id");
    expect(messages).toContain("Missing reference: absent");
    expect(messages).toContain("Reference requires a target");
    expect(messages).toContain("Duplicate reference: same");
    expect(messages).toEqual([
      "Unsupported citation mode: unknown",
      "Missing citation: missing",
      "Citation requires an id",
      "Missing reference: absent",
      "Reference requires a target",
      "Duplicate reference: same",
    ]);
  });

  it("renders full and parenthetical citations and closes an open code fence", () => {
    const source = `## Notes

:cite[merton1942]{mode="full" prefix="See " suffix="."}

:cite[merton1942]

\`\`\`
unfinished`;
    const rendered = renderWorkspaceMarkdown(source, bibliography);

    expect(rendered.html).toContain("See Merton. 1942. The Normative Structure of Science.");
    expect(rendered.html).toContain("(Merton, 1942)");
    expect(rendered.html).toContain("unfinished</code></pre>");
    expect(rendered.html).toBe(
      '<h2 id="notes">Notes</h2><p><span class="semantic-citation" data-citation="merton1942">See Merton. 1942. The Normative Structure of Science.</span></p><p><span class="semantic-citation" data-citation="merton1942">(Merton, 1942)</span></p><pre><code>unfinished</code></pre>',
    );
  });

  it("normalizes CRLF, joins paragraph lines, and renders heading levels", () => {
    expect(renderWorkspaceMarkdown("### Three\r\n\r\nline one\r\nline two\r\n\r\n#### Four", "").html).toBe(
      '<h3 id="three">Three</h3><p>line one line two</p><h4 id="four">Four</h4>',
    );
    expect(renderWorkspaceMarkdown("", "")).toEqual({ html: "", diagnostics: [] });
  });
});

describe("bibliography helpers", () => {
  it("parses entries and produces stable slugs", () => {
    expect(parseBibliography(bibliography).get("merton1942")).toMatchObject({ year: "1942" });
    expect(slugify("  A Meaningful: Heading! ")).toBe("a-meaningful-heading");
  });
});
