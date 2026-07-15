import { LineCapStyle, PDFDocument, PDFHexString, PDFName, rgb, type PDFPage } from "pdf-lib";
import type { LibraryHighlight, LibraryPdfMarkup, LibraryPdfPoint, LibraryPdfRect } from "../domain/reference-library";

const referencePageWidth = 900;
const noteMarkerSize = 14;

export interface AnnotatedPdfInput {
  readonly markups: readonly LibraryPdfMarkup[];
  readonly highlights: readonly LibraryHighlight[];
}

export async function renderAnnotatedPdf(source: Uint8Array, input: AnnotatedPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.load(source, { updateMetadata: false });
  const pages = document.getPages();

  for (const markup of input.markups) {
    const page = pages[markup.page - 1];
    if (!page) continue;
    if (markup.kind === "drawing") drawStroke(page, markup.points, markup.color, markup.width);
    else addNote(document, page, { x: markup.x, y: markup.y }, markup.body, "Kirjolab note");
  }

  const highlightOffsets = new Map<number, number>();
  for (const highlight of input.highlights) {
    const page = pages[highlight.page - 1];
    if (!page) continue;
    const body = highlight.comment ? `${highlight.quote}\n\n${highlight.comment}` : highlight.quote;
    if (highlight.rects.length > 0) addHighlight(document, page, highlight.rects, body);
    else {
      const offset = highlightOffsets.get(highlight.page) ?? 0;
      highlightOffsets.set(highlight.page, offset + 1);
      addNote(document, page, { x: 0.97, y: Math.min(0.92, 0.08 + offset * 0.045) }, body, "Kirjolab highlight");
    }
  }

  document.setProducer("Kirjolab annotated PDF");
  document.setModificationDate(new Date());
  return await document.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
}

function drawStroke(page: PDFPage, points: readonly LibraryPdfPoint[], colorValue: string, width: number): void {
  const color = hexColor(colorValue);
  const thickness = Math.max(0.5, (width * visualPageWidth(page)) / referencePageWidth);
  for (let index = 1; index < points.length; index += 1) {
    const start = normalizedPointOnPage(page, points[index - 1]!);
    const end = normalizedPointOnPage(page, points[index]!);
    page.drawLine({ start, end, thickness, color, lineCap: LineCapStyle.Round });
  }
}

function addNote(document: PDFDocument, page: PDFPage, normalized: LibraryPdfPoint, body: string, title: string): void {
  const anchor = normalizedPointOnPage(page, normalized);
  const crop = page.getCropBox();
  const half = noteMarkerSize / 2;
  const x = clamp(anchor.x - half, crop.x, crop.x + crop.width - noteMarkerSize);
  const y = clamp(anchor.y - half, crop.y, crop.y + crop.height - noteMarkerSize);
  const annotation = document.context.obj({
    Type: "Annot",
    Subtype: "Text",
    Rect: [x, y, x + noteMarkerSize, y + noteMarkerSize],
    Contents: PDFHexString.fromText(body),
    T: PDFHexString.fromText(title),
    Name: "Comment",
    C: [1, 0.84, 0.27],
    F: 4,
    P: page.ref,
    NM: PDFHexString.fromText(crypto.randomUUID()),
    M: PDFHexString.fromText(pdfDate(new Date())),
    Open: false,
  });
  const annotationRef = document.context.register(annotation);
  const popupWidth = Math.min(220, crop.width);
  const popupHeight = Math.min(120, crop.height);
  const popupX = clamp(x + noteMarkerSize, crop.x, crop.x + crop.width - popupWidth);
  const popupY = clamp(y, crop.y, crop.y + crop.height - popupHeight);
  const popup = document.context.obj({
    Type: "Annot",
    Subtype: "Popup",
    Rect: [popupX, popupY, popupX + popupWidth, popupY + popupHeight],
    Parent: annotationRef,
    P: page.ref,
    F: 4,
    Open: false,
  });
  const popupRef = document.context.register(popup);
  annotation.set(PDFName.of("Popup"), popupRef);
  page.node.addAnnot(annotationRef);
  page.node.addAnnot(popupRef);
}

function addHighlight(document: PDFDocument, page: PDFPage, rects: readonly LibraryPdfRect[], body: string): void {
  const quadPoints: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const rect of rects) {
    const topLeft = normalizedPointOnPage(page, rect);
    const topRight = normalizedPointOnPage(page, { x: rect.x + rect.width, y: rect.y });
    const bottomLeft = normalizedPointOnPage(page, { x: rect.x, y: rect.y + rect.height });
    const bottomRight = normalizedPointOnPage(page, { x: rect.x + rect.width, y: rect.y + rect.height });
    xs.push(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    ys.push(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
    quadPoints.push(topLeft.x, topLeft.y, topRight.x, topRight.y, bottomLeft.x, bottomLeft.y, bottomRight.x, bottomRight.y);
  }
  const annotation = document.context.obj({
    Type: "Annot",
    Subtype: "Highlight",
    Rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    QuadPoints: quadPoints,
    Contents: PDFHexString.fromText(body),
    T: PDFHexString.fromText("Kirjolab highlight"),
    C: [1, 0.83, 0.25],
    CA: 0.34,
    F: 4,
    P: page.ref,
    NM: PDFHexString.fromText(crypto.randomUUID()),
    M: PDFHexString.fromText(pdfDate(new Date())),
  });
  page.node.addAnnot(document.context.register(annotation));
}

function pdfDate(value: Date): string {
  return `D:${value
    .toISOString()
    .replace(/[-:T]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z")}`;
}

export function normalizedPointOnPage(page: PDFPage, point: LibraryPdfPoint): { x: number; y: number } {
  const crop = page.getCropBox();
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  if (angle === 90) return { x: crop.x + point.y * crop.width, y: crop.y + point.x * crop.height };
  if (angle === 180) return { x: crop.x + (1 - point.x) * crop.width, y: crop.y + point.y * crop.height };
  if (angle === 270) return { x: crop.x + (1 - point.y) * crop.width, y: crop.y + (1 - point.x) * crop.height };
  return { x: crop.x + point.x * crop.width, y: crop.y + (1 - point.y) * crop.height };
}

function visualPageWidth(page: PDFPage): number {
  const crop = page.getCropBox();
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  return angle === 90 || angle === 270 ? crop.height : crop.width;
}

function hexColor(value: string): ReturnType<typeof rgb> {
  const match = /^#(?<red>[0-9a-f]{2})(?<green>[0-9a-f]{2})(?<blue>[0-9a-f]{2})$/iu.exec(value);
  if (!match?.groups) return rgb(0.83, 0.25, 0.29);
  return rgb(
    Number.parseInt(match.groups.red!, 16) / 255,
    Number.parseInt(match.groups.green!, 16) / 255,
    Number.parseInt(match.groups.blue!, 16) / 255,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
