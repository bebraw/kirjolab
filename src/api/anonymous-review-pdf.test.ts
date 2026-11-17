import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderAnnotatedPdf } from "./annotated-pdf";
import { createRevisionEvidencePdf } from "../test-support/pdf-revision-fixture";

const emptyReview = { anonymous: true, markups: [], highlights: [] } as const;

describe("anonymous review PDF", () => {
  it("anonymizes page annotations even when an editor omits Type or uses an unfamiliar subtype", async () => {
    const source = await PDFDocument.create({ updateMetadata: false });
    const page = source.addPage();
    page.node.addAnnot(
      source.context.register(
        source.context.obj({
          Subtype: "CustomComment",
          Rect: [20, 30, 40, 50],
          T: PDFString.of("Private author"),
          Contents: PDFString.of("Retained comment"),
        }),
      ),
    );
    const result = await PDFDocument.load(await renderAnnotatedPdf(await source.save(), emptyReview), { updateMetadata: false });
    const annotation = result.context.lookup(result.getPage(0).node.Annots()!.get(0), PDFDict);
    expect(annotation.lookup(PDFName.of("T"), PDFHexString).decodeText()).toBe("Reviewer");
    expect(annotation.lookup(PDFName.of("Contents"), PDFString).decodeText()).toBe("Retained comment");
  });

  it.each([
    { xref: "incremental-table", objects: "obsolete-stream" },
    { xref: "stream", objects: "active-stream" },
  ] as const)("preserves current page text across $xref revisions", async (fixture) => {
    const bytes = await renderAnnotatedPdf(createRevisionEvidencePdf(fixture), emptyReview);
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    try {
      const pdf = await task.promise;
      const texts: string[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const text = await page.getTextContent();
        texts.push(text.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(""));
      }
      expect(texts).toEqual([
        "First page: inspectable evidence.",
        "Second page: reproducible methods.",
        "Final page: the current conclusion survives.",
      ]);
    } finally {
      await task.destroy();
    }
  });

  it("removes historical metadata from an incremental PDF instead of appending another revision", async () => {
    const source = await PDFDocument.create({ updateMetadata: false });
    source.addPage();
    source.setAuthor("Historical reviewer identity");
    const original = await source.save({ useObjectStreams: false });
    const originalText = new TextDecoder().decode(original);
    const previous = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(originalText)?.[1];
    const id = source.context.largestObjectNumber + 1;
    const object = `${id} 0 obj\n<< /Author (Current reviewer identity) >>\nendobj\n`;
    const update = new TextEncoder().encode(
      `${object}xref\n${id} 1\n${String(original.length).padStart(10, "0")} 00000 n \ntrailer\n<< /Size ${id + 1} /Root ${source.context.trailerInfo.Root} /Info ${id} 0 R /Prev ${previous} >>\nstartxref\n${original.length + object.length}\n%%EOF\n`,
    );
    const result = await renderAnnotatedPdf(new Uint8Array([...original, ...update]), emptyReview);
    const exported = new TextDecoder().decode(result);
    expect(exported.match(/%%EOF/gu)).toHaveLength(1);
    expect(exported).not.toContain("/Prev");
    expect(exported).not.toContain("Current reviewer identity");
    expect(exported).not.toContain(PDFHexString.fromText("Historical reviewer identity").toString());
    expect((await PDFDocument.load(result, { updateMetadata: false })).getAuthor()).toBeUndefined();
  });

  it("anonymizes replies and annotations on every page without flattening their contents or geometry", async () => {
    const source = await PDFDocument.create({ updateMetadata: false });
    const first = source.addPage();
    const last = source.addPage();
    const note = source.context.register(
      source.context.obj({
        Type: "Annot",
        Subtype: "Text",
        Rect: [20, 30, 40, 50],
        T: PDFString.of("First reviewer"),
        Contents: PDFString.of("First comment"),
        F: 4,
      }),
    );
    first.node.addAnnot(note);
    const reply = source.context.register(
      source.context.obj({
        Type: "Annot",
        Subtype: "Highlight",
        Rect: [40, 60, 80, 90],
        T: PDFString.of("Second reviewer"),
        Contents: PDFString.of("Reply comment"),
        IRT: note,
        RT: "R",
        F: 4,
        QuadPoints: [40, 90, 80, 90, 40, 60, 80, 60],
      }),
    );
    last.node.addAnnot(reply);
    const bytes = await renderAnnotatedPdf(await source.save(), emptyReview);
    const result = await PDFDocument.load(bytes, { updateMetadata: false });
    const annotations = result.getPages().map((page) => result.context.lookup(page.node.Annots()!.get(0), PDFDict));
    expect(annotations.map((annotation) => annotation.lookup(PDFName.of("T"), PDFHexString).decodeText())).toEqual([
      "Reviewer",
      "Reviewer",
    ]);
    expect(annotations.map((annotation) => annotation.lookup(PDFName.of("Contents"), PDFString).decodeText())).toEqual([
      "First comment",
      "Reply comment",
    ]);
    expect(annotations[1]!.lookup(PDFName.of("IRT"), PDFDict)).toBe(annotations[0]);
    expect(annotations[1]!.lookup(PDFName.of("QuadPoints"), PDFArray).asArray().map(String)).toEqual([
      "40",
      "90",
      "80",
      "90",
      "40",
      "60",
      "80",
      "60",
    ]);
  });

  it.each([undefined, ""])("rejects rich-text-only comments with plain contents %s instead of dropping their text", async (contents) => {
    const source = await PDFDocument.create({ updateMetadata: false });
    const page = source.addPage();
    page.node.addAnnot(
      source.context.register(
        source.context.obj({
          Subtype: "FreeText",
          Rect: [20, 30, 100, 100],
          T: PDFString.of("Reviewer"),
          RC: PDFString.of("<body>Only comment text</body>"),
          ...(contents === undefined ? {} : { Contents: PDFString.of(contents) }),
        }),
      ),
    );
    await expect(renderAnnotatedPdf(await source.save(), emptyReview)).rejects.toThrow("no plain-text comment to preserve");
  });

  it("rejects dangling references instead of exporting an unchecked document", async () => {
    const source = await PDFDocument.create({ updateMetadata: false });
    source.addPage().node.set(PDFName.of("Unknown"), PDFRef.of(999));
    await expect(renderAnnotatedPdf(await source.save(), emptyReview)).rejects.toThrow("referenced object is missing");
  });
});
