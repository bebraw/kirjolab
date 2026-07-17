import { describe, expect, it } from "vitest";
import {
  bibTeXDisplayText,
  bibTeXPublicationProjectionsEqual,
  mergeBibTeX,
  normalizeDoi,
  parseBibTeX,
  projectBibTeXPublication,
  serializeBibTeX,
  type BibTeXPublicationProjection,
} from "./bibliography";

describe("BibTeX bibliography domain", () => {
  it("decodes protective markup for display without changing parsed fields", () => {
    const source = String.raw`@misc{display, title={{H}{T}{M}{L} {F}irst}, author={Veps{\"a}l{\"a}inen}, note={Set \{A\} with {\LaTeX} \& {TeX}}}`;
    const [entry] = parseBibTeX(source);
    expect(entry?.fields.title).toBe("{H}{T}{M}{L} {F}irst");
    expect(bibTeXDisplayText(entry?.fields.title ?? "")).toBe("HTML First");
    expect(bibTeXDisplayText(entry?.fields.author ?? "")).toBe("Vepsäläinen");
    expect(bibTeXDisplayText(entry?.fields.note ?? "")).toBe("Set {A} with LaTeX & TeX");
    expect(serializeBibTeX(entry ? [entry] : [])).toContain("title = {{H}{T}{M}{L} {F}irst}");
  });

  it("parses braced, quoted, numeric, nested, and parenthesized entries", () => {
    expect(
      parseBibTeX(`
        @article{Merton1942,
          author = {Merton, Robert K. and Doe, Jane},
          title = "The {Normative} Structure of Science",
          year = 1942,
          doi = {https://doi.org/10.1000/Example}
        }
        @book(Smith2020,
          title = {A Book},
          publisher = {Example Press}
        )
      `),
    ).toEqual([
      {
        type: "article",
        citationKey: "Merton1942",
        fields: {
          author: "Merton, Robert K. and Doe, Jane",
          title: "The {Normative} Structure of Science",
          year: "1942",
          doi: "https://doi.org/10.1000/Example",
        },
      },
      { type: "book", citationKey: "Smith2020", fields: { title: "A Book", publisher: "Example Press" } },
    ]);
  });

  it("merges keys case-insensitively and serializes a stable field order", () => {
    const merged = mergeBibTeX(
      "@article{same, title={Old}, year={2020}}\n@misc{zeta, title={Last}}",
      "@article{Same, title={New}, author={Researcher}, doi={10.1/example}}\n@book{alpha, title={First}}",
    );

    expect(merged.entries.map((entry) => entry.citationKey)).toEqual(["alpha", "Same", "zeta"]);
    expect(merged.source).toBe(
      "@book{alpha,\n  title = {First}\n}\n\n@article{Same,\n  author = {Researcher},\n  title = {New},\n  doi = {10.1/example}\n}\n\n@misc{zeta,\n  title = {Last}\n}\n",
    );
    expect(serializeBibTeX([])).toBe("");
  });

  it("ignores directives and malformed entries without inventing records", () => {
    expect(parseBibTeX('@comment{ignore}\n@string{j = "Journal"}\n@article{missing-fields}\n@article{bad key, title={No}}')).toEqual([]);
    expect(parseBibTeX("@article{open, title={Never closes}")).toEqual([]);
    expect(normalizeDoi(" HTTPS://doi.org/10.1000/Example ")).toBe("10.1000/example");
    expect(normalizeDoi("10.2000/Plain")).toBe("10.2000/plain");
  });

  it("keeps entry boundaries and directive bodies out of the resource set", () => {
    expect(
      parseBibTeX(`
        @comment{fake, title={Comment record}}
        @preamble{fake, title={Preamble record}}
        @string{fake, title={String record}}
        @article{outer,
          title = {Text containing @book{inner, title={Not an entry}}},
          note = {Kept}
        }
        @misc{real, title={Real entry}}
      `),
    ).toEqual([
      {
        type: "article",
        citationKey: "outer",
        fields: { title: "Text containing @book{inner, title={Not an entry}}", note: "Kept" },
      },
      { type: "misc", citationKey: "real", fields: { title: "Real entry" } },
    ]);
    expect(parseBibTeX("@article!{fake, title={No}}\n@article{, title={No key}}")).toEqual([]);
  });

  it("handles field boundaries and whitespace without changing their meaning", () => {
    expect(
      parseBibTeX(`@article{ spaced-key ,
        title = "A \\"quoted\\" title",
        abstract = {Line one\n          line two},
        month = jul,
        broken
      }`),
    ).toEqual([
      {
        type: "article",
        citationKey: "spaced-key",
        fields: {
          title: 'A \\"quoted\\" title',
          abstract: "Line one line two",
          month: "jul",
        },
      },
    ]);
    expect(parseBibTeX('@article{key, title "Missing equals"}')).toEqual([{ type: "article", citationKey: "key", fields: {} }]);
  });

  it("serializes every preferred field before alphabetical extension fields", () => {
    expect(
      serializeBibTeX([
        {
          type: "article",
          citationKey: "all",
          fields: {
            zeta: "Z",
            abstract: "Abstract",
            url: "https://example.org",
            doi: "10.1000/all",
            pages: "1--2",
            number: "2",
            volume: "1",
            publisher: "Press",
            booktitle: "Proceedings",
            journal: "Journal",
            year: "2026",
            title: "Title",
            author: "Doe, Jane",
            alpha: "A",
          },
        },
      ]),
    ).toBe(`@article{all,
  author = {Doe, Jane},
  title = {Title},
  year = {2026},
  journal = {Journal},
  booktitle = {Proceedings},
  publisher = {Press},
  volume = {1},
  number = {2},
  pages = {1--2},
  doi = {10.1000/all},
  url = {https://example.org},
  abstract = {Abstract},
  alpha = {A},
  zeta = {Z}
}
`);
    expect(normalizeDoi("http://dx.doi.org/10.1000/Mixed")).toBe("10.1000/mixed");
  });

  it("projects normalized publication fields from a parsed entry", () => {
    const [entry] = parseBibTeX(`@article{Inspectable2026,
      author = {Doe, Jane and   Roe, Richard AND Smith, Alex},
      title = {Inspectable Evidence},
      year = {2026},
      journal = {Journal of Open Evidence},
      booktitle = {Ignored Proceedings},
      doi = {https://doi.org/10.1000/Inspectable},
      url = {https://example.org/paper},
      abstract = {Evidence remains connected.}
    }`);
    if (!entry) throw new Error("Expected a parsed BibTeX entry");

    expect(projectBibTeXPublication(entry)).toEqual({
      citationKey: "Inspectable2026",
      type: "article",
      title: "Inspectable Evidence",
      authors: ["Doe, Jane", "Roe, Richard", "Smith, Alex"],
      year: "2026",
      venue: "Journal of Open Evidence",
      doi: "10.1000/inspectable",
      url: "https://example.org/paper",
      abstract: "Evidence remains connected.",
    });
  });

  it("uses booktitle, publisher, and empty publication fallbacks deterministically", () => {
    expect(
      projectBibTeXPublication({
        citationKey: "proceedings",
        type: "inproceedings",
        fields: { title: "Conference Paper", booktitle: "Proceedings of Inspection", publisher: "Ignored Press" },
      }),
    ).toMatchObject({ venue: "Proceedings of Inspection" });
    expect(
      projectBibTeXPublication({
        citationKey: "book",
        type: "book",
        fields: { title: "Published Work", publisher: "Inspection Press", author: " and Doe, Jane and " },
      }),
    ).toMatchObject({ authors: ["Doe, Jane"], venue: "Inspection Press" });
    expect(projectBibTeXPublication({ citationKey: "minimal", type: "misc", fields: {} })).toEqual({
      citationKey: "minimal",
      type: "misc",
      title: "Untitled publication",
      authors: [],
      year: "",
      venue: "",
      doi: "",
      url: "",
      abstract: "",
    });
  });

  it("detects exact projection equality and every material field change", () => {
    const projection: BibTeXPublicationProjection = {
      citationKey: "same",
      type: "article",
      title: "Same title",
      authors: ["Doe, Jane", "Roe, Richard"],
      year: "2026",
      venue: "Journal",
      doi: "10.1000/same",
      url: "https://example.org/same",
      abstract: "Same abstract",
    };
    expect(bibTeXPublicationProjectionsEqual(projection, { ...projection, authors: [...projection.authors] })).toBe(true);

    const changes: BibTeXPublicationProjection[] = [
      { ...projection, citationKey: "changed" },
      { ...projection, type: "book" },
      { ...projection, title: "Changed title" },
      { ...projection, authors: ["Roe, Richard", "Doe, Jane"] },
      { ...projection, authors: ["Doe, Jane"] },
      { ...projection, authors: ["Doe, Jane", "Roe, Richard", "Smith, Alex"] },
      { ...projection, year: "2027" },
      { ...projection, venue: "Changed Journal" },
      { ...projection, doi: "10.1000/changed" },
      { ...projection, url: "https://example.org/changed" },
      { ...projection, abstract: "Changed abstract" },
    ];
    for (const changed of changes) expect(bibTeXPublicationProjectionsEqual(projection, changed), JSON.stringify(changed)).toBe(false);
  });
});
