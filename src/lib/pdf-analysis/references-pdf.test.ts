import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { createReferenceEvidencePdf } from "../../test-support/pdf-fixture";
import { analyzePdfReferencePages } from "./references";

const corpus = [
  {
    name: "numbered DOI bibliography",
    pages: [
      ["Prior work [1] established the method."],
      [
        "References",
        "1. Doe, Jane. 2024. Inspectable Evidence. Journal of Tests. doi:10.5555/evidence.1",
        "2. Roe, Alex. 2023. Reproducible Pipelines. https://example.test/pipeline",
      ],
    ],
    expected: { candidates: 2, dois: ["10.5555/evidence.1"], mentions: 1, startPage: 2 },
  },
  {
    name: "author-year bibliography",
    pages: [["Results"], ["Bibliography", "Doe, Jane. (2022). Evaluation Without Guesswork. Evaluation Journal."]],
    expected: { candidates: 1, dois: [], mentions: 0, startPage: 2 },
  },
  {
    name: "document without bibliography",
    pages: [["Introduction", "No reference section appears in this paper."]],
    expected: { candidates: 0, dois: [], mentions: 0, startPage: null },
  },
] as const;

describe("PDF reference extraction corpus", () => {
  for (const sample of corpus) {
    it(`evaluates ${sample.name} from PDF bytes`, async () => {
      const pdf = await getDocument({
        data: new Uint8Array(createReferenceEvidencePdf(sample.pages)),
        standardFontDataUrl: new URL("../../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).href,
      }).promise;
      const pages = await Promise.all(
        Array.from({ length: pdf.numPages }, async (_unused, index) => {
          const page = await pdf.getPage(index + 1);
          const content = await page.getTextContent();
          return { page: index + 1, text: content.items.map((item) => ("str" in item ? item.str : "")).join("\n") };
        }),
      );
      const result = analyzePdfReferencePages(pages, pdf.numPages);
      expect({
        candidates: result.candidates.length,
        dois: result.candidates.map(({ doi }) => doi).filter(Boolean),
        mentions: result.mentions?.length ?? 0,
        startPage: result.referencesStartPage,
      }).toEqual(sample.expected);
    });
  }
});
