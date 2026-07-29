export interface PdfAnalysisPixelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PdfAnalysisTextSpan {
  readonly index: number;
  readonly text: string;
  readonly rect: PdfAnalysisPixelRect;
  readonly hasEol: boolean;
}

export interface PdfAnalysisPage {
  readonly page: number;
  readonly text: string;
  readonly spans: readonly PdfAnalysisTextSpan[];
}

export interface PdfAnalysisBitmap {
  readonly page: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

export interface PdfAnalysisViewport {
  readonly width: number;
  readonly height: number;
  convertToViewportPoint(x: number, y: number): number[];
}

export interface PdfNativeAnnotation {
  readonly subtype?: unknown;
  readonly rect?: unknown;
  readonly quadPoints?: unknown;
  readonly contentsObj?: { readonly str?: unknown } | null;
}
