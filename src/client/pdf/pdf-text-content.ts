import type { TextContent } from "pdfjs-dist/types/src/display/api";

export interface PdfTextContentSource {
  streamTextContent(): ReadableStream<TextContent>;
}

export async function readPdfTextContent(source: PdfTextContentSource): Promise<TextContent> {
  const reader = source.streamTextContent().getReader();
  const items: TextContent["items"] = [];
  const styles: TextContent["styles"] = Object.create(null);
  let lang: string | null = null;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) return { items, styles, lang };
      lang ??= result.value.lang;
      Object.assign(styles, result.value.styles);
      items.push(...result.value.items);
    }
  } finally {
    reader.releaseLock();
  }
}
