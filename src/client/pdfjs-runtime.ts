import type * as PdfJs from "pdfjs-dist";

export type PdfJsRuntime = typeof PdfJs;

declare const __PDFJS_RUNTIME_URL__: string;

const pdfJsRuntimeUrl = typeof __PDFJS_RUNTIME_URL__ === "undefined" ? "/pdfjs-module-development.js" : __PDFJS_RUNTIME_URL__;
let runtimePromise: Promise<PdfJsRuntime> | null = null;

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
