import { describe, expect, it } from "vitest";
import { headingNumbersByOffset, parseBibliography, renderWorkspaceMarkdown, slugify } from "./markdown";

const bibliography = `@article{merton1942,
  author = {Merton, Robert K.},
  title = {The Normative Structure of Science},
  year = {1942}
}`;

describe("Scholarmark runtime adapter", () => {
  it("renders labels, references, citations, and explicit bibliography placement", () => {
    const rendered = renderWorkspaceMarkdown(
      `## Evidence

::label[evidence]

Prior work matters :cite[merton1942]{locator="p. 270"}.

See :ref[evidence]{text="the evidence section"}.

## References

::bibliography[]`,
      bibliography,
    );

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain('<h2 data-source-from="0" data-source-to="11" id="evidence">');
    expect(rendered.html).toContain('class="semantic-label" id="evidence"');
    expect(rendered.html).toContain('data-citation="merton1942"');
    expect(rendered.html).toContain('data-locator="p. 270"');
    expect(rendered.html).toContain('data-reference="evidence" href="#evidence"');
    expect(rendered.html).toContain(">the evidence section</a>");
    expect(rendered.html).toContain('<ol class="semantic-bibliography"');
  });

  it("renders a labelled bounded native figure through the sanitizer", () => {
    const rendered = renderWorkspaceMarkdown(
      `:::figure{kind="boxplot" version=1 x-label="Time (ms)" y-label="Variant"}
::box[Baseline]{min=1 q1=2 median=3 q3=4 max=5}
::caption[Latency distribution]
:::
::label[result:latency]`,
      "",
    );

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain('<figure class="native-figure native-figure-boxplot"');
    expect(rendered.html).toContain('<svg viewBox="0 0 720 130" role="img"');
    expect(rendered.html).toContain("<figcaption>Latency distribution</figcaption>");
    expect(rendered.html).toContain('class="semantic-label" id="result:latency"');
  });

  it("omits portable comments and diagnoses an unclosed block", () => {
    const closed = renderWorkspaceMarkdown("Visible\n\n::: comment\nHidden :cite[missing]\n:::\n\nAfter", "");
    expect(closed.html).toContain("Visible");
    expect(closed.html).toContain("After");
    expect(closed.html).not.toContain("Hidden");
    expect(closed.diagnostics).toEqual([]);

    const unclosed = renderWorkspaceMarkdown("Visible\n\n::: comment\nHidden", "");
    expect(unclosed.html).not.toContain("Hidden");
    expect(unclosed.diagnostics).toEqual([
      { severity: "error", message: "Comment block is not closed", from: 9, to: 20 },
    ]);
  });

  it("keeps authored HTML inert and strips unsafe protocols", () => {
    const rendered = renderWorkspaceMarkdown(
      '<script>alert(1)</script>\n\n<a href="javascript:alert(2)">raw</a>\n\n[unsafe](javascript:alert(3)) ![unsafe](data:text/html,bad)',
      "",
    );

    expect(rendered.html).toContain("&#x3C;script>alert(1)&#x3C;/script>");
    expect(rendered.html).not.toContain("<script");
    expect(rendered.html).not.toMatch(/<a[^>]+href="javascript:/u);
    expect(rendered.html).not.toContain("data:text/html");
  });

  it("retains the reviewed GFM surface", () => {
    const rendered = renderWorkspaceMarkdown(
      `| State | Result |
| --- | ---: |
| Shared | **Visible** |

- [x] complete
- ~~obsolete~~

Footnote.[^note]

[^note]: Supporting detail.`,
      "",
    );

    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain("<table");
    expect(rendered.html).toContain('style="text-align: right"');
    expect(rendered.html).toContain('type="checkbox" checked disabled');
    expect(rendered.html).toContain(">obsolete</del>");
    expect(rendered.html).toContain("data-footnotes");
  });

  it("projects publication heading numbers into an isolated file", () => {
    const publication = "## One\n\n### Detail\n\n## Two";
    const detailOffset = publication.indexOf("### Detail");
    const twoOffset = publication.indexOf("## Two");
    expect(headingNumbersByOffset(publication)).toEqual({ 0: "1", [detailOffset]: "1.1", [twoOffset]: "2" });

    const rendered = renderWorkspaceMarkdown("### Detail", "", "apa", { headingNumbers: { 0: "4.2" } });
    expect(rendered.html).toContain('<span class="section-number">4.2 </span>Detail');
  });

  it("returns bounded diagnostics for invalid scholarly syntax", () => {
    const messages = renderWorkspaceMarkdown(
      `Paragraph
::label[same]

Another paragraph
::label[same]

:cite[missing]
:ref[absent]
::unknown[value]`,
      "",
    ).diagnostics.map(({ message }) => message);

    expect(messages).toContain("Duplicate label: same");
    expect(messages).toContain("Missing citation: missing");
    expect(messages).toContain("Missing label: absent");
    expect(messages).toContain("Unsupported leaf directive: ::unknown");
  });

  it("exposes the bounded bibliography and slug helpers", () => {
    expect(parseBibliography(bibliography).get("merton1942")).toMatchObject({ title: "The Normative Structure of Science", year: "1942" });
    expect(slugify("  A Meaningful: Heading! ")).toBe("a-meaningful-heading");
    expect(renderWorkspaceMarkdown("", "")).toEqual({ html: "", diagnostics: [] });
  });
});
