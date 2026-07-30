export type PdfFailureKind = "analysis" | "analysis-load" | "navigation" | "viewer";

const pdfFailureMessages: Readonly<Record<PdfFailureKind, string>> = {
  analysis: "Could not analyze this PDF. Retry when the local analysis service is available.",
  "analysis-load": "Could not load PDF analysis. Retry in a moment.",
  navigation: "Could not load the document map. Retry in a moment.",
  viewer: "Could not display this PDF. Try reopening it.",
};

export function pdfFailureMessage(kind: PdfFailureKind): string {
  return pdfFailureMessages[kind];
}
