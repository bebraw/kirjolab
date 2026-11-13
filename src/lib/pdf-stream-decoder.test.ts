import { deflateSync } from "node:zlib";
import { PDFContext, PDFName, PDFNull, PDFNumber, PDFRawStream, PDFRef, PDFString } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { decodePdfStructureStream } from "./pdf-stream-decoder";

function flate(bytes: number[], parameters: Record<string, number> = {}): PDFRawStream {
  const context = PDFContext.create();
  return PDFRawStream.of(context.obj({ Filter: "FlateDecode", DecodeParms: parameters }), deflateSync(Uint8Array.from(bytes)));
}

describe("bounded PDF structure stream decoding", () => {
  it("decodes a plain stream and accounts for its bytes", () => {
    const stream = PDFContext.create().stream(Uint8Array.of(5, 10, 15));
    const budget = { remaining: 10 };
    expect(decodePdfStructureStream(stream, budget)).toEqual(Uint8Array.of(5, 10, 15));
    expect(budget.remaining).toBe(7);
  });

  it("reverses 8-bit TIFF prediction independently for each multicolor row", () => {
    const stream = flate([10, 20, 30, 5, 5, 5, 100, 110, 120, 10, 20, 30], { Predictor: 2, Colors: 3, Columns: 2 });
    expect(decodePdfStructureStream(stream, { remaining: 100 })).toEqual(
      Uint8Array.of(10, 20, 30, 15, 25, 35, 100, 110, 120, 110, 130, 150),
    );
  });

  it.each([
    ["ASCIIHexDecode", new TextEncoder().encode("00 1f 80 FF>"), [0, 31, 128, 255]],
    ["ASCII85Decode", new TextEncoder().encode("z~>"), [0, 0, 0, 0]],
    ["RunLengthDecode", Uint8Array.of(2, 10, 20, 30, 254, 7, 128), [10, 20, 30, 7, 7, 7]],
    ["LZWDecode", Uint8Array.of(0x80, 0x00, 0x40, 0x40, 0x38, 0x08), [1, 2, 3]],
  ] as const)("decodes standard %s filter bytes", (Filter, bytes, expected) => {
    const stream = PDFRawStream.of(PDFContext.create().obj({ Filter }), bytes);
    expect(decodePdfStructureStream(stream, { remaining: 4096 })).toEqual(Uint8Array.from(expected));
  });

  it.each([
    [2, [250, 250, 10, 20]],
    [11, [1, 250, 250, 10, 20]],
  ])("handles multicolor byte wrapping for predictor %s", (Predictor, bytes) => {
    expect(decodePdfStructureStream(flate(bytes, { Predictor, Columns: 2, Colors: 2 }), { remaining: 100 })).toEqual(
      Uint8Array.of(250, 250, 4, 14),
    );
  });

  it("uses the diagonal Paeth neighbor when it is the closest prediction", () => {
    const stream = flate([0, 50, 20, 80, 4, 20, 30, 246], { Predictor: 15, Columns: 3 });
    expect(decodePdfStructureStream(stream, { remaining: 100 })).toEqual(Uint8Array.of(50, 20, 80, 70, 80, 70));
  });

  it.each([
    [10, [0, 10, 20, 30, 0, 15, 35, 60]],
    [11, [1, 10, 10, 10, 1, 15, 20, 25]],
    [12, [2, 10, 20, 30, 2, 5, 15, 30]],
    [13, [3, 10, 15, 20, 3, 10, 18, 28]],
    [14, [4, 10, 10, 10, 4, 5, 15, 25]],
    [15, [0, 10, 20, 30, 4, 5, 15, 25]],
  ])("reverses PNG predictor %s with explicit row bytes", (Predictor, bytes) => {
    const stream = flate(bytes, { Predictor, Columns: 3 });
    const budget = { remaining: 20 };
    expect(decodePdfStructureStream(stream, budget)).toEqual(Uint8Array.of(10, 20, 30, 15, 35, 60));
    expect(budget.remaining).toBe(6);
  });

  it("applies DecodeParms to the corresponding filter without changing the input dictionary", () => {
    const context = PDFContext.create();
    const compressed = deflateSync(Uint8Array.of(2, 10, 20, 2, 5, 15));
    const encoded = new TextEncoder().encode(`${Buffer.from(compressed).toString("hex")}>`);
    const dict = context.obj({ Filter: ["ASCIIHexDecode", "FlateDecode"], DecodeParms: [null, { Predictor: 12, Columns: 2 }] });
    const before = dict.toString();
    const budget = { remaining: 100 };
    expect(decodePdfStructureStream(PDFRawStream.of(dict, encoded), budget)).toEqual(Uint8Array.of(10, 20, 15, 35));
    expect(budget.remaining).toBe(100 - compressed.length - 6 - 4);
    expect(dict.toString()).toBe(before);
  });

  it.each([
    { Predictor: 3 },
    { Predictor: 16 },
    { Predictor: 2, BitsPerComponent: 4 },
    { Predictor: 12, Colors: 0 },
    { Predictor: 12, Columns: -1 },
    { Predictor: 12, Columns: 1.5 },
    { Predictor: 12, Columns: 16 * 1024 * 1024 + 1 },
    { Predictor: 12, Colors: 16 * 1024 * 1024, Columns: 2 },
  ])("rejects unsupported predictor parameters %j", (parameters) => {
    expect(() => decodePdfStructureStream(flate([0, 1], parameters), { remaining: 100 })).toThrow();
  });

  it.each([
    [12, [0, 1, 2, 0, 3]],
    [12, [5, 1, 2]],
    [2, [1, 2, 3]],
  ])("rejects malformed predictor rows %j", (Predictor, bytes) => {
    expect(() => decodePdfStructureStream(flate(bytes, { Predictor, Columns: 2 }), { remaining: 100 })).toThrow();
  });

  it("rejects malformed or unresolved filter metadata", () => {
    const context = PDFContext.create();
    const invalid = [
      context.obj({ Filter: 2 }),
      context.obj({ Filter: ["FlateDecode", 2] }),
      context.obj({ Filter: ["FlateDecode"], DecodeParms: {} }),
      context.obj({ Filter: ["FlateDecode"], DecodeParms: [null, null] }),
      context.obj({ Filter: "FlateDecode", DecodeParms: [null] }),
      context.obj({ Filter: "FlateDecode", DecodeParms: 2 }),
      context.obj({ DecodeParms: { Predictor: 12 } }),
      context.obj({ Filter: PDFRef.of(99) }),
      context.obj({ Filter: "FlateDecode", DecodeParms: PDFRef.of(99) }),
      context.obj({ Filter: "FlateDecode", DecodeParms: { Predictor: PDFRef.of(99) } }),
      context.obj({ Filter: "FlateDecode", DecodeParms: { Predictor: PDFString.of("12") } }),
      context.obj({ Filter: "FlateDecode", DecodeParms: { Predictor: 12, Colors: PDFString.of("1") } }),
      context.obj({ Filter: "FlateDecode", DecodeParms: { Predictor: 12, BitsPerComponent: null } }),
      context.obj({ Filter: "LZWDecode", DecodeParms: { EarlyChange: 2 } }),
      context.obj({ Filter: "ASCIIHexDecode", DecodeParms: { Predictor: 12 } }),
      context.obj({ Filter: "DCTDecode" }),
      context.obj({ Filter: [] }),
    ];
    for (const dict of invalid) {
      expect(() => decodePdfStructureStream(PDFRawStream.of(dict, deflateSync(Uint8Array.of(0, 1))), { remaining: 100 })).toThrow();
    }
  });

  it("accepts resolved metadata references and null parameter entries", () => {
    const context = PDFContext.create();
    const name = context.register(PDFName.of("FlateDecode"));
    const parameters = context.register(context.obj({ Predictor: context.register(PDFNumber.of(1)) }));
    const dict = context.obj({ Filter: name, DecodeParms: parameters });
    expect(decodePdfStructureStream(PDFRawStream.of(dict, deflateSync(Uint8Array.of(1, 2))), { remaining: 10 })).toEqual(
      Uint8Array.of(1, 2),
    );
    dict.set(PDFName.of("DecodeParms"), PDFNull);
    expect(decodePdfStructureStream(PDFRawStream.of(dict, deflateSync(Uint8Array.of(3))), { remaining: 10 })).toEqual(Uint8Array.of(3));
  });

  it("rejects a shared budget exhausted by predictor output or another stream", () => {
    expect(() => decodePdfStructureStream(flate([0, 1, 2], { Predictor: 12, Columns: 2 }), { remaining: 4 })).toThrow();
    const budget = { remaining: 5 };
    decodePdfStructureStream(flate([1, 2]), budget);
    expect(() => decodePdfStructureStream(flate([3, 4]), budget)).toThrow();
  });

  it("rejects cyclic indirect metadata and invalid budgets", () => {
    const context = PDFContext.create();
    const reference = PDFRef.of(1);
    context.assign(reference, reference);
    expect(() => decodePdfStructureStream(context.stream(Uint8Array.of(1), { Filter: reference }), { remaining: 100 })).toThrow();
    for (const remaining of [-1, 0.5, NaN, Infinity]) {
      expect(() => decodePdfStructureStream(flate([1]), { remaining })).toThrow();
    }
  });

  it("accounts for a final compact copy and accepts an empty stream at an exhausted budget", () => {
    const budget = { remaining: 6 };
    const result = decodePdfStructureStream(flate([1, 2, 3]), budget);
    expect(result).toEqual(Uint8Array.of(1, 2, 3));
    expect(result.buffer.byteLength).toBe(3);
    expect(budget.remaining).toBe(0);
    expect(decodePdfStructureStream(flate([]), budget)).toEqual(new Uint8Array());
  });

  it("rejects decoded output above the per-stream limit", () => {
    const context = PDFContext.create();
    const data = new Uint8Array(16 * 1024 * 1024 + 1);
    expect(() => decodePdfStructureStream(context.stream(data), { remaining: 32 * 1024 * 1024 })).toThrow();
    expect(() => decodePdfStructureStream(context.flateStream(data), { remaining: 32 * 1024 * 1024 })).toThrow();
  });
});
