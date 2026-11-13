import {
  PDFArray,
  PDFContext,
  PDFDict,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFObjectParser,
  PDFRawStream,
  PDFRef,
  PDFWriter,
  type PDFObject,
} from "pdf-lib";
import { decodePdfStructureStream } from "./pdf-stream-decoder";

const sourceLimit = 25 * 1024 * 1024;
const outputLimit = 50 * 1024 * 1024;
const entryLimit = 100_000;
const sectionLimit = 128;
const maximumObjectNumber = 2_147_483_647;
const whitespace = new Set([0, 9, 10, 12, 13, 32]);
const delimiters = new Set([40, 41, 60, 62, 91, 93, 47, 37]);
const textDecoder = new TextDecoder("latin1");

type Entry =
  | { readonly kind: "free"; readonly generation: number }
  | { readonly kind: "direct"; readonly offset: number; readonly generation: number }
  | { readonly kind: "compressed"; readonly stream: number; readonly index: number };
interface Section {
  readonly entries: ReadonlyMap<number, Entry>;
  readonly trailer: PDFDict;
}
interface ParsedObject {
  readonly ref: PDFRef;
  readonly object: PDFObject;
}
interface ObjectStreamIndex {
  readonly bytes: Uint8Array;
  readonly first: number;
  readonly ids: readonly number[];
  readonly offsets: readonly number[];
}
interface MetadataTraversal {
  readonly visited: Set<PDFObject>;
  readonly active: Set<PDFObject>;
}

function invalid(detail: string): never {
  throw new Error(`Cannot safely prepare this PDF: ${detail}.`);
}

function integer(value: number, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) invalid(`invalid ${label}`);
  return value;
}

function dictionaryInteger(dictionary: PDFDict, key: string): number | undefined {
  const value = dictionary.get(PDFName.of(key));
  if (value === undefined) return undefined;
  if (!(value instanceof PDFNumber)) invalid(`${key} must be a direct integer`);
  return integer(value.asNumber(), key);
}

function requiredInteger(dictionary: PDFDict, key: string): number {
  return dictionaryInteger(dictionary, key) ?? invalid(`missing ${key}`);
}

function integerArray(dictionary: PDFDict, key: string): number[] | undefined {
  const value = dictionary.get(PDFName.of(key));
  if (value === undefined) return undefined;
  if (!(value instanceof PDFArray)) invalid(`${key} must be a direct array`);
  return value.asArray().map((item) => {
    if (!(item instanceof PDFNumber)) invalid(`${key} contains a non-integer`);
    return integer(item.asNumber(), key);
  });
}

/** A bounded lexical reader; strings and stream bytes never masquerade as object delimiters. */
class Cursor {
  constructor(
    readonly bytes: Uint8Array,
    public position = 0,
  ) {}

  skip(): void {
    while (this.position < this.bytes.length) {
      if (whitespace.has(this.bytes[this.position]!)) this.position += 1;
      else if (this.bytes[this.position] === 37) {
        while (this.position < this.bytes.length && ![10, 13].includes(this.bytes[this.position]!)) this.position += 1;
      } else break;
    }
  }

  token(): string {
    this.skip();
    const start = this.position;
    while (
      this.position < this.bytes.length &&
      !whitespace.has(this.bytes[this.position]!) &&
      !delimiters.has(this.bytes[this.position]!)
    ) {
      this.position += 1;
      if (this.position - start > 64) invalid("oversized structural token");
    }
    if (this.position === start) invalid("truncated or invalid structural token");
    return textDecoder.decode(this.bytes.subarray(start, this.position));
  }

  number(label: string): number {
    const value = this.token();
    if (!/^\d+$/u.test(value)) invalid(`invalid ${label}`);
    return integer(Number(value), label);
  }

  expect(value: string): void {
    if (this.token() !== value) invalid(`expected ${value}`);
  }

  value(depth = 0): void {
    if (depth > 64) invalid("PDF object nesting exceeds the supported limit");
    this.skip();
    switch (this.bytes[this.position]) {
      case 40:
        return this.literalString();
      case 47:
        return this.name();
      case 60:
        return this.bytes[this.position + 1] === 60 ? this.collection(false, depth) : this.hexString();
      case 91:
        return this.collection(true, depth);
      default:
        return this.scalar();
    }
  }

  private scalar(): void {
    const token = this.token();
    if (["true", "false", "null"].includes(token)) return;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/u.test(token)) invalid("invalid PDF value");
    if (!/^[+]?\d+$/u.test(token)) return;
    const afterNumber = this.position;
    this.skip();
    if (this.bytes[this.position] !== undefined && this.bytes[this.position]! >= 48 && this.bytes[this.position]! <= 57) {
      const generation = this.token();
      this.skip();
      if (/^\d+$/u.test(generation) && this.bytes[this.position] === 82 && this.tokenBoundary(this.position + 1)) {
        integer(Number(token), "reference number", maximumObjectNumber);
        integer(Number(generation), "reference generation", 65535);
        this.position += 1;
        return;
      }
    }
    this.position = afterNumber;
  }

  private tokenBoundary(offset: number): boolean {
    const byte = this.bytes[offset];
    return byte === undefined || whitespace.has(byte) || delimiters.has(byte);
  }

  private collection(array: boolean, depth: number): void {
    this.position += array ? 1 : 2;
    for (;;) {
      this.skip();
      if (array && this.bytes[this.position] === 93) {
        this.position += 1;
        return;
      }
      if (!array && this.bytes[this.position] === 62 && this.bytes[this.position + 1] === 62) {
        this.position += 2;
        return;
      }
      if (!array) {
        if (this.bytes[this.position] !== 47) invalid("invalid dictionary key");
        this.name();
      }
      this.value(depth + 1);
    }
  }

  private name(): void {
    this.position += 1;
    while (this.position < this.bytes.length && !whitespace.has(this.bytes[this.position]!) && !delimiters.has(this.bytes[this.position]!))
      this.position += 1;
  }

  private literalString(): void {
    let nesting = 1;
    this.position += 1;
    while (this.position < this.bytes.length) {
      const byte = this.bytes[this.position++];
      if (byte === 92) {
        if (this.bytes[this.position] === 13 && this.bytes[this.position + 1] === 10) this.position += 1;
        this.position += 1;
      } else if (byte === 40) {
        nesting += 1;
        if (nesting > 64) invalid("PDF string nesting exceeds the supported limit");
      } else if (byte === 41 && --nesting === 0) return;
    }
    invalid("unterminated PDF string");
  }

  private hexString(): void {
    this.position += 1;
    while (this.position < this.bytes.length) {
      const byte = this.bytes[this.position++]!;
      if (byte === 62) return;
      if (!whitespace.has(byte) && !((byte >= 48 && byte <= 57) || (byte >= 65 && byte <= 70) || (byte >= 97 && byte <= 102)))
        invalid("invalid hexadecimal string");
    }
    invalid("unterminated hexadecimal string");
  }
}

class BoundedWriter extends PDFWriter {
  constructor(context: PDFContext) {
    super(context, 50);
  }

  override async serializeToBuffer(): Promise<Uint8Array> {
    const { size } = await this.computeBufferSize();
    if (size > outputLimit) invalid("normalized PDF exceeds 50 MiB");
    return super.serializeToBuffer();
  }
}

class CrossReferenceResolver {
  private readonly context = PDFContext.create();
  private readonly entries = new Map<number, Entry>();
  private readonly seenSections = new Set<number>();
  private readonly objects = new Map<number, PDFObject>();
  private readonly objectStreams = new Map<number, ObjectStreamIndex>();
  private readonly remainingMembers = new Map<number, number>();
  private readonly readingObjects = new Set<number>();
  private readonly decodeBudget = { remaining: 32 * 1024 * 1024 };
  private readonly trailers: PDFDict[] = [];
  private readonly objectBoundaries = new Map<number, number>();
  private entryCount = 0;

  constructor(private readonly source: Uint8Array) {}

  async normalize(): Promise<Uint8Array> {
    this.readSections();
    this.preserveTrailer();
    this.indexObjectBoundaries();
    for (const entry of this.entries.values()) {
      if (entry.kind === "compressed") {
        this.remainingMembers.set(entry.stream, (this.remainingMembers.get(entry.stream) ?? 0) + 1);
      }
    }
    for (const [id, entry] of this.entries) {
      if (id !== 0 && entry.kind !== "free") this.currentObject(id);
    }
    const root = this.context.lookup(this.context.trailerInfo.Root);
    if (!(root instanceof PDFDict) || root.get(PDFName.of("Type")) !== PDFName.of("Catalog")) invalid("missing current document catalog");
    this.validatePageTree(root);
    return new BoundedWriter(this.context).serializeToBuffer();
  }

  private indexObjectBoundaries(): void {
    const offsets = new Set([...this.seenSections, this.source.length]);
    for (const entry of this.entries.values()) if (entry.kind === "direct") offsets.add(this.offset(entry.offset));
    const ordered = [...offsets].sort((a, b) => a - b);
    for (let index = 1; index < ordered.length; index += 1) this.objectBoundaries.set(ordered[index - 1]!, ordered[index]!);
  }

  private offset(value: number): number {
    integer(value, "cross-reference offset");
    if (value >= this.source.length) invalid("cross-reference offset lies outside the PDF");
    return value;
  }

  private visit(offset: number): void {
    this.offset(offset);
    if (this.seenSections.has(offset)) invalid("cross-reference cycle");
    if (this.seenSections.size >= sectionLimit) invalid("more than 128 cross-reference sections");
    this.seenSections.add(offset);
  }

  private countEntries(count: number): void {
    integer(count, "cross-reference count");
    this.entryCount += count;
    if (this.entryCount > entryLimit) invalid("more than 100,000 cross-reference entries");
  }

  private readSections(): void {
    const tail = textDecoder.decode(this.source.subarray(Math.max(0, this.source.length - 16_384)));
    // oxlint-disable-next-line no-control-regex -- PDF whitespace explicitly includes NUL and form feed.
    const match = /startxref[\x00\x09\x0a\x0c\x0d\x20]+(\d+)[\x00\x09\x0a\x0c\x0d\x20]+%%EOF[\x00\x09\x0a\x0c\x0d\x20]*$/u.exec(tail);
    if (!match) invalid("missing final cross-reference marker");
    let offset: number | undefined = Number(match[1]);
    while (offset !== undefined) {
      this.visit(offset);
      const section = textDecoder.decode(this.source.subarray(offset, offset + 4)) === "xref" ? this.table(offset) : this.stream(offset);
      this.trailers.push(section.trailer);
      for (const [id, entry] of section.entries) if (!this.entries.has(id)) this.entries.set(id, entry);
      offset = dictionaryInteger(section.trailer, "Prev");
    }
  }

  private table(offset: number): Section {
    const cursor = new Cursor(this.source, offset);
    cursor.expect("xref");
    const entries = new Map<number, Entry>();
    for (;;) {
      const token = cursor.token();
      if (token === "trailer") break;
      this.tableSubsection(cursor, entries, token);
    }
    const trailer = this.value(cursor);
    if (!(trailer instanceof PDFDict)) invalid("invalid cross-reference trailer");
    this.validateSize(entries, trailer);
    const supplement = dictionaryInteger(trailer, "XRefStm");
    if (supplement !== undefined) {
      this.visit(supplement);
      // The supplemental stream wins within this revision; only the table's Prev is followed.
      for (const [id, entry] of this.stream(supplement).entries) entries.set(id, entry);
    }
    return { entries, trailer };
  }

  private tableSubsection(cursor: Cursor, entries: Map<number, Entry>, firstToken: string): void {
    if (!/^\d+$/u.test(firstToken)) invalid("invalid cross-reference subsection");
    const first = integer(Number(firstToken), "object number", maximumObjectNumber);
    const count = cursor.number("cross-reference count");
    this.countEntries(count);
    integer(first + Math.max(0, count - 1), "object number", maximumObjectNumber);
    for (let index = 0; index < count; index += 1) {
      const offset = cursor.number("object offset");
      const generation = integer(cursor.number("generation"), "generation", 65535);
      const state = cursor.token();
      if (state !== "n" && state !== "f") invalid("invalid cross-reference entry");
      this.addEntry(entries, first + index, state === "f" ? { kind: "free", generation } : { kind: "direct", generation, offset });
    }
  }

  private stream(offset: number): Section {
    const { object } = this.indirect(offset);
    if (!(object instanceof PDFRawStream) || object.dict.get(PDFName.of("Type")) !== PDFName.of("XRef"))
      invalid("expected a cross-reference stream");
    const widths = integerArray(object.dict, "W");
    if (!widths || widths.length !== 3 || widths.some((width) => width > 7) || widths.every((width) => width === 0))
      invalid("invalid cross-reference field widths");
    const size = requiredInteger(object.dict, "Size");
    const ranges = integerArray(object.dict, "Index") ?? [0, size];
    if (ranges.length % 2) invalid("invalid cross-reference index");
    let rows = 0;
    for (let index = 1; index < ranges.length; index += 2) rows += ranges[index]!;
    this.countEntries(rows);
    const bytes = decodePdfStructureStream(object, this.decodeBudget);
    const rowWidth = widths.reduce((sum, width) => sum + width, 0);
    if (bytes.length !== rows * rowWidth) invalid("truncated or oversized cross-reference stream");
    const cursor = new Cursor(bytes);
    const entries = new Map<number, Entry>();
    for (let range = 0; range < ranges.length; range += 2) {
      const first = ranges[range]!;
      const count = ranges[range + 1]!;
      integer(first + count - (count ? 1 : 0), "object number", maximumObjectNumber);
      for (let index = 0; index < count; index += 1) {
        const type = this.field(cursor, widths[0]!, 1);
        const firstField = this.field(cursor, widths[1]!, 0);
        const secondField = this.field(cursor, widths[2]!, 0);
        this.addEntry(entries, first + index, this.streamEntry(type, firstField, secondField));
      }
    }
    this.validateSize(entries, object.dict);
    return { entries, trailer: object.dict };
  }

  private field(cursor: Cursor, width: number, fallback: number): number {
    if (width === 0) return fallback;
    let value = 0;
    for (let index = 0; index < width; index += 1) {
      const byte = cursor.bytes[cursor.position++];
      if (byte === undefined) invalid("truncated cross-reference field");
      value = integer(value * 256 + byte, "cross-reference field");
    }
    return value;
  }

  private streamEntry(type: number, first: number, second: number): Entry {
    if (type === 0) return { kind: "free", generation: integer(second, "generation", 65535) };
    if (type === 1) return { kind: "direct", offset: first, generation: integer(second, "generation", 65535) };
    if (type === 2) return { kind: "compressed", stream: integer(first, "object-stream number", maximumObjectNumber), index: second };
    return invalid("unsupported cross-reference entry type");
  }

  private addEntry(entries: Map<number, Entry>, id: number, entry: Entry): void {
    if (entries.has(id)) invalid("overlapping cross-reference subsections");
    if (id === 0 && entry.kind !== "free") invalid("object zero must be free");
    entries.set(id, entry);
  }

  private validateSize(entries: ReadonlyMap<number, Entry>, trailer: PDFDict): void {
    const size = integer(requiredInteger(trailer, "Size"), "cross-reference Size", maximumObjectNumber + 1);
    if (size === 0) invalid("empty cross-reference Size");
    for (const id of entries.keys()) if (id >= size) invalid("object number exceeds cross-reference Size");
  }

  private preserveTrailer(): void {
    for (const key of ["Root", "Info", "ID", "Encrypt"] as const) {
      for (const trailer of this.trailers) {
        const value = trailer.get(PDFName.of(key));
        if (value !== undefined) {
          this.context.trailerInfo[key] = value;
          break;
        }
      }
    }
    if (this.context.trailerInfo.Encrypt && this.context.trailerInfo.Encrypt !== PDFNull)
      invalid("encrypted PDFs are not supported for editing");
  }

  private value(cursor: Cursor): PDFObject {
    cursor.skip();
    const start = cursor.position;
    cursor.value();
    return PDFObjectParser.forBytes(cursor.bytes.subarray(start, cursor.position), this.context).parseObject();
  }

  private indirect(offset: number, resolveLength?: (ref: PDFRef) => number): ParsedObject {
    const cursor = new Cursor(this.source, this.offset(offset));
    const number = integer(cursor.number("object number"), "object number", maximumObjectNumber);
    const generation = integer(cursor.number("object generation"), "object generation", 65535);
    cursor.expect("obj");
    let object = this.value(cursor);
    const next = cursor.token();
    if (next === "stream") {
      if (!(object instanceof PDFDict)) invalid("stream has no dictionary");
      object = this.rawStream(cursor, object, resolveLength, resolveLength ? this.objectBoundaries.get(offset) : undefined);
      cursor.expect("endobj");
    } else if (next !== "endobj") invalid("unterminated indirect object");
    return { ref: PDFRef.of(number, generation), object };
  }

  private rawStream(cursor: Cursor, dictionary: PDFDict, resolveLength?: (ref: PDFRef) => number, boundary?: number): PDFRawStream {
    this.streamLineEnding(cursor);
    const start = cursor.position;
    const length = this.streamLength(dictionary, start, resolveLength, boundary);
    const end = integer(start + length, "stream end");
    if (end > cursor.bytes.length) invalid("truncated stream");
    cursor.position = end;
    cursor.expect("endstream");
    return PDFRawStream.of(dictionary, cursor.bytes.subarray(start, end));
  }

  private streamLineEnding(cursor: Cursor): void {
    while (cursor.bytes[cursor.position] === 32 || cursor.bytes[cursor.position] === 9) cursor.position += 1;
    if (cursor.bytes[cursor.position] === 13) {
      cursor.position += 1;
      if (cursor.bytes[cursor.position] === 10) cursor.position += 1;
    } else if (cursor.bytes[cursor.position] === 10) cursor.position += 1;
    else invalid("stream keyword lacks a line ending");
  }

  private streamLength(dictionary: PDFDict, start: number, resolveLength?: (ref: PDFRef) => number, boundary?: number): number {
    const lengthValue = dictionary.get(PDFName.of("Length"));
    if (lengthValue instanceof PDFNumber) return integer(lengthValue.asNumber(), "stream length");
    if (lengthValue instanceof PDFRef && resolveLength) return resolveLength(lengthValue);
    if (lengthValue === undefined && boundary !== undefined) return this.missingStreamLength(start, boundary);
    return invalid("stream Length cannot be resolved safely");
  }

  private missingStreamLength(start: number, boundary: number): number {
    // Some readable PDFs omit Length. Repair only an unambiguous terminal stream within known xref boundaries.
    const span = textDecoder.decode(this.source.subarray(start, boundary));
    // oxlint-disable-next-line no-control-regex -- Match PDF whitespace, including NUL, without accepting arbitrary Unicode spaces.
    const pattern = /(?:\r\n|\r|\n)endstream[\x00\x09\x0a\x0c\x0d\x20]+endobj\b/gu;
    const marker = pattern.exec(span);
    if (!marker || pattern.exec(span)) invalid("missing stream Length has an ambiguous boundary");
    const tail = new Cursor(this.source.subarray(start + marker.index + marker[0].length, boundary));
    tail.skip();
    if (tail.position !== tail.bytes.length) invalid("missing stream Length has no terminal boundary");
    return marker.index;
  }

  private currentObject(id: number): PDFObject {
    const cached = this.objects.get(id);
    if (cached) return cached;
    if (this.readingObjects.has(id) || this.readingObjects.size >= 64) invalid("cyclic or excessively nested object dependency");
    const entry = this.entries.get(id);
    if (!entry || entry.kind === "free") invalid("reference lacks a current definition");
    this.readingObjects.add(id);
    try {
      const object = entry.kind === "compressed" ? this.compressedObject(id, entry) : this.directObject(id, entry);
      this.objects.set(id, object);
      this.assign(id, entry.kind === "direct" ? entry.generation : 0, object);
      return object;
    } finally {
      this.readingObjects.delete(id);
    }
  }

  private reference(ref: PDFRef): PDFObject {
    const entry = this.entries.get(ref.objectNumber);
    if (!entry || entry.kind === "free" || (entry.kind === "direct" ? entry.generation : 0) !== ref.generationNumber)
      invalid("reference selects an unavailable generation");
    return this.currentObject(ref.objectNumber);
  }

  private directObject(id: number, entry: Extract<Entry, { kind: "direct" }>): PDFObject {
    const { ref, object } = this.indirect(entry.offset, (lengthRef) => {
      const length = this.reference(lengthRef);
      if (!(length instanceof PDFNumber)) invalid("stream Length is not an integer");
      return integer(length.asNumber(), "stream length");
    });
    if (ref.objectNumber !== id || ref.generationNumber !== entry.generation) invalid("cross-reference object identity mismatch");
    return object;
  }

  private compressedObject(id: number, entry: Extract<Entry, { kind: "compressed" }>): PDFObject {
    const group = this.objectStreams.get(entry.stream) ?? this.objectStream(entry.stream);
    if (entry.index >= group.ids.length || group.ids[entry.index] !== id) invalid("compressed object index does not match its reference");
    const start = group.first + group.offsets[entry.index]!;
    const end = entry.index + 1 < group.ids.length ? group.first + group.offsets[entry.index + 1]! : group.bytes.length;
    const cursor = new Cursor(group.bytes.subarray(start, end));
    const object = this.value(cursor);
    cursor.skip();
    if (cursor.position !== cursor.bytes.length) invalid("trailing compressed object data");
    const remaining = (this.remainingMembers.get(entry.stream) ?? 1) - 1;
    this.remainingMembers.set(entry.stream, remaining);
    if (remaining === 0) this.objectStreams.delete(entry.stream);
    return object;
  }

  private objectStream(streamId: number): ObjectStreamIndex {
    if (this.entries.get(streamId)?.kind !== "direct") invalid("object stream lacks a direct definition");
    const stream = this.currentObject(streamId);
    if (!(stream instanceof PDFRawStream) || stream.dict.get(PDFName.of("Type")) !== PDFName.of("ObjStm"))
      invalid("compressed object points to a non-object stream");
    const count = requiredInteger(stream.dict, "N");
    if (count > entryLimit) invalid("too many objects in an object stream");
    const first = requiredInteger(stream.dict, "First");
    this.resolveMetadata(stream.dict.get(PDFName.of("Filter")));
    this.resolveMetadata(stream.dict.get(PDFName.of("DecodeParms")));
    const bytes = decodePdfStructureStream(stream, this.decodeBudget);
    if (first > bytes.length) invalid("object-stream header exceeds its decoded length");
    const header = new Cursor(bytes.subarray(0, first));
    const ids: number[] = [];
    const offsets: number[] = [];
    const seen = new Set<number>();
    for (let index = 0; index < count; index += 1) {
      const id = integer(header.number("compressed object number"), "compressed object number", maximumObjectNumber);
      const offset = header.number("compressed object offset");
      if (id === 0 || seen.has(id) || offset >= bytes.length - first || (index > 0 && offset <= offsets[index - 1]!))
        invalid("invalid object-stream index");
      seen.add(id);
      ids.push(id);
      offsets.push(offset);
    }
    header.skip();
    if (header.position !== first) invalid("extra object-stream header entries");
    const index = { bytes, first, ids, offsets };
    this.objectStreams.set(streamId, index);
    return index;
  }

  private resolveMetadata(
    value: PDFObject | undefined,
    depth = 0,
    traversal: MetadataTraversal = { visited: new Set(), active: new Set() },
  ): void {
    if (value === undefined) return;
    if (depth > 64 || traversal.active.has(value)) invalid("cyclic or excessively nested stream metadata");
    if (traversal.visited.has(value)) return;
    traversal.active.add(value);
    if (value instanceof PDFRef) this.resolveMetadata(this.reference(value), depth + 1, traversal);
    else if (value instanceof PDFArray) for (const item of value.asArray()) this.resolveMetadata(item, depth + 1, traversal);
    else if (value instanceof PDFDict) for (const [, item] of value.entries()) this.resolveMetadata(item, depth + 1, traversal);
    traversal.active.delete(value);
    traversal.visited.add(value);
  }

  private validatePageTree(catalog: PDFDict): void {
    const root = catalog.get(PDFName.of("Pages"));
    if (!(root instanceof PDFRef)) invalid("catalog lacks a page-tree reference");
    const queue: { ref: PDFRef; exit: boolean; depth: number; parent: PDFRef | undefined }[] = [
      { ref: root, exit: false, depth: 0, parent: undefined },
    ];
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    while (queue.length) {
      const { ref, exit, depth, parent } = queue.pop()!;
      const key = ref.toString();
      const node = this.pageTreeNode(ref, depth, parent);
      const type = node.get(PDFName.of("Type"));
      if (type === PDFName.of("Page")) {
        if (seen.has(key)) invalid("page tree contains a cycle or repeated page");
        seen.add(key);
        counts.set(key, 1);
        continue;
      }
      const children = this.pageTreeChildren(node);
      if (exit) {
        counts.set(key, this.pageBranchCount(node, children, counts));
        continue;
      }
      if (seen.has(key) || seen.size + queue.length + children.length > entryLimit) invalid("page tree cycle or size limit");
      seen.add(key);
      queue.push({ ref, exit: true, depth, parent });
      for (const child of children) queue.push({ ref: child, exit: false, depth: depth + 1, parent: ref });
    }
  }

  private pageBranchCount(node: PDFDict, children: readonly PDFRef[], counts: ReadonlyMap<string, number>): number {
    const count = children.reduce((sum, child) => sum + (counts.get(child.toString()) ?? 0), 0);
    const declared = this.context.lookup(node.get(PDFName.of("Count")));
    if (!(declared instanceof PDFNumber)) invalid("page-tree Count must be an integer");
    if (integer(declared.asNumber(), "page-tree Count") !== count) invalid("page tree count does not match its pages");
    return count;
  }

  private pageTreeNode(ref: PDFRef, depth: number, parent: PDFRef | undefined): PDFDict {
    if (depth > 64) invalid("page-tree depth exceeds 64 levels");
    const node = this.context.lookup(ref);
    if (!(node instanceof PDFDict)) invalid("page tree references a missing node");
    if (node.get(PDFName.of("Parent"))?.toString() !== parent?.toString()) invalid("page-tree Parent does not match its ancestry");
    return node;
  }

  private pageTreeChildren(node: PDFDict): PDFRef[] {
    if (node.get(PDFName.of("Type")) !== PDFName.of("Pages")) invalid("page tree references a non-page object");
    const kids = this.context.lookup(node.get(PDFName.of("Kids")));
    if (!(kids instanceof PDFArray)) invalid("page tree lacks its children");
    return kids.asArray().map((child) => {
      if (!(child instanceof PDFRef)) invalid("page tree contains a non-reference child");
      return child;
    });
  }

  private assign(id: number, generation: number, object: PDFObject): void {
    // Old object/xref streams must not survive normalization: pdf-lib expands every such stream when reloading.
    if (object instanceof PDFRawStream) {
      const type = object.dict.get(PDFName.of("Type"));
      if (type === PDFName.of("ObjStm") || type === PDFName.of("XRef")) return;
    }
    this.context.assign(PDFRef.of(id, generation), object);
  }
}

/** Resolve the active revision before pdf-lib's editing parser sees obsolete object-stream definitions. */
export async function normalizePdfForEditing(source: Uint8Array): Promise<Uint8Array> {
  if (source.byteLength > sourceLimit) invalid("source PDF exceeds 25 MiB");
  if (!textDecoder.decode(source.subarray(0, 1024)).includes("%PDF-")) invalid("missing PDF header");
  return new CrossReferenceResolver(source).normalize();
}
