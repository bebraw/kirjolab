import type { TextContent } from "pdfjs-dist/types/src/display/api";
import { describe, expect, it } from "vitest";
import { readPdfTextContent } from "./pdf-text-content";

describe("PDF text content", () => {
  it("reads and combines chunks without async stream iteration", async () => {
    const chunks: TextContent[] = [
      {
        items: [textItem("First", "f1")],
        styles: { f1: { fontFamily: "serif", ascent: 0.8, descent: -0.2, vertical: false } },
        lang: null,
      },
      {
        items: [textItem("Second", "f2")],
        styles: { f2: { fontFamily: "sans-serif", ascent: 0.7, descent: -0.3, vertical: false } },
        lang: "en",
      },
    ];
    const stream = new ReadableStream<TextContent>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
    const source = {
      streamTextContent: () => stream,
    };

    await expect(readPdfTextContent(source)).resolves.toEqual({
      items: [textItem("First", "f1"), textItem("Second", "f2")],
      styles: { f1: chunks[0]!.styles.f1, f2: chunks[1]!.styles.f2 },
      lang: "en",
    });
  });

  it("propagates a streaming failure", async () => {
    const source = {
      streamTextContent: () =>
        new ReadableStream<TextContent>({
          pull() {
            throw new Error("stream failed");
          },
        }),
    };

    await expect(readPdfTextContent(source)).rejects.toThrow("stream failed");
  });
});

function textItem(str: string, fontName: string): TextContent["items"][number] {
  return { str, dir: "ltr", transform: [1, 0, 0, 1, 0, 0], width: 1, height: 1, fontName, hasEOL: false };
}
