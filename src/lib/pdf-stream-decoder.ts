import { PDFArray, PDFDict, PDFName, PDFNull, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream, type PDFObject } from "pdf-lib";

const maxStreamBytes = 16 * 1024 * 1024;
type DecodeBudget = { remaining: number };
type DecoderBuffer = { buffer: Uint8Array; ensureBuffer: (requested: number) => Uint8Array };
type PredictorLayout = { colors: number; rowBytes: number; rowPrefix: number };
type FilterStep = { name: PDFName; parameters: PDFDict | undefined };

function reject(message: string): never {
  throw new Error(`Unsupported PDF structure stream: ${message}`);
}

function charge(length: number, budget: DecodeBudget): void {
  if (length > maxStreamBytes || length > budget.remaining) reject("decoded byte limit exceeded");
  budget.remaining -= length;
}

function resolve(dict: PDFDict, value: PDFObject | undefined): PDFObject | undefined {
  const seen = new Set<PDFRef>();
  while (value instanceof PDFRef) {
    if (seen.has(value)) reject("cyclic decoding metadata");
    seen.add(value);
    value = dict.context.lookup(value);
    if (value === undefined) reject("unresolved decoding metadata");
  }
  return value;
}

function parameter(dict: PDFDict | undefined, name: string, fallback: number): number {
  if (!dict) return fallback;
  const value = resolve(dict, dict.get(PDFName.of(name), true));
  if (value === undefined) return fallback;
  if (!(value instanceof PDFNumber) || !Number.isSafeInteger(value.asNumber())) reject(`invalid ${name}`);
  return value.asNumber();
}

function hasDecoderBuffer(value: unknown): value is DecoderBuffer {
  return (
    typeof value === "object" &&
    value !== null &&
    "buffer" in value &&
    value.buffer instanceof Uint8Array &&
    "ensureBuffer" in value &&
    typeof value.ensureBuffer === "function"
  );
}

function decodeFilter(stream: PDFRawStream, budget: DecodeBudget): Uint8Array {
  const decoder = decodePDFRawStream(stream);
  const limit = Math.min(maxStreamBytes, budget.remaining);
  if (!hasDecoderBuffer(decoder)) reject("decoder has no bounded allocation hook");
  // Pinned pdf-lib 1.17.1 exposes this protected hook at runtime. getBytes alone
  // cannot bound a whole Deflate block. Guard this decoder instance only, before
  // its first read, and cap spare capacity as well as requested decoded bytes.
  decoder.ensureBuffer = (requested) => {
    if (!Number.isSafeInteger(requested) || requested < 0 || requested > limit + 1) reject("decoded byte limit exceeded");
    if (requested <= decoder.buffer.length) return decoder.buffer;
    const next = new Uint8Array(Math.min(limit + 1, Math.max(requested, decoder.buffer.length * 2)));
    next.set(decoder.buffer);
    decoder.buffer = next;
    return next;
  };
  // Bounded chunks avoid reserving 16 MiB for every small object stream.
  let length = 0;
  while (true) {
    const request = Math.min(64 * 1024, limit + 1 - length);
    const bytes = decoder.getBytes(request);
    length += bytes.length;
    if (length > limit) reject("decoded byte limit exceeded");
    if (bytes.length < request) break;
  }
  charge(length, budget);
  return decoder.buffer.subarray(0, length);
}

function predictorLayout(parameters: PDFDict | undefined): PredictorLayout | null {
  const predictor = parameter(parameters, "Predictor", 1);
  if (predictor === 1) return null;
  if (predictor !== 2 && (predictor < 10 || predictor > 15)) reject("unsupported predictor");
  const colors = parameter(parameters, "Colors", 1);
  const columns = parameter(parameters, "Columns", 1);
  const bits = parameter(parameters, "BitsPerComponent", 8);
  if (bits !== 8 || colors < 1 || columns < 1 || colors > maxStreamBytes || columns > maxStreamBytes)
    reject("unsupported predictor dimensions");
  const rowBytes = colors * columns;
  if (!Number.isSafeInteger(rowBytes) || rowBytes > maxStreamBytes) reject("predictor row too large");
  return { colors, rowBytes, rowPrefix: predictor === 2 ? 0 : 1 };
}

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const cornerDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= cornerDistance) return left;
  return upDistance <= cornerDistance ? up : upperLeft;
}

function predictedByte(filter: number, output: Uint8Array, index: number, layout: PredictorLayout): number {
  const { colors, rowBytes } = layout;
  const hasLeft = index % rowBytes >= colors;
  const hasUp = index >= rowBytes;
  const left = hasLeft ? output[index - colors]! : 0;
  const up = hasUp ? output[index - rowBytes]! : 0;
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return Math.floor((left + up) / 2);
    case 4:
      return paeth(left, up, hasLeft && hasUp ? output[index - rowBytes - colors]! : 0);
    default:
      return reject("invalid PNG row filter");
  }
}

function undoPredictor(bytes: Uint8Array, parameters: PDFDict | undefined, budget: DecodeBudget): Uint8Array {
  const layout = predictorLayout(parameters);
  if (!layout) return bytes;
  const { rowBytes, rowPrefix } = layout;
  const encodedRowBytes = rowBytes + rowPrefix;
  if (bytes.length % encodedRowBytes !== 0) reject("truncated predictor row");
  const outputLength = (bytes.length / encodedRowBytes) * rowBytes;
  charge(outputLength, budget);
  const output = new Uint8Array(outputLength);
  for (let inputRow = 0, outputRow = 0; inputRow < bytes.length; inputRow += encodedRowBytes, outputRow += rowBytes) {
    const filter = rowPrefix === 0 ? 1 : bytes[inputRow]!;
    const start = inputRow + rowPrefix;
    for (let column = 0; column < rowBytes; column += 1) {
      const index = outputRow + column;
      output[index] = bytes[start + column]! + predictedByte(filter, output, index, layout);
    }
  }
  return output;
}

function filterParameters(filter: PDFName | PDFArray, parameters: PDFObject | undefined, count: number): (PDFObject | undefined)[] {
  if (parameters === undefined || parameters === PDFNull) return Array.from({ length: count }, () => undefined);
  if (filter instanceof PDFArray) {
    if (!(parameters instanceof PDFArray)) reject("filter parameters must be an array");
    if (parameters.size() !== count) reject("filter parameter count mismatch");
    return parameters.asArray();
  }
  if (parameters instanceof PDFArray) reject("filter parameter count mismatch");
  return [parameters];
}

function filterStep(context: PDFDict, rawName: PDFObject, rawParameters: PDFObject | undefined): FilterStep {
  const name = resolve(context, rawName);
  if (!(name instanceof PDFName)) reject("invalid filter name");
  const params = resolve(context, rawParameters);
  if (params !== undefined && params !== PDFNull && !(params instanceof PDFDict)) reject("invalid filter parameters");
  const parameters = params instanceof PDFDict ? params : undefined;
  const encoding = name.decodeText();
  if (!["FlateDecode", "LZWDecode", "ASCII85Decode", "ASCIIHexDecode", "RunLengthDecode"].includes(encoding)) reject("unsupported filter");
  if (encoding !== "FlateDecode" && encoding !== "LZWDecode" && parameter(parameters, "Predictor", 1) !== 1)
    reject("predictor on an incompatible filter");
  if (encoding === "LZWDecode" && ![0, 1].includes(parameter(parameters, "EarlyChange", 1))) reject("invalid EarlyChange");
  return { name, parameters };
}

function streamFilters(dict: PDFDict): FilterStep[] {
  const filter = resolve(dict, dict.get(PDFName.of("Filter"), true));
  const parameters = resolve(dict, dict.get(PDFName.of("DecodeParms"), true));
  if (filter === undefined || filter === PDFNull) {
    if (parameters !== undefined && parameters !== PDFNull) reject("parameters without a filter");
    return [];
  }
  if (!(filter instanceof PDFName) && !(filter instanceof PDFArray)) reject("invalid Filter");
  const filters = filter instanceof PDFArray ? filter.asArray() : [filter];
  if (filters.length === 0) reject("empty Filter array");
  const paired = filterParameters(filter, parameters, filters.length);
  return filters.map((name, index) => filterStep(dict, name, paired[index]));
}

/** Counts each decoded intermediate and allocated predictor/final copy against the shared work budget. */
export function decodePdfStructureStream(stream: PDFRawStream, budget: DecodeBudget): Uint8Array {
  if (!Number.isSafeInteger(budget.remaining) || budget.remaining < 0) reject("invalid decoding budget");
  const filters = streamFilters(stream.dict);
  if (filters.length === 0) {
    charge(stream.contents.length, budget);
    return stream.contents;
  }
  let bytes = stream.contents;
  for (const { name, parameters } of filters) {
    const single = stream.dict.clone();
    single.set(PDFName.of("Filter"), name);
    if (parameters) single.set(PDFName.of("DecodeParms"), parameters);
    else single.delete(PDFName.of("DecodeParms"));
    bytes = decodeFilter(PDFRawStream.of(single, bytes), budget);
    bytes = undoPredictor(bytes, parameters, budget);
  }
  // Release the decoder's spare backing capacity instead of retaining it in the
  // cross-reference resolver. Predictor output is already an exact allocation.
  if (bytes.byteOffset !== 0 || bytes.buffer.byteLength !== bytes.byteLength) {
    charge(bytes.length, budget);
    return bytes.slice();
  }
  return bytes;
}
