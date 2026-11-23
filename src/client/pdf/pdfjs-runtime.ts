import type * as PdfJs from "pdfjs-dist";

export type PdfJsRuntime = typeof PdfJs;
export type PdfViewerRuntime = typeof import("pdfjs-dist/legacy/web/pdf_viewer.mjs");

declare const __PDFJS_RUNTIME_URL__: string;
declare const __PDFJS_VIEWER_URL__: string;
declare const __PDFJS_VIEWER_STYLES_URL__: string;
declare const __PDFJS_VIEWER_IMAGE_PREFIX__: string;

const pdfJsRuntimeUrl = typeof __PDFJS_RUNTIME_URL__ === "undefined" ? "/pdfjs-module-development.js" : __PDFJS_RUNTIME_URL__;
const viewerUrl = typeof __PDFJS_VIEWER_URL__ === "undefined" ? "/pdfjs-viewer-development.js" : __PDFJS_VIEWER_URL__;
const viewerStylesUrl = typeof __PDFJS_VIEWER_STYLES_URL__ === "undefined" ? "/pdfjs-viewer-development.css" : __PDFJS_VIEWER_STYLES_URL__;
export const pdfViewerImageResourcesPath =
  typeof __PDFJS_VIEWER_IMAGE_PREFIX__ === "undefined" ? "/pdfjs-image-development-" : __PDFJS_VIEWER_IMAGE_PREFIX__;
let runtimePromise: Promise<PdfJsRuntime> | null = null;
let viewerStyles: Promise<void> | null = null;

export async function loadPdfViewerRuntime(): Promise<PdfViewerRuntime> {
  // The distributed viewer reads globalThis.pdfjsLib during module evaluation.
  await loadPdfJsRuntime();
  const module: Promise<PdfViewerRuntime> = import(viewerUrl);
  const [viewer] = await Promise.all([module, loadViewerStyles()]);
  return viewer;
}

function loadViewerStyles(): Promise<void> {
  viewerStyles ??= new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = viewerStylesUrl;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      viewerStyles = null;
      reject(new Error("Could not load PDF viewer styles"));
    };
    document.head.append(link);
  });
  return viewerStyles;
}

export async function loadPdfJsRuntime(): Promise<PdfJsRuntime> {
  const pending = runtimePromise ?? importPdfJsRuntime();
  runtimePromise = pending;
  try {
    return await pending;
  } catch (error) {
    if (runtimePromise === pending) runtimePromise = null;
    throw error;
  }
}

async function importPdfJsRuntime(): Promise<PdfJsRuntime> {
  return await import(pdfJsRuntimeUrl);
}
