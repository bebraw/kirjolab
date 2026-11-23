import type { PDFPageProxy } from "pdfjs-dist";
import { afterEach, expect, it, vi } from "vitest";
import { renderPdfPageJpeg } from "./pdf-page-image";

afterEach(() => vi.unstubAllGlobals());

it.each([
  {
    name: "uncapped thumbnail",
    options: { width: 128, quality: 0.72 },
    viewport: { width: 128, height: 192 },
    pixels: { width: 128, height: 192 },
  },
  {
    name: "scale-limited OCR image",
    options: { width: 1600, quality: 0.86, maxScale: 2 },
    viewport: { width: 64.5, height: 96.75 },
    pixels: { width: 65, height: 97 },
  },
])("encodes the $name after painting the sized canvas", async ({ options, viewport, pixels }) => {
  const canvas = { width: 0, height: 0, toDataURL: vi.fn(() => "data:image/jpeg;base64,page") };
  vi.stubGlobal("document", { createElement: () => canvas });
  let finishRender: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    finishRender = resolve;
  });
  const getViewport = vi.fn<PDFPageProxy["getViewport"]>();
  vi.mocked(getViewport, { partial: true }).mockImplementation(({ scale } = { scale: 1 }) => ({
    width: 32.25 * scale,
    height: 48.375 * scale,
  }));
  const render = vi.fn<PDFPageProxy["render"]>();
  vi.mocked(render, { partial: true }).mockReturnValue({ promise });

  const image = renderPdfPageJpeg({ getViewport, render }, options);
  expect(render).toHaveBeenCalledWith({ canvas, viewport });
  expect(canvas).toMatchObject(pixels);
  await Promise.resolve();
  expect(canvas.toDataURL).not.toHaveBeenCalled();
  finishRender();
  await expect(image).resolves.toBe("data:image/jpeg;base64,page");
  expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", options.quality);
});
