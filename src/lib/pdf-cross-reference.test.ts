import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFRef, PDFString } from "pdf-lib";
import { createRevisionEvidencePdf } from "../test-support/pdf-revision-fixture";
import { normalizePdfForEditing } from "./pdf-cross-reference";

const cases = [
  { xref: "table", objects: "direct" },
  { xref: "table", objects: "obsolete-stream" },
  { xref: "incremental-table", objects: "direct" },
  { xref: "incremental-table", objects: "obsolete-stream" },
  { xref: "stream", objects: "direct" },
  { xref: "stream", objects: "obsolete-stream" },
  { xref: "stream", objects: "active-stream" },
  { xref: "hybrid", objects: "direct" },
  { xref: "hybrid", objects: "obsolete-stream" },
  { xref: "hybrid", objects: "active-stream" },
] as const;

function appendRevision(source: Buffer, entries: string, objects = "", trailer = ""): Buffer {
  const previous = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(source.toString("latin1"))?.[1];
  if (!previous) throw new Error("Fixture has no xref");
  const offset = source.length + Buffer.byteLength(objects);
  return Buffer.concat([
    source,
    Buffer.from(
      `${objects}xref\n${entries}trailer\n<< /Size 20 /Root 1 0 R /Prev ${previous} ${trailer} >>\nstartxref\n${offset}\n%%EOF\n`,
    ),
  ]);
}

describe("authoritative PDF cross references", () => {
  it.each(cases)("preserves all current pages and fonts for $xref/$objects", async (options) => {
    const result = await normalizePdfForEditing(createRevisionEvidencePdf(options));
    const document = await PDFDocument.load(result, { updateMetadata: false });
    expect(document.getPageCount()).toBe(3);
    expect(document.context.lookup(PDFRef.of(5))?.toString()).toContain("/Contents 9 0 R");
    expect(document.context.lookup(PDFRef.of(6))?.toString()).toContain("/BaseFont /Times-Roman");
    const output = Buffer.from(result).toString("latin1");
    expect(output).toContain("Final page: the current conclusion survives.");
    expect(output).not.toContain("Earlier draft: superseded conclusion.");
    expect(output).not.toContain("/Type /ObjStm");
    expect(output).not.toContain("/Type /XRef");
  });

  it("keeps free tombstones and the current generation authoritative", async () => {
    const source = createRevisionEvidencePdf({ xref: "table" });
    const objects = "12 0 obj\n(old value)\nendobj\n13 0 obj\n(deleted value)\nendobj\n";
    const prior = appendRevision(
      source,
      `12 2\n${String(source.length).padStart(10, "0")} 00000 n \n${String(source.length + objects.indexOf("13 0 obj")).padStart(10, "0")} 00000 n \n`,
      objects,
    );
    const current = appendRevision(
      prior,
      `12 2\n${String(prior.length).padStart(10, "0")} 00001 n \n0000000000 00001 f \n`,
      "12 1 obj\n(current value)\nendobj\n",
    );
    const document = await PDFDocument.load(await normalizePdfForEditing(current), { updateMetadata: false });
    expect(document.context.lookup(PDFRef.of(12, 0))).toBeUndefined();
    expect(document.context.lookup(PDFRef.of(13, 0))).toBeUndefined();
    expect(document.context.lookup(PDFRef.of(12, 1), PDFString).decodeText()).toBe("current value");
    expect(document.getPageCount()).toBe(3);
  });

  it("lets hybrid stream entries supersede same-revision free placeholders", async () => {
    const source = createRevisionEvidencePdf({ xref: "hybrid", objects: "active-stream" });
    const placeholders = source.toString("latin1").replace("\n7 5\n", "\n5 7\n0000000000 65535 f \n0000000000 65535 f \n");
    expect(placeholders.length).toBeGreaterThan(source.length);
    const document = await PDFDocument.load(await normalizePdfForEditing(Buffer.from(placeholders, "latin1")), { updateMetadata: false });
    expect(document.getPageCount()).toBe(3);
    expect(document.context.lookup(PDFRef.of(6))?.toString()).toContain("/BaseFont /Times-Roman");
  });

  it("preserves the current catalog, information dictionary, and file identifiers", async () => {
    const source = createRevisionEvidencePdf({ xref: "table" });
    const current = appendRevision(
      source,
      `12 1\n${String(source.length).padStart(10, "0")} 00000 n \n`,
      "12 0 obj\n<< /Title (A colleague's paper) >>\nendobj\n",
      "/Info 12 0 R /ID [<00112233> <44556677>]",
    );
    const document = await PDFDocument.load(await normalizePdfForEditing(current), { updateMetadata: false });
    expect(document.getTitle()).toBe("A colleague's paper");
    expect(document.catalog.get(PDFName.of("Pages"))?.toString()).toBe("2 0 R");
    expect(document.context.trailerInfo.ID?.toString()).toBe("[ <00112233> <44556677> ]");
  });

  it("rejects encrypted input without attempting to rewrite it", async () => {
    const source = createRevisionEvidencePdf({ xref: "table" });
    const encrypted = appendRevision(source, "0 1\n0000000000 65535 f \n", "", "/Encrypt 17 0 R");
    await expect(normalizePdfForEditing(encrypted)).rejects.toThrow(/encrypted/iu);
  });

  it("rejects missing, invalid, and cyclic cross references", async () => {
    const source = createRevisionEvidencePdf({ xref: "table" });
    await expect(normalizePdfForEditing(source.subarray(0, source.length - 30))).rejects.toThrow(/cross.reference/iu);
    const invalid = Buffer.from(source.toString("latin1").replace(/startxref\s+\d+/u, "startxref\n99999999"), "latin1");
    await expect(normalizePdfForEditing(invalid)).rejects.toThrow(/offset/iu);
    const current = appendRevision(source, "0 1\n0000000000 65535 f \n");
    const cyclic = Buffer.from(current.toString("latin1").replace(/\/Prev \d+/u, `/Prev ${source.length}`), "latin1");
    await expect(normalizePdfForEditing(cyclic)).rejects.toThrow(/cycle/iu);
  });

  it("rejects oversized sources and unreasonable entry counts before parsing objects", async () => {
    await expect(normalizePdfForEditing(new Uint8Array(25 * 1024 * 1024 + 1))).rejects.toThrow(/25 MiB/u);
    const source = Buffer.from("%PDF-1.7\nxref\n0 100001\ntrailer\n<< /Size 100001 /Root 1 0 R >>\nstartxref\n9\n%%EOF\n");
    await expect(normalizePdfForEditing(source)).rejects.toThrow(/entries/iu);
  });
});
