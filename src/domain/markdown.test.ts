import { describe, expect, it } from "vitest";
import { headingNumbersByOffset, parseBibliography, renderWorkspaceMarkdown, slugify } from "./markdown";

const bibliography = `@article{merton1942,
  author = {Merton, Robert K.},
  title = {The Normative Structure of Science},
  year = {1942}
}
`;

function withoutSourcePositions(html: string): string {
  return html.replaceAll(/ data-source-(?:from|to)="\d+"/gu, "");
}

describe("renderWorkspaceMarkdown", () => {
  it("renders an accessible deterministic native boxplot", () => {
    const source = `:::figure{#fcp-summary kind="boxplot" version=1 x-label="Time (ms)" y-label="Variant"}
::box[SSR & FCP]{min=1613 q1=1627 median=1628 q3=1632 max=1641}
::box[Islands]{min=838 q1=838 median=838 q3=846 max=858}
::caption[First Contentful Paint across five benchmark runs.]
:::`;

    const rendered = renderWorkspaceMarkdown(source, "");
    const html = withoutSourcePositions(rendered.html);

    expect(rendered.diagnostics).toEqual([]);
    expect(html).toContain('<figure id="fcp-summary" class="native-figure native-figure-boxplot">');
    expect(html).toContain('<svg viewBox="0 0 720 168" role="img" aria-labelledby="native-figure-title-0"');
    expect(html).toContain('<title id="native-figure-title-0">First Contentful Paint across five benchmark runs.</title>');
    expect(html).toContain('class="native-figure-box"');
    expect(html).toContain("SSR &#x26; FCP");
    expect(html).toContain("<figcaption>First Contentful Paint across five benchmark runs.</figcaption>");
    expect(html).not.toMatch(/(?:NaN|Infinity)/u);
  });

  it("keeps invalid native figure syntax visible and reports its source range", () => {
    const source = `:::figure{kind="boxplot" version=1}
::box[Broken]{min=5 q1=4 median=3 q3=2 max=1}
::caption[Needs correction]
:::`;
    const rendered = renderWorkspaceMarkdown(source, "");

    expect(rendered.diagnostics).toContainEqual({
      severity: "error",
      message: "Box values must satisfy min <= q1 <= median <= q3 <= max",
      from: source.indexOf("::box"),
      to: source.indexOf("\n::caption"),
    });
    expect(rendered.html).toContain('class="native-figure-error"');
    expect(rendered.html).toContain(":::figure");
    expect(rendered.html).not.toContain("<svg");
  });

  it("rejects native figure children outside their container", () => {
    const rendered = renderWorkspaceMarkdown("::box[Loose]{min=1 q1=2 median=3 q3=4 max=5}", "");

    expect(rendered.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(["::box must be inside a :::figure container"]);
    expect(rendered.html).toContain("::box[Loose]");
  });

  it("retains sanitized source offsets on rendered elements", () => {
    const rendered = renderWorkspaceMarkdown("## Evidence\n\nMapped paragraph.", "");

    expect(rendered.html).toContain('data-source-from="0" data-source-to="11"');
    expect(rendered.html).toContain('data-source-from="13" data-source-to="30"');
  });

  it("renders project citation profiles without changing citation identity", () => {
    const source = "Evidence :cite[merton1942, doe2026].";
    const sources = `${bibliography}\n@article{doe2026, author={Doe, Jane}, year={2026}, title={Methods}}`;
    const text = (style: "apa" | "chicago-author-date" | "ieee") =>
      renderWorkspaceMarkdown(source, sources, style).html.replaceAll(/<[^>]+>/gu, "");
    expect(text("apa")).toContain("(Merton, 1942; Doe, 2026)");
    expect(text("chicago-author-date")).toContain("(Merton 1942; Doe 2026)");
    expect(text("ieee")).toContain("[1, 2]");
  });
  it("renders natbib-style textual and parenthetical citation aliases", () => {
    const rendered = renderWorkspaceMarkdown("As :citet[merton1942] argues; compare :citep[merton1942].", bibliography);
    expect(rendered.diagnostics).toEqual([]);
    const text = rendered.html.replaceAll(/<[^>]+>/gu, "");
    expect(text).toContain("As Merton (1942) argues; compare (Merton, 1942).");
    expect(rendered.html.match(/data-citation="merton1942"/gu)).toHaveLength(2);
  });
  it("compacts preview citations with more than two authors", () => {
    const sources = `@article{conilh2023,
      author={Louise Conilh and Lenka Sadílková and Warren Viricel and Charles Dumontet},
      title={A collaborative study},
      year={2023}
    }`;
    const rendered = renderWorkspaceMarkdown("As :citet[conilh2023] reports; compare :citep[conilh2023].", sources);
    const text = rendered.html.replaceAll(/<[^>]+>/gu, "");

    expect(rendered.diagnostics).toEqual([]);
    expect(text).toContain("As Conilh et al. (2023) reports; compare (Conilh et al., 2023).");
    expect(text).not.toContain("Sadílková");
  });
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
    const html = withoutSourcePositions(rendered.html);

    expect(rendered.diagnostics).toEqual([]);
    expect(html).toContain('<h2 id="evidence"><span class="section-number">1 </span>Evidence</h2>');
    expect(html).toContain(
      '<button type="button" class="semantic-citation" data-citation="merton1942" data-locator="p. 4" aria-label="Open reference The Normative Structure of Science">Merton (1942)</button>, p. 4',
    );
    expect(html).toContain('<a class="semantic-reference"');
    expect(html).toContain("<strong>weight</strong>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).toContain("const answer = 42;");
    expect(html).toContain('id="table-one"');
    expect(html).toContain('<a class="semantic-reference" href="#evidence">Evidence</a>');
    expect(html).toContain('<code class="language-ts">const answer = 42;');
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
    const html = withoutSourcePositions(rendered.html);

    expect(html).toContain("See <button");
    expect(html).toContain(">Merton. 1942. The Normative Structure of Science</button>.");
    expect(html).toContain(
      '(<button type="button" class="semantic-citation" data-citation="merton1942" aria-label="Open reference The Normative Structure of Science">Merton, 1942</button>)',
    );
    expect(html).toContain("unfinished\n</code></pre>");
    expect(html).toContain('<h2 id="notes"><span class="section-number">1 </span>Notes</h2>');
  });

  it("renders cited references at an explicit bibliography marker", () => {
    const sources = `${bibliography}\n@article{unused, author={Unused, Una}, year={2025}, title={Unused work}}`;
    const rendered = renderWorkspaceMarkdown("Evidence :cite[merton1942].\n\n## References\n\n::bibliography[]", sources);
    const html = withoutSourcePositions(rendered.html);

    expect(rendered.diagnostics).toEqual([]);
    expect(html).toContain('<ol class="semantic-bibliography"><li>Merton, Robert K. (1942). The Normative Structure of Science.</li></ol>');
    expect(html).not.toContain("Unused work");
  });

  it("diagnoses malformed and duplicate bibliography markers", () => {
    const source = "::bibliography[all]\n::bibliography[]{scope=project}\n::bibliography[]\n::bibliography[]";
    const malformed = "::bibliography[all]";
    const scoped = "::bibliography[]{scope=project}";
    const firstDuplicate = source.indexOf("\n::bibliography[]\n") + 1;
    const secondDuplicate = source.lastIndexOf("::bibliography[]");

    expect(renderWorkspaceMarkdown(source, bibliography).diagnostics).toEqual([
      {
        severity: "error",
        message: "Bibliography marker must be exactly ::bibliography[]",
        from: source.indexOf(malformed),
        to: source.indexOf(malformed) + malformed.length,
      },
      {
        severity: "error",
        message: "Bibliography marker must be exactly ::bibliography[]",
        from: source.indexOf(scoped),
        to: source.indexOf(scoped) + scoped.length,
      },
      {
        severity: "error",
        message: "Duplicate bibliography marker",
        from: firstDuplicate,
        to: firstDuplicate + "::bibliography[]".length,
      },
      {
        severity: "error",
        message: "Duplicate bibliography marker",
        from: secondDuplicate,
        to: secondDuplicate + "::bibliography[]".length,
      },
    ]);
  });

  it("normalizes CRLF, joins paragraph lines, and renders heading levels", () => {
    const html = withoutSourcePositions(renderWorkspaceMarkdown("### Three\r\n\r\nline one\r\nline two\r\n\r\n#### Four", "").html);
    expect(html).toContain('<h3 id="three"><span class="section-number">0.1 </span>Three</h3>');
    expect(html).toContain("<p>line one\nline two</p>");
    expect(html).toContain("<b>Four</b>");
    expect(renderWorkspaceMarkdown("", "")).toEqual({ html: "", diagnostics: [] });
  });

  it("derives composed heading numbers and applies source-positioned overrides", () => {
    const source = "## Introduction\n\n::: comment\n## Hidden\n:::\n\n```md\n## Literal\n```\n\n## Method\n\n### Detail\n";
    const methodOffset = source.indexOf("## Method");
    const detailOffset = source.indexOf("### Detail");

    expect(headingNumbersByOffset(source)).toEqual({ 0: "1", [methodOffset]: "2", [detailOffset]: "2.1" });

    const isolated = "## Method\n\n### Detail\n";
    const html = withoutSourcePositions(
      renderWorkspaceMarkdown(isolated, "", "apa", {
        headingNumbers: { 0: "2", [isolated.indexOf("### Detail")]: "2.1" },
      }).html,
    );
    expect(html).toContain('<h2 id="method"><span class="section-number">2 </span>Method</h2>');
    expect(html).toContain('<h3 id="detail"><span class="section-number">2.1 </span>Detail</h3>');
  });

  it("renders the documented GFM surface through the JavaScript pipeline", () => {
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
    const html = withoutSourcePositions(rendered.html);

    expect(rendered.diagnostics).toEqual([]);
    expect(html).not.toContain("Hidden frontmatter");
    expect(html).toContain('<img src="https://example.com/diagram.png" alt="diagram">');
    expect(html).toContain("<table>");
    expect(html).toContain("<del>41</del> <strong>42</strong>");
    expect(html).toContain("<ol>");
    expect(html).toContain("data-footnote-ref");
    expect(html).toContain('data-footnotes class="footnotes"');
  });

  it("omits comment blocks and ignores their Markdown semantics", () => {
    const rendered = renderWorkspaceMarkdown(
      `## Visible

::: comment
## Hidden {#hidden}
Unpublished :cite[missing] and :unknown[value].
:::

After the comment.`,
      "",
    );

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain("Visible");
    expect(rendered.html).toContain("After the comment.");
    expect(rendered.html).not.toContain("Hidden");
    expect(rendered.html).not.toContain("Unpublished");
    expect(rendered.html).not.toContain('id="hidden"');
  });

  it("diagnoses an unclosed comment without rendering its contents", () => {
    const rendered = renderWorkspaceMarkdown("Before\n\n::: comment\nHidden", "");
    expect(rendered.diagnostics).toEqual([{ severity: "error", message: "Comment block is not closed", from: 8, to: 19 }]);
    expect(rendered.html).toContain("Before");
    expect(rendered.html).not.toContain("Hidden");
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
    const exact = (message: string, fragment: string, from = source.indexOf(fragment)) => ({
      severity: "error",
      message,
      from,
      to: from + fragment.length,
    });
    expect(renderWorkspaceMarkdown(source, "").diagnostics).toEqual([
      exact("Unsupported leaf directive: ::unknown", "::unknown[value]"),
      exact("Unsupported container directive: :::unknown", ":::unknown"),
      exact("Alias does not match heading slug: missing", '::alias[Missing]{target="sec:missing" slug="missing"}\n'),
      exact("Unsupported text directive: :unknown", ":unknown[value]", source.lastIndexOf(":unknown[value]")),
      exact("Chapter source must start sections at level two", "# Chapter title"),
    ]);
  });

  it("renders authored HTML as text and removes unsafe link targets", () => {
    const rendered = renderWorkspaceMarkdown(
      '<img src=x onerror="alert(1)"> <button type="button" onclick="alert(1)">authored</button>\n\n[unsafe](javascript:alert(1)) ![unsafe](data:image/svg+xml,evil) [safe](mailto:test@example.org)',
      "",
    );

    expect(rendered.html).toContain('&#x3C;img src=x onerror="alert(1)">');
    expect(rendered.html).not.toContain("<img src=x onerror");
    expect(rendered.html).toContain('&#x3C;button type="button" onclick="alert(1)">authored&#x3C;/button>');
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
    const html = withoutSourcePositions(rendered.html);

    expect(html).toContain('<h2 id="safe" class="primary secondary"><span class="section-number">1 </span>Safe heading</h2>');
    expect(html).not.toContain("onmouseover");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data-leak");
    expect(html).not.toContain("aria-label");
    expect(html).not.toContain("title=");
    expect(html).not.toContain("tabindex");
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
    const html = withoutSourcePositions(rendered.html);

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
      expect(html).toContain(fragment);
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
    const html = withoutSourcePositions(rendered.html);

    expect(rendered.diagnostics).toEqual([]);
    expect(html).toContain('<h2 id="repeated"><span class="section-number">1 </span>Repeated</h2>');
    expect(html).toContain('<h2 id="repeated-2"><span class="section-number">2 </span>Repeated</h2>');
    expect(html).toContain('<a class="semantic-reference" href="#repeated">1 Repeated</a>');
    expect(html).toContain('<a class="semantic-reference" href="#table-one">custom table</a>');
    expect(html).toContain("See <button");
    expect(html).toContain(">Merton (1942)</button>, <button");
    expect(html).toContain(">Doe (2026)</button>, p. 4 for context");
  });

  it("diagnoses incomplete semantic declarations", () => {
    const source = "::anchor[]{}\n::alias[]{}";
    const aliasFrom = source.indexOf("::alias");
    expect(renderWorkspaceMarkdown(source, "").diagnostics).toEqual([
      { severity: "error", message: "Anchor requires a title", from: 0, to: "::anchor[]{}".length },
      { severity: "error", message: "Anchor requires a target", from: 0, to: "::anchor[]{}".length },
      {
        severity: "error",
        message: "Alias requires a title",
        from: aliasFrom,
        to: aliasFrom + "::alias[]{}".length,
      },
      {
        severity: "error",
        message: "Alias requires a target",
        from: aliasFrom,
        to: aliasFrom + "::alias[]{}".length,
      },
    ]);
  });

  it("reads spaced multi-attribute headings without retaining attribute text", () => {
    const rendered = renderWorkspaceMarkdown("## **Bold** tail   {#long-id .first-class .second-class}   ", "");
    const html = withoutSourcePositions(rendered.html);

    expect(rendered.diagnostics).toEqual([]);
    expect(html).toBe(
      '<h2 id="long-id" class="first-class second-class"><span class="section-number">1 </span><strong>Bold</strong> tail</h2>',
    );
    expect(html).not.toContain("{#long-id");
  });

  it("reports an unclosed first-line comment through the exact end of input", () => {
    const source = "::: comment";
    const rendered = renderWorkspaceMarkdown(source, "");

    expect(rendered).toEqual({
      html: "",
      diagnostics: [{ severity: "error", message: "Comment block is not closed", from: 0, to: source.length }],
    });
  });

  it("anchors declaration validation to complete multi-character lines", () => {
    const source = `prefix ::bibliography[]
::bibliography[all-long]{scope=project-long}${"  "}
prefix :::unknown-container
:::unknown-container extra words
::anchor[Long title]{target="target-long"}${"  "}
::anchor[Duplicate title]{target="target-long"}  `;
    const diagnostics = renderWorkspaceMarkdown(source, "").diagnostics;

    expect(diagnostics.map(({ message }) => message)).toEqual([
      "Bibliography marker must be exactly ::bibliography[]",
      "Unsupported container directive: :::unknown-container",
      "Duplicate reference: target-long",
    ]);
    expect(diagnostics.map(({ from, to }) => source.slice(from, to))).toEqual([
      "::bibliography[all-long]{scope=project-long}  ",
      ":::unknown-container extra words",
      '::anchor[Duplicate title]{target="target-long"}  ',
    ]);
  });

  it("renders exact fallback citation punctuation for several missing entries", () => {
    const rendered = renderWorkspaceMarkdown(':cite[missing-a, missing-b]{mode=full prefix="Prefix " suffix=" suffix" locator="p. 9"}', "");
    const html = withoutSourcePositions(rendered.html);

    expect(rendered.diagnostics.map(({ message }) => message)).toEqual(["Missing citation: missing-a", "Missing citation: missing-b"]);
    expect(html).toBe(
      '<p><span class="semantic-citation-group">Prefix <button type="button" class="semantic-citation" data-citation="missing-a" data-locator="p. 9" aria-label="Open reference missing-a">missing-a. n.d.. missing-a</button>; <button type="button" class="semantic-citation" data-citation="missing-b" data-locator="p. 9" aria-label="Open reference missing-b">missing-b. n.d.. missing-b</button>, p. 9 suffix</span></p>',
    );
  });

  it("sorts syntax diagnostics before a later unclosed comment", () => {
    const source = "# Invalid chapter\n\n::: comment";
    const rendered = renderWorkspaceMarkdown(source, "");

    expect(rendered.diagnostics).toEqual([
      { severity: "error", message: "Chapter source must start sections at level two", from: 0, to: 17 },
      { severity: "error", message: "Comment block is not closed", from: 19, to: source.length },
    ]);
  });

  it("renders default anchor slugs, removes aliases, and rejects loose captions", () => {
    const source = `::alias[Legacy section]{target="legacy" slug="section"}
## Section
::anchor[Visible anchor]{target="Target Value"}
:ref[Custom label]{target="Target Value"}
::caption[Loose caption]`;
    const rendered = renderWorkspaceMarkdown(source, "");
    const html = withoutSourcePositions(rendered.html);

    expect(rendered.diagnostics.map(({ message }) => message)).toEqual(["::caption must be inside a :::figure container"]);
    expect(html).not.toContain("Legacy section");
    expect(html).toContain('<span aria-label="Visible anchor" class="semantic-anchor" id="target-value"></span>');
    expect(html).toContain('<a class="semantic-reference" href="#target-value">Custom label</a>');
    expect(html).toContain('<code class="native-figure-error">::caption[Loose caption]</code>');
  });

  it("normalizes uppercase semantic names and preserves unknown directive content", () => {
    const rendered = renderWorkspaceMarkdown(":CITEP[merton1942] and :UNKNOWN[Visible fallback]", bibliography);
    const html = withoutSourcePositions(rendered.html);

    expect(rendered.diagnostics.map(({ message }) => message)).toEqual(["Unsupported text directive: :unknown"]);
    expect(html.replaceAll(/<[^>]+>/gu, "")).toContain("(Merton, 1942)");
    expect(html).toContain("Visible fallback");
    expect(html).not.toContain("UNKNOWN");
  });
});

describe("bibliography helpers", () => {
  it("parses entries and produces stable slugs", () => {
    expect(parseBibliography(bibliography).get("merton1942")).toMatchObject({ year: "1942" });
    expect(slugify("  A Meaningful: Heading! ")).toBe("a-meaningful-heading");
    expect(slugify("  `Mixed`___ punctuation / and spaces  ")).toBe("mixed-punctuation-and-spaces");
    expect(slugify("`!`")).toBe("");
  });
});
