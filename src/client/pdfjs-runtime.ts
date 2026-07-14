import type * as PdfJs from "pdfjs-dist";

export type PdfJsRuntime = typeof PdfJs;

const pdfJsRuntimeUrl = "/pdfjs-module-6.1.200.js";
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
