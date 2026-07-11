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

Text with **weight**, *emphasis*, \`code\`, [source](https://example.com), :cite[merton1942]{mode=textual locator="p. 4"}, and :ref[Evidence]{target="sec:legacy"}.

::anchor[table]{target="table:one" slug="table-one"}

- one
- two

\`\`\`ts
const answer = 42;
\`\`\`
`;
    const rendered = renderWorkspaceMarkdown(source, bibliography);

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain('<h2 id="evidence"><span class="section-number">1 </span>Evidence</h2>');
    expect(rendered.html).toContain(
      '<button type="button" class="semantic-citation" data-citation="merton1942" aria-label="Open reference The Normative Structure of Science">Merton (1942)</button>, p. 4',
    );
    expect(rendered.html).toContain('<a class="semantic-reference"');
    expect(rendered.html).toContain("<strong>weight</strong>");
    expect(rendered.html).toContain("<li>one</li>");
    expect(rendered.html).toContain("<li>two</li>");
    expect(rendered.html).toContain("const answer = 42;");
    expect(rendered.html).toContain('id="table-one"');
    expect(rendered.html).toContain('<a class="semantic-reference" href="#evidence">Evidence</a>');
    expect(rendered.html).toContain('<code class="language-ts">const answer = 42;');
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
      "Duplicate reference: same",
      "Unsupported citation mode: unknown",
      "Missing citation: missing",
      "Citation requires an id",
      "Missing reference: absent",
      "Reference requires a target",
    ]);
  });

  it("renders full and parenthetical citations and closes an open code fence", () => {
    const source = `## Notes

:cite[merton1942]{mode="full" prefix="See " suffix="."}

:cite[merton1942]

\`\`\`
unfinished`;
    const rendered = renderWorkspaceMarkdown(source, bibliography);

    expect(rendered.html).toContain("See <button");
    expect(rendered.html).toContain(">Merton. 1942. The Normative Structure of Science</button>.");
    expect(rendered.html).toContain(
      '(<button type="button" class="semantic-citation" data-citation="merton1942" aria-label="Open reference The Normative Structure of Science">Merton, 1942</button>)',
    );
    expect(rendered.html).toContain("unfinished\n</code></pre>");
    expect(rendered.html).toContain('<h2 id="notes"><span class="section-number">1 </span>Notes</h2>');
  });

  it("normalizes CRLF, joins paragraph lines, and renders heading levels", () => {
    const html = renderWorkspaceMarkdown("### Three\r\n\r\nline one\r\nline two\r\n\r\n#### Four", "").html;
    expect(html).toContain('<h3 id="three"><span class="section-number">0.1 </span>Three</h3>');
    expect(html).toContain("<p>line one\nline two</p>");
    expect(html).toContain("<b>Four</b>");
    expect(renderWorkspaceMarkdown("", "")).toEqual({ html: "", diagnostics: [] });
  });

  it("renders the documented GFM surface through Satteri", () => {
    const source = `---
title: Hidden frontmatter
---

## Syntax {#syntax}

![diagram](https://example.com/diagram.png)

| Method | Result |
| --- | --- |
| A | ~~41~~ **42** |

1. first
2. second

A statement with detail.[^detail]

[^detail]: Supporting *detail*.
`;
    const rendered = renderWorkspaceMarkdown(source, "");

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).not.toContain("Hidden frontmatter");
    expect(rendered.html).toContain('<img src="https://example.com/diagram.png" alt="diagram">');
    expect(rendered.html).toContain("<table>");
    expect(rendered.html).toContain("<del>41</del> <strong>42</strong>");
    expect(rendered.html).toContain("<ol>");
    expect(rendered.html).toContain("data-footnote-ref");
    expect(rendered.html).toContain('data-footnotes class="footnotes"');
  });

  it("validates unsupported directives and alias-heading mismatches", () => {
    const source = `::unknown[value]
:::unknown
content
:::

::alias[Missing]{target="sec:missing" slug="missing"}

## Present

:unknown[value]
# Chapter title
`;
    const messages = renderWorkspaceMarkdown(source, "").diagnostics.map((diagnostic) => diagnostic.message);

    expect(messages).toContain("Unsupported leaf directive: ::unknown");
    expect(messages).toContain("Unsupported container directive: :::unknown");
    expect(messages).toContain("Alias does not match heading slug: missing");
    expect(messages).toContain("Unsupported text directive: :unknown");
    expect(messages).toContain("Chapter source must start sections at level two");
  });

  it("renders authored HTML as text and removes unsafe link targets", () => {
    const rendered = renderWorkspaceMarkdown(
      '<img src=x onerror="alert(1)"> <button type="button" onclick="alert(1)">authored</button>\n\n[unsafe](javascript:alert(1)) ![unsafe](data:image/svg+xml,evil) [safe](mailto:test@example.org)',
      "",
    );

    expect(rendered.html).toContain('&lt;img src=x onerror="alert(1)"&gt;');
    expect(rendered.html).not.toContain("<img src=x onerror");
    expect(rendered.html).toContain('&lt;button type="button" onclick="alert(1)"&gt;authored&lt;/button&gt;');
    expect(rendered.html).not.toContain('<button type="button" onclick=');
    expect(rendered.html).not.toContain("javascript:");
    expect(rendered.html).not.toContain("data:image");
    expect(rendered.html).toContain('href="mailto:test@example.org"');
  });

  it("allows only reviewed properties from authored heading attributes", () => {
    const rendered = renderWorkspaceMarkdown(
      '## Safe heading {#safe .primary .secondary onmouseover="alert(1)" style="background:url(javascript:alert(1))" data-leak=yes aria-label="forged" title="forged" tabindex=0}',
      "",
    );

    expect(rendered.html).toContain('<h2 id="safe" class="primary secondary"><span class="section-number">1 </span>Safe heading</h2>');
    expect(rendered.html).not.toContain("onmouseover");
    expect(rendered.html).not.toContain("javascript:");
    expect(rendered.html).not.toContain("data-leak");
    expect(rendered.html).not.toContain("aria-label");
    expect(rendered.html).not.toContain("title=");
    expect(rendered.html).not.toContain("tabindex");
  });

  it("preserves the complete reviewed Markdown element and property vocabulary", () => {
    const rendered = renderWorkspaceMarkdown(
      `# One {#one .top}

## Two {#two .main}

### Three {#three}

#### Four

##### Five {#five}

###### Six {#six}

> quote with *emphasis* and **strong**

---

[link](https://example.com "title")  
next with \`inline\`

\`\`\`ts
const x = 1
\`\`\`

- [x] task
- item

3. third
4. fourth

| Left | Right |
| :--- | ---: |
| ~~old~~ | new |

![diagram](https://example.com/a.png "diagram")

Footnote.[^a]

[^a]: Note.
`,
      "",
    );

    for (const fragment of [
      '<h1 id="one" class="top">',
      '<h2 id="two" class="main"><span class="section-number">',
      '<h3 id="three"><span class="section-number">',
      "<b>Four</b>",
      '<h5 id="five">',
      '<h6 id="six">',
      "<blockquote>",
      "<p>quote with <em>emphasis</em> and <strong>strong</strong></p>",
      "<hr>",
      '<a href="https://example.com" title="title">',
      "<br>",
      "<code>inline</code>",
      '<pre><code class="language-ts">',
      '<ul class="contains-task-list">',
      '<li class="task-list-item"><input type="checkbox" checked disabled>',
      '<ol start="3">',
      "<table>",
      "<thead>",
      "<tbody>",
      "<tr>",
      '<th style="text-align: left">',
      '<td style="text-align: right">',
      "<del>old</del>",
      '<img src="https://example.com/a.png" alt="diagram" title="diagram">',
      '<sup><a href="#user-content-fn-a" id="user-content-fnref-a" data-footnote-ref aria-describedby="footnote-label">',
      '<section data-footnotes class="footnotes">',
      'data-footnote-backref="" aria-label="Back to reference 1" class="data-footnote-backref"',
    ]) {
      expect(rendered.html).toContain(fragment);
    }
  });

  it("resolves numbered aliases, unique slugs, anchors, and multiple citations", () => {
    const extendedBibliography = `${bibliography}
@article{doe2026,
  author = {Doe, Jane},
  title = {Inspectable Results},
  year = {2026}
}
`;
    const rendered = renderWorkspaceMarkdown(
      `::alias[Legacy]{target="sec:legacy" slug="repeated"}

## Repeated

## Repeated

::anchor[Table]{target="table:one"}

:ref[]{target="sec:legacy"} :ref[custom table]{target="table:one"}

:cite[merton1942, doe2026]{mode=textual prefix="See " suffix=" for context" locator="p. 4"}
`,
      extendedBibliography,
    );

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain('<h2 id="repeated"><span class="section-number">1 </span>Repeated</h2>');
    expect(rendered.html).toContain('<h2 id="repeated-2"><span class="section-number">2 </span>Repeated</h2>');
    expect(rendered.html).toContain('<a class="semantic-reference" href="#repeated">1 Repeated</a>');
    expect(rendered.html).toContain('<a class="semantic-reference" href="#table-one">custom table</a>');
    expect(rendered.html).toContain("See <button");
    expect(rendered.html).toContain(">Merton (1942)</button>, <button");
    expect(rendered.html).toContain(">Doe (2026)</button>, p. 4 for context");
  });

  it("diagnoses incomplete semantic declarations", () => {
    const messages = renderWorkspaceMarkdown("::anchor[]{}\n::alias[]{}", "").diagnostics.map((diagnostic) => diagnostic.message);

    expect(messages).toEqual(["Anchor requires a title", "Anchor requires a target", "Alias requires a title", "Alias requires a target"]);
  });
});

describe("bibliography helpers", () => {
  it("parses entries and produces stable slugs", () => {
    expect(parseBibliography(bibliography).get("merton1942")).toMatchObject({ year: "1942" });
    expect(slugify("  A Meaningful: Heading! ")).toBe("a-meaningful-heading");
  });
});
