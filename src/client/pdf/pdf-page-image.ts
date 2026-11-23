import type { PDFPageProxy } from "pdfjs-dist";

interface PdfPageImageOptions {
  width: number;
  maxScale?: number;
  quality: number;
}

export async function renderPdfPageJpeg(
  page: Pick<PDFPageProxy, "getViewport" | "render">,
  { width, maxScale = Infinity, quality }: PdfPageImageOptions,
): Promise<string> {
  const unscaled = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(maxScale, width / unscaled.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return canvas.toDataURL("image/jpeg", quality);
}
