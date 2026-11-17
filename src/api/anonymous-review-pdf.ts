import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFStream,
  PDFString,
  PDFWriter,
  type PDFContext,
  type PDFObject,
} from "pdf-lib";

const removedAnnotationFields = ["NM", "M", "CreationDate", "Subj", "RC", "ExData"];
const removedMetadataFields = ["Metadata", "PieceInfo"];
const annotationSubtypes = new Set([
  "Text",
  "Link",
  "FreeText",
  "Line",
  "Square",
  "Circle",
  "Polygon",
  "PolyLine",
  "Highlight",
  "Underline",
  "Squiggly",
  "StrikeOut",
  "Stamp",
  "Caret",
  "Ink",
  "Popup",
  "FileAttachment",
  "Sound",
  "Movie",
  "Widget",
  "Screen",
  "PrinterMark",
  "TrapNet",
  "Watermark",
  "3D",
  "Redact",
  "RichMedia",
  "Projection",
]);
// Retain standard annotation content, geometry, appearance, and reply relationships.
// Private editor extensions can contain identities under arbitrary field names.
const annotationFields = new Set(
  (
    "Type Subtype Rect Contents P F AP AS Border C CA ca BM Lang T Name Open Popup Parent IRT RT IT " +
    "QuadPoints InkList L LE LL LLE LLO IC BS BE RD DA DS Q CL RC Rotate Rotation " +
    "Vertices Path Measure Cap CP CO State StateModel A AA Dest H PA QuadPoints " +
    "FS Sound Movie Activation Action Win Mac Unix IsMap S R Sy OC StructParent FixedPrint " +
    "OverlayText Repeat DefaultAppearance TextColor 3DD 3DV 3DA 3DI 3DB RichMediaContent RichMediaSettings"
  ).split(" "),
);

function fail(detail: string): never {
  throw new Error(`Cannot safely export an anonymous review: ${detail}.`);
}

class ReviewPdfWriter extends PDFWriter {
  constructor(context: PDFContext) {
    super(context, 50);
  }

  override async serializeToBuffer(): Promise<Uint8Array> {
    const { size } = await this.computeBufferSize();
    if (size > 50 * 1024 * 1024) fail("the rewritten PDF exceeds 50 MiB");
    return super.serializeToBuffer();
  }
}

/** Full serialization after removing metadata and every unreachable object; never an incremental save. */
export async function saveAnonymousReviewPdf(document: PDFDocument): Promise<Uint8Array> {
  const pageCount = document.getPageCount();
  await document.flush();
  const info = document.context.lookup(document.context.trailerInfo.Info);
  if (info instanceof PDFDict) for (const key of info.keys()) info.delete(key);
  delete document.context.trailerInfo.Info;
  delete document.context.trailerInfo.ID;
  const retained = inspectGraph(document, true);
  for (const [ref] of document.context.enumerateIndirectObjects()) if (!retained.has(ref)) document.context.delete(ref);
  const bytes = await new ReviewPdfWriter(document.context).serializeToBuffer();

  // Validate the exact bytes that will be downloaded, with metadata updates disabled.
  const reopened = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  if (reopened.getPageCount() !== pageCount) fail("page count changed during rewriting");
  if (reopened.context.trailerInfo.Info || reopened.context.trailerInfo.ID) fail("document metadata remains");
  const reachable = inspectGraph(reopened, false);
  if (reopened.context.enumerateIndirectObjects().some(([ref]) => !reachable.has(ref))) fail("obsolete objects remain");
  return bytes;
}

function inspectGraph(document: PDFDocument, sanitize: boolean): Set<PDFRef> {
  const retained = new Set<PDFRef>();
  const visited = new Set<PDFObject>();
  const annotations = collectPageAnnotations(document);
  const pending: PDFObject[] = [document.catalog];
  if (document.context.trailerInfo.Root instanceof PDFRef) retained.add(document.context.trailerInfo.Root);
  while (pending.length) {
    const object = pending.pop()!;
    if (visited.has(object)) continue;
    visited.add(object);
    if (visited.size > 250_000) fail("the object graph exceeds the supported limit");
    if (object instanceof PDFRef) {
      retained.add(object);
      const value = document.context.lookup(object);
      if (!value) fail("a referenced object is missing");
      pending.push(value);
    } else if (object instanceof PDFArray) pending.push(...object.asArray());
    else if (object instanceof PDFStream) pending.push(object.dict);
    else if (object instanceof PDFDict) {
      inspectDictionary(object, sanitize, annotations.has(object));
      pending.push(...object.values());
    }
  }
  return retained;
}

function collectPageAnnotations(document: PDFDocument): ReadonlySet<PDFDict> {
  const annotations = new Set<PDFDict>();
  for (const page of document.getPages()) {
    const entries = page.node.Annots();
    for (let index = 0; entries && index < entries.size(); index++) {
      const annotation = document.context.lookup(entries.get(index));
      if (!(annotation instanceof PDFDict)) fail("an annotation dictionary is invalid");
      annotations.add(annotation);
    }
  }
  return annotations;
}

function inspectDictionary(dictionary: PDFDict, sanitize: boolean, pageAnnotation: boolean): void {
  if (dictionary.get(PDFName.of("Type")) === PDFName.of("Metadata")) fail("an unexpected metadata stream remains");
  for (const field of removedMetadataFields) removeField(dictionary, field, sanitize);
  const subtype = dictionary.lookup(PDFName.of("Subtype"));
  const annotation =
    pageAnnotation ||
    dictionary.get(PDFName.of("Type")) === PDFName.of("Annot") ||
    (subtype instanceof PDFName && annotationSubtypes.has(subtype.decodeText()));
  if (!annotation) return;
  const richText = dictionary.get(PDFName.of("RC"));
  const contents = dictionary.lookup(PDFName.of("Contents"));
  if (richText && (!(contents instanceof PDFString || contents instanceof PDFHexString) || !contents.decodeText().trim()))
    fail("a rich-text annotation has no plain-text comment to preserve");
  const title = dictionary.lookup(PDFName.of("T"));
  if (sanitize) dictionary.set(PDFName.of("T"), PDFHexString.fromText("Reviewer"));
  else if (!(title instanceof PDFHexString) || title.decodeText() !== "Reviewer") fail("an annotation author remains");
  for (const field of removedAnnotationFields) removeField(dictionary, field, sanitize);
  for (const key of dictionary.keys()) if (!annotationFields.has(key.decodeText())) removeField(dictionary, key.decodeText(), sanitize);
}

function removeField(dictionary: PDFDict, field: string, sanitize: boolean): void {
  const key = PDFName.of(field);
  if (!dictionary.has(key)) return;
  if (!sanitize) fail("annotation or document metadata remains");
  dictionary.delete(key);
}
