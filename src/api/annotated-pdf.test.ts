import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { LibraryHighlight, LibraryPdfMarkup } from "../domain/reference-library";
import { createRevisionEvidencePdf } from "../test-support/pdf-revision-fixture";
import { normalizedPointOnPage, renderAnnotatedPdf } from "./annotated-pdf";

const createdAt = "2026-07-14T10:00:00.000Z";

describe("annotated PDF export", () => {
  it("anonymizes imported and new annotations and discards metadata and obsolete objects", async () => {
    const source = await PDFDocument.create({ updateMetadata: false });
    const page = source.addPage([600, 800]);
    source.setAuthor("Ordinary metadata identity");
    source.setTitle("Identifying document title");
    source.setCreator("Reviewer workstation");
    const metadata = source.context.register(
      source.context.stream("<x:xmpmeta>XMP reviewer identity</x:xmpmeta>", {
        Type: "Metadata",
        Subtype: "XML",
      }),
    );
    source.catalog.set(PDFName.of("Metadata"), metadata);
    page.node.set(PDFName.of("Metadata"), metadata);
    page.node.set(PDFName.of("PieceInfo"), source.context.obj({ Preview: { Private: PDFString.of("Preview private identity") } }));
    source.context.register(PDFString.of("Unreachable reviewer identity"));
    const imported = source.context.obj({
      Subtype: "Text",
      Rect: [40, 60, 54, 74],
      Contents: PDFHexString.fromText("Imported comment — preserve me"),
      T: source.context.register(PDFHexString.fromText("Preview reviewer identity")),
      NM: PDFString.of("Identifying annotation identifier"),
      M: PDFString.of("D:20261117090000Z"),
      CreationDate: PDFString.of("D:20261116090000Z"),
      Subj: PDFString.of("Reviewer subject identity"),
      Author: PDFString.of("Custom reviewer identity"),
      "AAPL:AKPDFAnnotationDictionary": source.context.obj({ Author: PDFString.of("Preview private annotation identity") }),
      RC: PDFString.of('<body author="Rich text reviewer identity">Imported comment — preserve me</body>'),
      F: 4,
      P: page.ref,
    });
    page.node.addAnnot(source.context.register(imported));
    const original = await source.save({ useObjectStreams: true });
    const result = await renderAnnotatedPdf(original, {
      anonymous: true,
      highlights: [],
      markups: [
        {
          id: "new-note",
          kind: "note",
          referenceId: "reference",
          artifactId: "artifact",
          page: 1,
          x: 0.5,
          y: 0.5,
          body: "New review comment",
          createdAt,
          updatedAt: createdAt,
        },
      ],
    });
    const exported = await PDFDocument.load(result, { updateMetadata: false });
    expect(exported.context.trailerInfo.Info).toBeUndefined();
    expect(exported.context.trailerInfo.ID).toBeUndefined();
    expect(exported.catalog.has(PDFName.of("Metadata"))).toBe(false);
    expect(exported.getPage(0).node.has(PDFName.of("Metadata"))).toBe(false);
    expect(exported.getPage(0).node.has(PDFName.of("PieceInfo"))).toBe(false);
    const physicalObjects = exported.context
      .enumerateIndirectObjects()
      .map(([, object]) => object.toString())
      .join("\n");
    for (const identity of [
      "Ordinary metadata identity",
      "XMP reviewer identity",
      "Preview private identity",
      "Unreachable reviewer identity",
      "Preview reviewer identity",
      "Reviewer subject identity",
      "Rich text reviewer identity",
      "Custom reviewer identity",
      "Preview private annotation identity",
    ]) {
      expect(physicalObjects).not.toContain(identity);
      expect(physicalObjects).not.toContain(PDFHexString.fromText(identity).toString());
    }
    const annotation = exported.context.lookup(exported.getPage(0).node.Annots()!.get(0), PDFDict);
    expect(annotation.lookup(PDFName.of("T"), PDFHexString).decodeText()).toBe("Reviewer");
    expect(annotation.lookup(PDFName.of("Rect"), PDFArray).asArray().map(String)).toEqual(["40", "60", "54", "74"]);
    for (const key of ["NM", "M", "CreationDate", "Subj", "RC"]) expect(annotation.has(PDFName.of(key))).toBe(false);
    const task = getDocument({ data: new Uint8Array(result) });
    try {
      const pdf = await task.promise;
      const annotations = await (await pdf.getPage(1)).getAnnotations();
      expect(
        annotations
          .filter((item) => item.subtype === "Text")
          .map((item) => ({ author: item.titleObj.str, text: item.contentsObj.str, rect: item.rect })),
      ).toEqual([
        { author: "Reviewer", text: "Imported comment — preserve me", rect: [40, 52, 62, 74] },
        { author: "Reviewer", text: "New review comment", rect: [293, 385, 315, 407] },
      ]);
    } finally {
      await task.destroy();
    }
    // The comment remains a writable annotation, rather than flattened page content.
    annotation.set(PDFName.of("Contents"), PDFHexString.fromText("Edited after export"));
    const edited = await PDFDocument.load(await exported.save(), { updateMetadata: false });
    expect(
      edited.context.lookup(edited.getPage(0).node.Annots()!.get(0), PDFDict).lookup(PDFName.of("Contents"), PDFHexString).decodeText(),
    ).toBe("Edited after export");
    expect(await source.save({ useObjectStreams: true })).toEqual(original);
  });

  const revisionFixtures: ReadonlyArray<Parameters<typeof createRevisionEvidencePdf>[0]> = [
    { xref: "table" },
    { xref: "table", objects: "obsolete-stream" },
    { xref: "incremental-table" },
    { xref: "incremental-table", objects: "obsolete-stream" },
    { xref: "stream" },
    { xref: "stream", objects: "obsolete-stream" },
    { xref: "stream", objects: "active-stream" },
    { xref: "hybrid" },
    { xref: "hybrid", objects: "obsolete-stream" },
    { xref: "hybrid", objects: "active-stream" },
  ];

  it.each(revisionFixtures)("preserves every current page and font with $xref / $objects references", async (fixture) => {
    const source = createRevisionEvidencePdf(fixture);
    const result = await renderAnnotatedPdf(source, {
      highlights: [],
      markups: [
        {
          id: "last-page-note",
          kind: "note",
          referenceId: "reference",
          artifactId: "artifact",
          page: 3,
          x: 0.25,
          y: 0.25,
          body: "Review the final conclusion.",
          createdAt,
          updatedAt: createdAt,
        },
      ],
    });
    // PDF.js resolves cross-references independently of the editing library.
    const task = getDocument({
      data: new Uint8Array(result),
      standardFontDataUrl: fileURLToPath(new URL("../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).href),
    });
    try {
      const document = await task.promise;
      expect(document.numPages).toBe(3);
      const texts: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const text = await page.getTextContent();
        texts.push(text.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(""));
        expect(Object.values(text.styles).map((style) => style.fontFamily)).toEqual(["serif"]);
      }
      expect(texts).toEqual([
        "First page: inspectable evidence.",
        "Second page: reproducible methods.",
        "Final page: the current conclusion survives.",
      ]);
      const annotations: unknown[] = await (await document.getPage(3)).getAnnotations();
      expect(annotations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ subtype: "Text", contentsObj: expect.objectContaining({ str: "Review the final conclusion." }) }),
        ]),
      );
    } finally {
      await task.destroy();
    }
  });

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
        rects: [
          { x: 0.2, y: 0.3, width: 0.25, height: 0.03 },
          { x: 0.2, y: 0.34, width: 0.4, height: 0.03 },
        ],
        createdAt,
        updatedAt: createdAt,
      },
    ];

    const result = await renderAnnotatedPdf(sourceBytes, { markups, highlights });
    const exported = await PDFDocument.load(result, { updateMetadata: false });
    expect(exported.getPageCount()).toBe(2);
    expect(exported.getProducer()).toBe("Kirjolab annotated PDF");
    const annotations = exported.getPage(0).node.Annots();
    expect(annotations?.size()).toBe(3);
    if (!annotations) throw new Error("Expected exported annotations");
    const highlight = exported.context.lookup(annotations.get(2), PDFDict);
    expect(highlight.lookup(PDFName.of("QuadPoints"), PDFArray).size()).toBe(16);
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
