import { describe, expect, it } from "vitest";
import { mergeBibTeX, normalizeDoi, parseBibTeX, serializeBibTeX } from "./bibliography";

describe("BibTeX bibliography domain", () => {
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
});
