import { deflateSync } from "node:zlib";

type PdfRevisionFixtureOptions =
  | { xref: "table" | "incremental-table"; objects?: "direct" | "obsolete-stream" }
  | { xref: "stream" | "hybrid"; objects?: "direct" | "obsolete-stream" | "active-stream" };

const pageTexts = [
  "First page: inspectable evidence.",
  "Second page: reproducible methods.",
  "Final page: the current conclusion survives.",
];
const font = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>";

function page(content: number): string {
  return `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> >> /Contents ${content} 0 R >>`;
}

function stream(data: Buffer, dictionary = ""): Buffer {
  return Buffer.concat([Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`, "ascii"), data, Buffer.from("\nendstream")]);
}

function textStream(text: string): Buffer {
  return stream(Buffer.from(`BT /F1 18 Tf 72 700 Td (${text}) Tj ET`, "ascii"));
}

class RevisionPdfWriter {
  private readonly chunks: Buffer[] = [Buffer.from("%PDF-1.7\n", "ascii")];
  private readonly offsets = new Map<number, number>();
  private length = this.chunks[0]!.length;
  private readonly compressed: boolean;

  constructor(compressed: boolean) {
    this.compressed = compressed;
  }

  bytes(): Buffer {
    return Buffer.concat(this.chunks);
  }

  private append(value: string | Buffer): void {
    const bytes = typeof value === "string" ? Buffer.from(value, "ascii") : value;
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  object(id: number, body: string | Buffer): void {
    this.offsets.set(id, this.length);
    this.append(`${id} 0 obj\n`);
    this.append(body);
    this.append("\nendobj\n");
  }

  baseObjects(incremental: boolean): void {
    this.object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    this.object(2, "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>");
    this.object(3, page(7));
    this.object(4, page(8));
    if (!this.compressed) {
      this.object(5, page(9));
      this.object(6, font);
    }
    pageTexts.forEach((text, index) =>
      this.object(7 + index, textStream(incremental && index === 2 ? "Earlier draft: superseded conclusion." : text)),
    );
  }

  objectStream(): void {
    const bodies = this.compressed
      ? [page(9), font]
      : [
          "<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] >>",
          "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
        ];
    const header = `5 0 6 ${Buffer.byteLength(bodies[0]!, "ascii") + 1} `;
    const data = Buffer.from(`${header}${bodies.join("\n")}`, "ascii");
    this.object(10, stream(deflateSync(data), `/Type /ObjStm /N 2 /First ${header.length} /Filter /FlateDecode`));
  }

  private tableEntry(id: number): string {
    const offset = this.offsets.get(id);
    if (offset === undefined) return `0000000000 ${id === 0 ? "65535" : "00000"} f \n`;
    return `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  table(first = 0, size = Math.max(...this.offsets.keys()) + 1, trailer = ""): number {
    const start = this.length;
    this.append("xref\n");
    // Hybrid tables omit compressed objects; the supplemental stream supplies them.
    const ranges = this.compressed
      ? ([
          [0, 5],
          [7, 5],
        ] as const)
      : ([[first, size]] as const);
    for (const [begin, count] of ranges) {
      this.append(`${begin} ${count}\n`);
      for (let id = begin; id < begin + count; id += 1) this.append(this.tableEntry(id));
    }
    this.append(`trailer\n<< /Size ${Math.max(...this.offsets.keys()) + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${start}\n%%EOF\n`);
    return start;
  }

  private streamEntry(id: number): readonly [type: number, offsetOrStream: number, generationOrIndex: number] {
    if (this.compressed && (id === 5 || id === 6)) return [2, 10, id - 5];
    const offset = this.offsets.get(id);
    if (offset === undefined) return [0, 0, id === 0 ? 65535 : 0];
    return [1, offset, 0];
  }

  private streamEntries(): Buffer {
    const entries = Buffer.alloc(12 * 7);
    for (let id = 0; id < 12; id += 1) {
      const [type, offset, generation] = this.streamEntry(id);
      entries.writeUInt8(type, id * 7);
      entries.writeUInt32BE(offset, id * 7 + 1);
      entries.writeUInt16BE(generation, id * 7 + 5);
    }
    return entries;
  }

  crossReferenceStream(hybrid: boolean): void {
    const offset = this.length;
    this.offsets.set(11, offset);
    this.object(11, stream(this.streamEntries(), "/Type /XRef /Size 12 /Root 1 0 R /W [1 4 2] /Index [0 12]"));
    if (hybrid) this.table(0, 12, `/XRefStm ${offset}`);
    else this.append(`startxref\n${offset}\n%%EOF\n`);
  }
}

/**
 * Three pages of independent, readable evidence. Object 5 is the final page,
 * object 6 is its Times-Roman font, and objects 7–9 contain the page text.
 *
 * An obsolete object stream deliberately appears AFTER the current direct
 * objects. Its stale page/font must not win merely because it occurs later in
 * the file. Conversely, active-stream fixtures require resolving type-2 xrefs.
 */
export function createRevisionEvidencePdf(options: PdfRevisionFixtureOptions): Buffer {
  const objects = options.objects ?? "direct";
  const writer = new RevisionPdfWriter(objects === "active-stream");
  writer.baseObjects(options.xref === "incremental-table");
  if (options.xref === "incremental-table") {
    const previous = writer.table(0, 10);
    writer.object(9, textStream(pageTexts[2]!));
    if (objects === "obsolete-stream") writer.objectStream();
    writer.table(9, objects === "obsolete-stream" ? 2 : 1, `/Prev ${previous}`);
  } else {
    if (objects !== "direct") writer.objectStream();
    if (options.xref === "table") writer.table();
    else writer.crossReferenceStream(options.xref === "hybrid");
  }
  return writer.bytes();
}
