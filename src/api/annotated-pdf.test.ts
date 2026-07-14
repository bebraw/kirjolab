import { PDFDocument, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { LibraryHighlight, LibraryPdfMarkup } from "../domain/reference-library";
import { normalizedPointOnPage, renderAnnotatedPdf } from "./annotated-pdf";

const createdAt = "2026-07-14T10:00:00.000Z";

describe("annotated PDF export", () => {
  it("preserves pages while embedding printable notes, quote comments, and ink", async () => {
    const source = await PDFDocument.create({ updateMetadata: false });
    source.addPage([600, 800]);
    source.addPage([600, 800]).setRotation(degrees(90));
    const sourceBytes = await source.save({ useObjectStreams: false });
    const markups: LibraryPdfMarkup[] = [
      {
        id: "note",
        kind: "note",
        referenceId: "reference",
        artifactId: "artifact",
        page: 1,
        x: 0.25,
        y: 0.25,
        body: "Check this claim",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "drawing",
        kind: "drawing",
        referenceId: "reference",
        artifactId: "artifact",
        page: 2,
        color: "#d33f49",
        width: 4,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.4, y: 0.5 },
        ],
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const highlights: LibraryHighlight[] = [
      {
        id: "highlight",
        referenceId: "reference",
        artifactId: "artifact",
        page: 1,
        quote: "Quoted evidence",
        comment: "Useful context",
        createdAt,
        updatedAt: createdAt,
      },
    ];

    const result = await renderAnnotatedPdf(sourceBytes, { markups, highlights });
    const exported = await PDFDocument.load(result, { updateMetadata: false });
    expect(exported.getPageCount()).toBe(2);
    expect(exported.getProducer()).toBe("Kirjolab annotated PDF");
    expect(exported.getPage(0).node.Annots()?.size()).toBe(2);
    expect(result.byteLength).toBeGreaterThan(sourceBytes.byteLength);
  });

  it("maps top-left viewer coordinates through PDF page rotation", async () => {
    const document = await PDFDocument.create();
    const rotations = [0, 90, 180, 270] as const;
    const pages = rotations.map((rotation) => {
      const page = document.addPage([600, 800]);
      page.setRotation(degrees(rotation));
      return page;
    });
    expect(pages.map((page) => normalizedPointOnPage(page, { x: 0.25, y: 0.75 }))).toEqual([
      { x: 150, y: 200 },
      { x: 450, y: 200 },
      { x: 450, y: 600 },
      { x: 150, y: 600 },
    ]);
  });
});
