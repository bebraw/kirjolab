import { describe, expect, it } from "vitest";
import { PDFDocument, PDFRawStream, PDFRef } from "pdf-lib";
import { normalizePdfForEditing } from "./pdf-cross-reference";

const pageContent = "BT /F1 12 Tf 72 700 Td (Compressed length is valid.) Tj ET";

interface FixtureOptions {
  readonly content?: string;
  readonly lengthReference?: string;
  readonly lengthValue?: string;
  readonly compressedIndex?: number;
  readonly streamHeader?: string;
  readonly omitLength?: boolean;
  readonly pageTree?: string;
}

/** A tiny independent PDF with its content-stream Length stored in an object stream. */
function compressedLengthPdf(options: FixtureOptions = {}): Buffer {
  const content = options.content ?? pageContent;
  const header = options.streamHeader ?? "7 0 ";
  const packed = `${header}${options.lengthValue ?? content.length}`;
  const length = options.omitLength ? "" : `/Length ${options.lengthReference ?? "7 0 R"}`;
  const objects = new Map([
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, options.pageTree ?? "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"],
    [4, `<< ${length} >>\nstream\n${content}\nendstream`],
    [5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"],
    [6, `<< /Type /ObjStm /N 1 /First ${header.length} /Length ${packed.length} >>\nstream\n${packed}\nendstream`],
  ]);
  const chunks = [Buffer.from("%PDF-1.7\n")];
  const offsets = new Map<number, number>();
  let size = chunks[0]!.length;
  for (const [id, object] of objects) {
    offsets.set(id, size);
    const bytes = Buffer.from(`${id} 0 obj\n${object}\nendobj\n`);
    chunks.push(bytes);
    size += bytes.length;
  }
  const xrefOffset = size;
  offsets.set(8, xrefOffset);
  const rows = Buffer.alloc(9 * 7);
  for (let id = 0; id < 9; id += 1) {
    rows[id * 7] = id === 7 ? 2 : offsets.has(id) ? 1 : 0;
    rows.writeUInt32BE(id === 7 ? 6 : (offsets.get(id) ?? 0), id * 7 + 1);
    rows.writeUInt16BE(id === 0 ? 65535 : id === 7 ? (options.compressedIndex ?? 0) : 0, id * 7 + 5);
  }
  chunks.push(
    Buffer.from(`8 0 obj\n<< /Type /XRef /Size 9 /Root 1 0 R /W [1 4 2] /Length ${rows.length} >>\nstream\n`),
    rows,
    Buffer.from(`\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`),
  );
  return Buffer.concat(chunks);
}

function replace(source: Buffer, from: string, to: string): Buffer {
  const original = source.toString("latin1");
  expect(original).toContain(from);
  return Buffer.from(original.replace(from, to), "latin1");
}

function tablePdf(objects: readonly string[]): Buffer {
  let source = "%PDF-1.7\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(source);
  const rows = offsets.map((offset, id) => `${String(offset).padStart(10, "0")} ${id === 0 ? "65535 f" : "00000 n"} \n`).join("");
  return Buffer.from(
    `${source}xref\n0 ${offsets.length}\n${rows}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
}

function contentBytes(document: PDFDocument): Uint8Array {
  const stream = document.context.lookup(PDFRef.of(4));
  if (!(stream instanceof PDFRawStream)) throw new Error("Normalized PDF is missing its content stream");
  return stream.contents;
}

function sharedMetadataPdf(depth: number, cyclic = false): Buffer {
  const source = compressedLengthPdf();
  const previous = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(source.toString("latin1"))?.[1];
  if (!previous) throw new Error("Fixture is missing its cross-reference marker");
  const encoded = `${Buffer.from(`7 0 ${pageContent.length}`).toString("hex")}>`;
  const objects = new Map([
    [
      6,
      `<< /Type /ObjStm /N 1 /First 4 /Length ${encoded.length} /Filter /ASCIIHexDecode /DecodeParms 9 0 R >>\nstream\n${encoded}\nendstream`,
    ],
  ]);
  // Extra DecodeParms keys are legal. The repeated references form a small DAG,
  // not an exponentially large document or an excessively deep hierarchy.
  for (let index = 0; index < depth; index += 1) {
    objects.set(9 + index, `<< /Left ${10 + index} 0 R /Right ${10 + index} 0 R >>`);
  }
  objects.set(9 + depth, cyclic ? "<< /Left 9 0 R >>" : "<< >>");
  const chunks = [source];
  const offsets = new Map<number, number>();
  let length = source.length;
  for (const [id, body] of objects) {
    offsets.set(id, length);
    const bytes = Buffer.from(`${id} 0 obj\n${body}\nendobj\n`);
    chunks.push(bytes);
    length += bytes.length;
  }
  const row = (id: number) => `${String(offsets.get(id)).padStart(10, "0")} 00000 n \n`;
  const metadataRows = Array.from({ length: depth + 1 }, (_, index) => row(9 + index)).join("");
  chunks.push(
    Buffer.from(
      `xref\n6 1\n${row(6)}9 ${depth + 1}\n${metadataRows}trailer\n<< /Size ${depth + 10} /Root 1 0 R /Prev ${previous} >>\nstartxref\n${length}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}

describe("safe PDF cross-reference normalization", () => {
  it.each(["Kids", "Count"] as const)("preserves an indirect page-tree %s value", async (key) => {
    const source = tablePdf([
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids ${key === "Kids" ? "5 0 R" : "[3 0 R]"} /Count ${key === "Count" ? "6 0 R" : "1"} >>`,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
      `<< /Length ${pageContent.length} >>\nstream\n${pageContent}\nendstream`,
      "[3 0 R]",
      "1",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]);
    const document = await PDFDocument.load(await normalizePdfForEditing(source));
    expect(document.getPageCount()).toBe(1);
    expect(contentBytes(document)).toEqual(new TextEncoder().encode(pageContent));
  });

  it("resolves shared decoder metadata once while preserving the complete document", async () => {
    const document = await PDFDocument.load(await normalizePdfForEditing(sharedMetadataPdf(28)));
    expect(document.getPageCount()).toBe(1);
    expect(contentBytes(document)).toEqual(new TextEncoder().encode(pageContent));
  });

  it("rejects cyclic decoder metadata instead of treating the cycle as an already resolved shared reference", async () => {
    await expect(normalizePdfForEditing(sharedMetadataPdf(4, true))).rejects.toThrow(/cyclic.*metadata/iu);
  });

  it("resolves an ordinary stream Length from the current compressed object", async () => {
    const normalized = await normalizePdfForEditing(compressedLengthPdf());
    const document = await PDFDocument.load(normalized, { updateMetadata: false });
    expect(document.getPageCount()).toBe(1);
    expect(contentBytes(document)).toEqual(new TextEncoder().encode(pageContent));
    expect(Buffer.from(normalized).toString("latin1")).not.toContain("/Type /ObjStm");
  });

  it("preserves embedded object delimiters when the stream has an exact Length", async () => {
    const content = "BT /F1 12 Tf (Text\nendstream\nendobj\ninside a string.) Tj ET";
    const document = await PDFDocument.load(await normalizePdfForEditing(compressedLengthPdf({ content })));
    expect(contentBytes(document)).toEqual(new TextEncoder().encode(content));
  });

  it("repairs a missing Length only when the known object boundary is unambiguous", async () => {
    const document = await PDFDocument.load(await normalizePdfForEditing(compressedLengthPdf({ omitLength: true })));
    expect(contentBytes(document)).toEqual(new TextEncoder().encode(pageContent));
  });

  it("rejects ambiguous missing-Length framing without selecting a guessed terminator", async () => {
    const content = "BT /F1 12 Tf (Text\nendstream\nendobj\ninside a string.) Tj ET";
    await expect(normalizePdfForEditing(compressedLengthPdf({ content, omitLength: true }))).rejects.toThrow(/ambiguous boundary/iu);
  });

  it.each([
    { name: "missing length reference", options: { lengthReference: "99 0 R" }, error: /unavailable generation/iu },
    { name: "wrong length generation", options: { lengthReference: "7 1 R" }, error: /unavailable generation/iu },
    { name: "cyclic length dependency", options: { lengthReference: "4 0 R" }, error: /cyclic/iu },
    { name: "non-numeric length", options: { lengthValue: "(not a number)" }, error: /Length is not an integer/u },
    { name: "negative length", options: { lengthValue: "-1" }, error: /invalid stream length/u },
    { name: "fractional length", options: { lengthValue: "1.5" }, error: /invalid stream length/u },
    { name: "short length", options: { lengthValue: String(pageContent.length - 1) }, error: /expected endstream/u },
    { name: "out-of-bounds length", options: { lengthValue: "99999999" }, error: /truncated stream/u },
    { name: "wrong compressed index", options: { compressedIndex: 1 }, error: /index does not match/u },
    { name: "wrong compressed object id", options: { streamHeader: "9 0 " }, error: /index does not match/u },
    { name: "invalid compressed offset", options: { streamHeader: "7 99 " }, error: /invalid object-stream index/u },
    { name: "extra header entries", options: { streamHeader: "7 0 8 2 " }, error: /extra object-stream header/u },
  ])("rejects $name", async ({ options, error }) => {
    await expect(normalizePdfForEditing(compressedLengthPdf(options))).rejects.toThrow(error);
  });

  it.each([
    { name: "a missing page", tree: "<< /Type /Pages /Kids [99 0 R] /Count 1 >>", error: /missing node/u },
    { name: "a page-tree cycle", tree: "<< /Type /Pages /Kids [2 0 R] /Count 1 >>", error: /page[- ]tree/iu },
    { name: "a repeated page", tree: "<< /Type /Pages /Kids [3 0 R 3 0 R] /Count 2 >>", error: /repeated page/u },
    { name: "an incorrect page count", tree: "<< /Type /Pages /Kids [3 0 R] /Count 2 >>", error: /count does not match/u },
    { name: "a font as a page", tree: "<< /Type /Pages /Kids [5 0 R] /Count 1 >>", error: /page[- ]tree/iu },
    { name: "a direct page-tree child", tree: "<< /Type /Pages /Kids [3] /Count 1 >>", error: /non-reference child/u },
  ])("rejects $name before an incomplete document can be exported", async ({ tree, error }) => {
    await expect(normalizePdfForEditing(compressedLengthPdf({ pageTree: tree }))).rejects.toThrow(error);
  });

  it("rejects an object header that disagrees with its authoritative generation", async () => {
    await expect(normalizePdfForEditing(replace(compressedLengthPdf(), "5 0 obj", "5 1 obj"))).rejects.toThrow(/identity mismatch/u);
  });

  it("rejects an acyclic page tree deeper than the supported inheritance limit", async () => {
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>"];
    for (let index = 0; index < 66; index += 1) {
      const parent = index === 0 ? "" : `/Parent ${index + 1} 0 R`;
      objects.push(`<< /Type /Pages ${parent} /Kids [${index + 3} 0 R] /Count 1 >>`);
    }
    objects.push("<< /Type /Page /Parent 67 0 R /MediaBox [0 0 612 792] >>");
    await expect(normalizePdfForEditing(tablePdf(objects))).rejects.toThrow(/page[- ]tree.*(?:depth|limit)/iu);
  });

  it("rejects a child Parent cycle even when Kids and page counts are valid", async () => {
    const source = replace(compressedLengthPdf(), "/Parent 2 0 R /MediaBox", "/Parent 3 0 R /MediaBox");
    await expect(normalizePdfForEditing(source)).rejects.toThrow(/parent/iu);
  });

  it("rejects a Parent on the root of the page tree", async () => {
    const source = compressedLengthPdf({ pageTree: "<< /Type /Pages /Parent 3 0 R /Kids [3 0 R] /Count 1 >>" });
    await expect(normalizePdfForEditing(source)).rejects.toThrow(/parent/iu);
  });

  it.each([
    { name: "missing field width", from: "/W [1 4 2]", to: "/W [1 4]", error: /field widths/u },
    { name: "zero-width rows", from: "/W [1 4 2]", to: "/W [0 0 0]", error: /field widths/u },
    { name: "oversized field width", from: "/W [1 4 2]", to: "/W [1 8 2]", error: /field widths/u },
    { name: "incomplete Index pair", from: "/Size 9", to: "/Size 9 /Index [0]", error: /cross-reference index/u },
    { name: "truncated row data", from: "/Size 9", to: "/Size 9 /Index [0 8]", error: /cross-reference stream/u },
    { name: "empty Size", from: "/Size 9", to: "/Size 0 /Index [0 9]", error: /empty cross-reference Size/u },
    { name: "out-of-range object number", from: "/Size 9", to: "/Size 8 /Index [0 9]", error: /exceeds cross-reference Size/u },
  ])("rejects a cross-reference stream with $name", async ({ from, to, error }) => {
    await expect(normalizePdfForEditing(replace(compressedLengthPdf(), from, to))).rejects.toThrow(error);
  });
});
