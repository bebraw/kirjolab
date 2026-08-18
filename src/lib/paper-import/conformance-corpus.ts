import { strToU8, zipSync } from "fflate";

export const paperImportConformanceCorpusVersion = 2 as const;

const reviewedExpected = {
  archiveSha256: "7445c30cfb4d9e4b2a7308a97a439bc45eb91249f205491fca77c3fe68703630",
  rootCandidates: ["alternate.tex", "main.tex"],
  selectedRoot: null,
  convertedFilePaths: ["main.md", "sections/results.md"],
  bibliographyPath: "refs.bib",
  conversion: {
    rootCandidates: ["alternate.tex", "main.tex"],
    selectedRoot: null,
    convertedFilePaths: ["main.md", "sections/results.md"],
    schemaVersion: 2,
    converterVersion: "latex-converter-v2",
    rootPath: "main.tex",
    bibliographyPath: "refs.bib",
    assets: [{ path: "figures/plot.png", mediaType: "image/png" }],
    renderedFormats: ["scholarmark-v1", "scholarmark-v1"],
    title: "Ångström 😀 study",
    authors: ["Ada Lovelace"],
    abstracts: ["Résumé 😀."],
    sections: [{ title: "Results", label: "sec:results" }],
    proseBlocks: [
      {
        id: "sections/results.tex#prose-1",
        kind: "paragraph",
        sectionId: "main.tex#section-1",
        text: "Evidence \\citep{doe2026} refers to Figure \\ref{fig:plot}.",
      },
      {
        id: "sections/results.tex#prose-2",
        kind: "paragraph",
        sectionId: "main.tex#section-1",
        text: "Foot\\footnote{Exact note.} Visible unsupported body. \\unknown",
      },
    ],
    citations: [{ mode: "parenthetical", keys: ["doe2026"] }],
    bibliographyEntries: [{ type: "article", citationKey: "doe2026" }],
    labels: ["sec:results", "fig:plot"],
    references: ["fig:plot"],
    equations: ["x + y"],
    tables: ["tabular"],
    codeBlocks: [{ environment: "lstlisting", language: "typescript", value: "const x = 1;" }],
    footnotes: ["Exact note."],
    figures: [
      {
        sourcePath: "sections/results.tex",
        requestedPath: "plot",
        archivePath: "figures/plot.png",
        resolvedAssetPath: "figures/plot.png",
        contentHash: "4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6",
        mediaType: "image/png",
        source: "\\includegraphics{plot}",
        referenceRange: { path: "sections/results.tex", start: 75, end: 97, unit: "utf16-code-unit" },
        figureSource: "\\begin{figure}\r\n\\includegraphics{plot}\r\n\\caption{Résumé 😀 plot}\r\n\\label{fig:plot}\r\n\\end{figure}",
        figureRange: { path: "sections/results.tex", start: 59, end: 155, unit: "utf16-code-unit" },
        caption: "Résumé 😀 plot",
        captionSource: "\\caption{Résumé 😀 plot}",
        captionRange: { path: "sections/results.tex", start: 99, end: 123, unit: "utf16-code-unit" },
        label: "fig:plot",
        labelSource: "\\label{fig:plot}",
        labelRange: { path: "sections/results.tex", start: 125, end: 141, unit: "utf16-code-unit" },
        resolutionDiagnostics: [],
      },
    ],
    diagnosticCodes: ["unsupported-environment", "unsupported-environment", "unsupported-command"],
  },
  identity: {
    archiveManifestSha256: "3133fface09acacdbf72e57227870b6827c128d111a9a6494f0eb5b42e499014",
    conversionManifestSha256: "f49952f9f505bc5db20b2a8eb63c4bc5eed15cdc237e7f202133ee3a13eb00cf",
    previewDigest: "8b46b68d4150c5fb220862f0a8af9a0201dcc2fbf8c3cd77ace648f32f1f55af",
  },
  ranges: [
    { path: "main.tex", start: 25, end: 50, source: "\\title{Ångström 😀 study}" },
    { path: "main.tex", start: 52, end: 73, source: "\\author{Ada Lovelace}" },
    { path: "main.tex", start: 139, end: 179, source: "\\begin{abstract}Résumé 😀.\\end{abstract}" },
    { path: "main.tex", start: 181, end: 217, source: "\\section{Results}\\label{sec:results}" },
    {
      path: "sections/results.tex",
      start: 0,
      end: 57,
      source: "Evidence \\citep{doe2026} refers to Figure \\ref{fig:plot}.",
    },
    {
      path: "sections/results.tex",
      start: 289,
      end: 380,
      source: "Foot\\footnote{Exact note.}\r\n\\begin{mystery}Visible unsupported body.\\end{mystery}\r\n\\unknown",
    },
    { path: "sections/results.tex", start: 9, end: 24, source: "\\citep{doe2026}" },
    { path: "refs.bib", start: 0, end: 35, source: "@article{doe2026, title={Evidence}}" },
    { path: "main.tex", start: 198, end: 217, source: "\\label{sec:results}" },
    { path: "sections/results.tex", start: 125, end: 141, source: "\\label{fig:plot}" },
    { path: "sections/results.tex", start: 42, end: 56, source: "\\ref{fig:plot}" },
    { path: "sections/results.tex", start: 157, end: 166, source: "\\[x + y\\]" },
    {
      path: "sections/results.tex",
      start: 168,
      end: 214,
      source: "\\begin{tabular}{cc}A & B \\\\ 1 & 2\\end{tabular}",
    },
    {
      path: "sections/results.tex",
      start: 216,
      end: 287,
      source: "\\begin{lstlisting}[language=TypeScript]\r\nconst x = 1;\r\n\\end{lstlisting}",
    },
    { path: "sections/results.tex", start: 293, end: 315, source: "\\footnote{Exact note.}" },
    { path: "sections/results.tex", start: 75, end: 97, source: "\\includegraphics{plot}" },
    {
      path: "sections/results.tex",
      start: 59,
      end: 155,
      source: "\\begin{figure}\r\n\\includegraphics{plot}\r\n\\caption{Résumé 😀 plot}\r\n\\label{fig:plot}\r\n\\end{figure}",
    },
    { path: "sections/results.tex", start: 99, end: 123, source: "\\caption{Résumé 😀 plot}" },
    { path: "sections/results.tex", start: 125, end: 141, source: "\\label{fig:plot}" },
  ],
} as const;

export type ReviewedLatexConformanceExpectedV2 = typeof reviewedExpected;

export interface ReviewedLatexConformanceFixtureV2 {
  readonly schemaVersion: typeof paperImportConformanceCorpusVersion;
  readonly id: "reviewed-latex-paper-v1";
  readonly archive: Uint8Array;
  readonly sourceByPath: Readonly<Record<string, string>>;
  readonly selection: {
    readonly rootPath: "main.tex";
    readonly bibliographyPath: "refs.bib";
  };
  readonly expected: ReviewedLatexConformanceExpectedV2;
}

export type LatexGraphConformanceOrderV2 = "canonical" | "reordered";

const graphExpected = {
  inspection: {
    manifest: [
      { path: "main.tex", kind: "tex", bytes: 80 },
      { path: "part.tex", kind: "tex", bytes: 16 },
      { path: "unused.bib", kind: "bibtex", bytes: 29 },
    ],
    diagnostics: [
      {
        code: "missing-include",
        severity: "error",
        message: "Included LaTeX file was not found: missing",
        path: "main.tex",
        from: 51,
        to: 66,
      },
      {
        code: "unreferenced-bibliography",
        severity: "warning",
        message: "Bibliography is present but not referenced by a LaTeX file: unused.bib",
        path: "unused.bib",
      },
    ],
  },
  conversion: {
    diagnostics: [
      {
        code: "missing-include",
        severity: "error",
        message: "Included LaTeX file was not found: missing",
        sourcePath: "main.tex",
        range: { path: "main.tex", start: 51, end: 66, unit: "utf16-code-unit" },
      },
      {
        code: "include-cycle",
        severity: "error",
        message: "LaTeX include cycle reaches main.tex",
        sourcePath: "main.tex",
      },
      {
        code: "unsupported-command",
        severity: "warning",
        message: "Unsupported LaTeX command remains for review: \\input",
        sourcePath: "main.tex",
      },
    ],
    sourceFingerprints: [
      {
        path: "main.tex",
        kind: "tex",
        bytes: 80,
        sha256: "3a06624d2fdb43efd0428459fd1c5e03df80e2de1edf2d94304b63e5b7a97243",
      },
      {
        path: "part.tex",
        kind: "tex",
        bytes: 16,
        sha256: "73978a6218bffc5cbe8e1b6258806ec0cfb4a0de38a2c08a7c7099f1f2b66290",
      },
    ],
  },
} as const;

export interface LatexGraphConformanceFixtureV2 {
  readonly schemaVersion: typeof paperImportConformanceCorpusVersion;
  readonly id: "latex-include-graph-v1";
  readonly archive: Uint8Array;
  readonly selection: { readonly rootPath: "main.tex" };
  readonly expected: typeof graphExpected;
}

const ambiguousFigureExpected = {
  figures: [
    {
      requestedPath: "plot",
      archivePath: null,
      resolvedAssetPath: null,
      contentHash: null,
      mediaType: null,
      source: "\\includegraphics{plot}",
      referenceRange: { path: "main.tex", start: 39, end: 61, unit: "utf16-code-unit" },
      resolutionDiagnostics: [
        {
          code: "ambiguous-image",
          severity: "warning",
          message: "Referenced figure matches more than one archive file: plot",
        },
      ],
    },
  ],
  diagnostics: [
    {
      code: "ambiguous-image",
      severity: "warning",
      message: "Referenced figure matches more than one archive file: plot",
      sourcePath: "main.tex",
      range: { path: "main.tex", start: 39, end: 61, unit: "utf16-code-unit" },
    },
  ],
} as const;

export interface AmbiguousFigureConformanceFixtureV2 {
  readonly schemaVersion: typeof paperImportConformanceCorpusVersion;
  readonly id: "latex-ambiguous-figure-v1";
  readonly archive: Uint8Array;
  readonly selection: { readonly rootPath: "main.tex" };
  readonly expected: typeof ambiguousFigureExpected;
}

const escapedCommandsExpected = {
  archiveSha256: "8ecf56abf41d174c2be044afa3b9ec1d9bb7d43d46acaa954dc56b2d1d23800a",
  citations: [
    {
      keys: ["active"],
      source: "\\cite{active}",
      range: { path: "main.tex", start: 46, end: 59, unit: "utf16-code-unit" },
    },
    {
      keys: ["triple"],
      source: "\\cite{triple}",
      range: { path: "main.tex", start: 81, end: 94, unit: "utf16-code-unit" },
    },
  ],
  sections: [
    {
      title: "Active section",
      source: "\\section{Active section}",
      range: { path: "main.tex", start: 124, end: 148, unit: "utf16-code-unit" },
    },
  ],
  equations: [
    {
      value: "active equation",
      source: "\\begin{equation}active equation\\end{equation}",
      range: { path: "main.tex", start: 266, end: 311, unit: "utf16-code-unit" },
    },
  ],
} as const;

export interface EscapedCommandsConformanceFixtureV2 {
  readonly schemaVersion: typeof paperImportConformanceCorpusVersion;
  readonly id: "latex-escaped-commands-v1";
  readonly archive: Uint8Array;
  readonly sourceByPath: Readonly<Record<"main.tex", string>>;
  readonly selection: { readonly rootPath: "main.tex" };
  readonly expected: typeof escapedCommandsExpected;
}

const proseBlocksExpected = {
  archiveSha256: "b9e7f4cc48b982f0f534c6d8c6b714db895c0dd22e4dae7ea57af8e350e5e947",
  blocks: [
    {
      id: "main.tex#prose-1",
      kind: "paragraph",
      sectionId: null,
      text: "Lead 😀 with \\cite{lead} and \\(x + y\\).",
      source: "Lead 😀 with \\cite{lead} and \\(x + y\\).",
      range: { path: "main.tex", start: 43, end: 82, unit: "utf16-code-unit" },
    },
    {
      id: "main.tex#prose-2",
      kind: "paragraph",
      sectionId: "main.tex#section-1",
      text: "First method paragraph.",
      source: "First method paragraph.",
      range: { path: "main.tex", start: 105, end: 128, unit: "utf16-code-unit" },
    },
    {
      id: "main.tex#prose-3",
      kind: "paragraph",
      sectionId: "main.tex#section-1",
      text: "Second method paragraph.",
      source: "Second method paragraph.",
      range: { path: "main.tex", start: 132, end: 156, unit: "utf16-code-unit" },
    },
    {
      id: "part.tex#prose-1",
      kind: "paragraph",
      sectionId: "main.tex#section-1",
      text: "Inherited Å prose.",
      source: "Inherited Å prose.",
      range: { path: "part.tex", start: 0, end: 18, unit: "utf16-code-unit" },
    },
    {
      id: "part.tex#prose-2",
      kind: "list-item",
      sectionId: "main.tex#section-1",
      text: "First item with \\cite{one}.",
      source: "\\item First item with \\cite{one}.",
      range: { path: "part.tex", start: 39, end: 72, unit: "utf16-code-unit" },
    },
    {
      id: "part.tex#prose-3",
      kind: "list-item",
      sectionId: "main.tex#section-1",
      text: "Second item with \\(z\\).",
      source: "\\item Second item with \\(z\\).",
      range: { path: "part.tex", start: 74, end: 103, unit: "utf16-code-unit" },
    },
  ],
} as const;

export interface ProseBlocksConformanceFixtureV2 {
  readonly schemaVersion: typeof paperImportConformanceCorpusVersion;
  readonly id: "latex-prose-blocks-v1";
  readonly archive: Uint8Array;
  readonly sourceByPath: Readonly<Record<"main.tex" | "part.tex", string>>;
  readonly selection: { readonly rootPath: "main.tex" };
  readonly expected: typeof proseBlocksExpected;
}

export type LatexArchiveFailureConformanceIdV2 =
  | "empty-archive"
  | "malformed-archive"
  | "traversal-path"
  | "absolute-path"
  | "windows-absolute-path"
  | "backslash-path"
  | "prototype-poisoning-path"
  | "case-folded-duplicate"
  | "symbolic-link"
  | "encrypted-entry"
  | "zip64-archive"
  | "expansion-ratio"
  | "invalid-utf8"
  | "oversized-source";

export interface LatexArchiveFailureConformanceFixtureV2 {
  readonly schemaVersion: typeof paperImportConformanceCorpusVersion;
  readonly id: LatexArchiveFailureConformanceIdV2;
  readonly archive: Uint8Array;
  readonly expected: {
    readonly code: string;
    readonly message: string;
  };
}

const twoPagePdfExpected = {
  schemaVersion: 1,
  sha256: "19ac21175b4b299831fb1a7d7e8bd046ca5bdab709f592aeb6c39384a2a01dc6",
  pageCount: 2,
  pages: [
    { pageNumber: 1, text: "First page keeps its reading position.", warnings: [] },
    { pageNumber: 2, text: "Second page verifies restored PDF context.", warnings: [] },
  ],
  diagnostics: [],
  truncated: false,
} as const;

export interface TwoPagePdfConformanceFixtureV2 {
  readonly schemaVersion: typeof paperImportConformanceCorpusVersion;
  readonly id: "two-page-native-text-pdf-v1";
  readonly bytes: Uint8Array;
  readonly limits: {
    readonly maximumInputBytes: 4096;
    readonly maximumPages: 10;
    readonly maximumPageTextCodeUnits: 100;
    readonly maximumDocumentTextCodeUnits: 500;
  };
  readonly expected: typeof twoPagePdfExpected;
}

export interface PaperImportConformanceCorpusV2 {
  readonly schemaVersion: typeof paperImportConformanceCorpusVersion;
  readonly latex: {
    readonly reviewedPaper: ReviewedLatexConformanceFixtureV2;
    readonly includeGraph: {
      readonly canonical: LatexGraphConformanceFixtureV2;
      readonly reordered: LatexGraphConformanceFixtureV2;
    };
    readonly ambiguousFigure: AmbiguousFigureConformanceFixtureV2;
    readonly escapedCommands: EscapedCommandsConformanceFixtureV2;
    readonly proseBlocks: ProseBlocksConformanceFixtureV2;
    readonly archiveFailures: readonly LatexArchiveFailureConformanceFixtureV2[];
  };
  readonly pdf: { readonly twoPageNativeText: TwoPagePdfConformanceFixtureV2 };
}

const reviewedMainSource =
  "\\documentclass{article}\r\n" +
  "\\title{Ångström 😀 study}\r\n" +
  "\\author{Ada Lovelace}\r\n" +
  "\\graphicspath{{figures/}}\r\n" +
  "\\begin{document}\r\n" +
  "% \\input{ignored}\r\n" +
  "\\begin{abstract}Résumé 😀.\\end{abstract}\r\n" +
  "\\section{Results}\\label{sec:results}\r\n" +
  "\\input{sections/results}\r\n" +
  "\\bibliography{refs,alternate}\r\n" +
  "\\end{document}\r\n";

const reviewedResultsSource =
  "Evidence \\citep{doe2026} refers to Figure \\ref{fig:plot}.\r\n" +
  "\\begin{figure}\r\n" +
  "\\includegraphics{plot}\r\n" +
  "\\caption{Résumé 😀 plot}\r\n" +
  "\\label{fig:plot}\r\n" +
  "\\end{figure}\r\n" +
  "\\[x + y\\]\r\n" +
  "\\begin{tabular}{cc}A & B \\\\ 1 & 2\\end{tabular}\r\n" +
  "\\begin{lstlisting}[language=TypeScript]\r\n" +
  "const x = 1;\r\n" +
  "\\end{lstlisting}\r\n" +
  "Foot\\footnote{Exact note.}\r\n" +
  "\\begin{mystery}Visible unsupported body.\\end{mystery}\r\n" +
  "\\unknown\r\n";

const reviewedAlternateSource = "\\documentclass{article}\r\n\\begin{document}\r\nAlternate.\r\n\\end{document}\r\n";
const reviewedBibliographySource = "@article{doe2026, title={Evidence}}\r\n";
const reviewedAlternateBibliographySource = "@misc{other, title={Other}}\r\n";
const graphMainSource = "\\documentclass{article}\\begin{document}\\input{part}\\input{missing}\\end{document}";
const graphPartSource = "Part\\input{main}";
const graphUnusedBibliographySource = "@misc{unused, title={Unused}}";
const ambiguousFigureSource = "\\documentclass{article}\\begin{document}\\includegraphics{plot}\\end{document}";
const escapedCommandsSource =
  "\\documentclass{article}\r\n" +
  "\\begin{document}\r\n" +
  "😀 \\cite{active}\r\n" +
  "\\\\cite{inactive}\r\n" +
  "\\\\\\cite{triple}\r\n" +
  "\\\\section{Escaped section}\r\n" +
  "\\section{Active section}\r\n" +
  "% \\cite{commented}\r\n" +
  "\\begin{verbatim}\\cite{literal}\\end{verbatim}\r\n" +
  "\\\\begin{equation}escaped equation\\\\end{equation}\r\n" +
  "\\begin{equation}active equation\\end{equation}\r\n" +
  "\\end{document}\r\n";
const proseBlocksMainSource =
  "\\documentclass{article}\r\n" +
  "\\begin{document}\r\n" +
  "Lead 😀 with \\cite{lead} and \\(x + y\\).\r\n\r\n" +
  "\\section{Methods}\r\n" +
  "First method paragraph.\r\n\r\n" +
  "Second method paragraph.\r\n\r\n" +
  "\\input{part}\r\n" +
  "\\end{document}\r\n";
const proseBlocksPartSource =
  "Inherited Å prose.\r\n\r\n" +
  "\\begin{itemize}\r\n" +
  "\\item First item with \\cite{one}.\r\n" +
  "\\item Second item with \\(z\\).\r\n" +
  "\\end{itemize}\r\n\r\n" +
  "% hidden\r\n" +
  "\\begin{verbatim}\r\n" +
  "literal hidden\r\n" +
  "\\end{verbatim}\r\n";

function zipFixture(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries, { level: 0, mtime: new Date(1980, 0, 1, 0, 0, 0) });
}

function zipSignatureOffset(bytes: Uint8Array, signature: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset <= bytes.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === signature) return offset;
  }
  throw new Error(`Conformance ZIP signature ${signature.toString(16)} was not found`);
}

function patchedZipFixture(edit: (view: DataView, centralOffset: number, endOffset: number) => void): Uint8Array {
  const bytes = zipFixture({
    "main.tex": strToU8("\\documentclass{article}\\begin{document}\\end{document}"),
  }).slice();
  const centralOffset = zipSignatureOffset(bytes, 0x02014b50);
  const endOffset = zipSignatureOffset(bytes, 0x06054b50);
  edit(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), centralOffset, endOffset);
  return bytes;
}

function renamedZipFixture(from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error("Conformance ZIP replacement names must have the same length");
  const bytes = zipFixture({ [from]: strToU8("ignored") }).slice();
  const encodedFrom = strToU8(from);
  const encodedTo = strToU8(to);
  let replacements = 0;
  for (let offset = 0; offset <= bytes.length - encodedFrom.length; offset += 1) {
    if (!encodedFrom.every((byte, index) => bytes[offset + index] === byte)) continue;
    bytes.set(encodedTo, offset);
    replacements += 1;
    offset += encodedFrom.length - 1;
  }
  if (replacements !== 2) throw new Error("Conformance ZIP filename replacement must update local and central headers");
  return bytes;
}

function twoPagePdfBytes(): Uint8Array {
  const texts = ["First page keeps its reading position.", "Second page verifies restored PDF context."];
  const pageIds = [3, 4];
  const fontId = 5;
  const contentIds = [6, 7];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count 2 >>`,
    ...contentIds.map(
      (contentId) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...texts.map((text) => {
      const content = `BT /F1 18 Tf 22 TL 72 700 Td (${text}) Tj ET`;
      return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    }),
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(source.length);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const crossReferenceOffset = source.length;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF\n`;
  return strToU8(source);
}

export function createReviewedLatexConformanceFixtureV2(): ReviewedLatexConformanceFixtureV2 {
  return {
    schemaVersion: paperImportConformanceCorpusVersion,
    id: "reviewed-latex-paper-v1",
    archive: zipFixture({
      "sections/results.tex": strToU8(reviewedResultsSource),
      "figures/plot.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "alternate.bib": strToU8(reviewedAlternateBibliographySource),
      "main.tex": strToU8(reviewedMainSource),
      "refs.bib": strToU8(reviewedBibliographySource),
      "alternate.tex": strToU8(reviewedAlternateSource),
    }),
    sourceByPath: {
      "alternate.bib": reviewedAlternateBibliographySource,
      "alternate.tex": reviewedAlternateSource,
      "main.tex": reviewedMainSource,
      "refs.bib": reviewedBibliographySource,
      "sections/results.tex": reviewedResultsSource,
    },
    selection: { rootPath: "main.tex", bibliographyPath: "refs.bib" },
    expected: reviewedExpected,
  };
}

export function createLatexGraphConformanceFixtureV2(order: LatexGraphConformanceOrderV2): LatexGraphConformanceFixtureV2 {
  const entries = [
    ["main.tex", strToU8(graphMainSource)],
    ["part.tex", strToU8(graphPartSource)],
    ["unused.bib", strToU8(graphUnusedBibliographySource)],
  ] as const;
  return {
    schemaVersion: paperImportConformanceCorpusVersion,
    id: "latex-include-graph-v1",
    archive: zipFixture(Object.fromEntries(order === "canonical" ? entries : [...entries].reverse())),
    selection: { rootPath: "main.tex" },
    expected: graphExpected,
  };
}

export function createAmbiguousFigureConformanceFixtureV2(): AmbiguousFigureConformanceFixtureV2 {
  return {
    schemaVersion: paperImportConformanceCorpusVersion,
    id: "latex-ambiguous-figure-v1",
    archive: zipFixture({
      "plot.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      "main.tex": strToU8(ambiguousFigureSource),
      "plot.jpg": new Uint8Array([0xff, 0xd8, 0xff]),
    }),
    selection: { rootPath: "main.tex" },
    expected: ambiguousFigureExpected,
  };
}

export function createEscapedCommandsConformanceFixtureV2(): EscapedCommandsConformanceFixtureV2 {
  return {
    schemaVersion: paperImportConformanceCorpusVersion,
    id: "latex-escaped-commands-v1",
    archive: zipFixture({ "main.tex": strToU8(escapedCommandsSource) }),
    sourceByPath: { "main.tex": escapedCommandsSource },
    selection: { rootPath: "main.tex" },
    expected: escapedCommandsExpected,
  };
}

export function createProseBlocksConformanceFixtureV2(): ProseBlocksConformanceFixtureV2 {
  return {
    schemaVersion: paperImportConformanceCorpusVersion,
    id: "latex-prose-blocks-v1",
    archive: zipFixture({ "main.tex": strToU8(proseBlocksMainSource), "part.tex": strToU8(proseBlocksPartSource) }),
    sourceByPath: { "main.tex": proseBlocksMainSource, "part.tex": proseBlocksPartSource },
    selection: { rootPath: "main.tex" },
    expected: proseBlocksExpected,
  };
}

export function createLatexArchiveFailureConformanceFixturesV2(): readonly LatexArchiveFailureConformanceFixtureV2[] {
  const fixture = (
    id: LatexArchiveFailureConformanceIdV2,
    archive: Uint8Array,
    code: string,
    message: string,
  ): LatexArchiveFailureConformanceFixtureV2 => ({
    schemaVersion: paperImportConformanceCorpusVersion,
    id,
    archive,
    expected: { code, message },
  });
  return [
    fixture("empty-archive", new Uint8Array(), "archive-size", "LaTeX archive must be between 1 byte and 20 MiB"),
    fixture("malformed-archive", strToU8("not a zip"), "archive-format", "Invalid ZIP archive"),
    fixture("traversal-path", zipFixture({ "../main.tex": strToU8("unsafe") }), "archive-path", "Unsafe archive path: ../main.tex"),
    fixture("absolute-path", zipFixture({ "/main.tex": strToU8("unsafe") }), "archive-path", "Unsafe archive path: /main.tex"),
    fixture("windows-absolute-path", zipFixture({ "C:/main.tex": strToU8("unsafe") }), "archive-path", "Unsafe archive path: C:/main.tex"),
    fixture(
      "backslash-path",
      zipFixture({ "nested\\main.tex": strToU8("unsafe") }),
      "archive-path",
      "Unsafe archive path: nested\\main.tex",
    ),
    fixture("prototype-poisoning-path", renamedZipFixture("safe-name", "__proto__"), "archive-path", "Unsafe archive path: __proto__"),
    fixture(
      "case-folded-duplicate",
      zipFixture({ "MAIN.tex": strToU8("first"), "main.tex": strToU8("second") }),
      "archive-path",
      "Duplicate archive path: main.tex",
    ),
    fixture(
      "symbolic-link",
      patchedZipFixture((view, centralOffset) => {
        view.setUint16(centralOffset + 4, 3 << 8, true);
        view.setUint32(centralOffset + 38, 0o120000 << 16, true);
      }),
      "archive-symlink",
      "Symbolic links are not supported: main.tex",
    ),
    fixture(
      "encrypted-entry",
      patchedZipFixture((view, centralOffset) => view.setUint16(centralOffset + 8, 1, true)),
      "archive-encrypted",
      "Encrypted ZIP entries are not supported",
    ),
    fixture(
      "zip64-archive",
      patchedZipFixture((view, _centralOffset, endOffset) => {
        view.setUint16(endOffset + 8, 0xffff, true);
        view.setUint16(endOffset + 10, 0xffff, true);
      }),
      "archive-format",
      "ZIP64 archives are not supported",
    ),
    fixture(
      "expansion-ratio",
      patchedZipFixture((view, centralOffset) => {
        view.setUint32(centralOffset + 20, 0, true);
        view.setUint32(centralOffset + 24, 1024 * 1024, true);
      }),
      "archive-expanded-size",
      "ZIP entry has an excessive expansion ratio: main.tex",
    ),
    fixture(
      "invalid-utf8",
      zipFixture({ "main.tex": new Uint8Array([0xff, 0xfe]) }),
      "archive-text-encoding",
      "LaTeX text file must be UTF-8: main.tex",
    ),
    fixture(
      "oversized-source",
      zipFixture({ "main.tex": new Uint8Array(2 * 1024 * 1024 + 1) }),
      "archive-text-size",
      "LaTeX text file exceeds 2 MiB: main.tex",
    ),
  ];
}

export function createTwoPagePdfConformanceFixtureV2(): TwoPagePdfConformanceFixtureV2 {
  return {
    schemaVersion: paperImportConformanceCorpusVersion,
    id: "two-page-native-text-pdf-v1",
    bytes: twoPagePdfBytes(),
    limits: {
      maximumInputBytes: 4096,
      maximumPages: 10,
      maximumPageTextCodeUnits: 100,
      maximumDocumentTextCodeUnits: 500,
    },
    expected: twoPagePdfExpected,
  };
}

export function createPaperImportConformanceCorpusV2(): PaperImportConformanceCorpusV2 {
  return {
    schemaVersion: paperImportConformanceCorpusVersion,
    latex: {
      reviewedPaper: createReviewedLatexConformanceFixtureV2(),
      includeGraph: {
        canonical: createLatexGraphConformanceFixtureV2("canonical"),
        reordered: createLatexGraphConformanceFixtureV2("reordered"),
      },
      ambiguousFigure: createAmbiguousFigureConformanceFixtureV2(),
      escapedCommands: createEscapedCommandsConformanceFixtureV2(),
      proseBlocks: createProseBlocksConformanceFixtureV2(),
      archiveFailures: createLatexArchiveFailureConformanceFixturesV2(),
    },
    pdf: { twoPageNativeText: createTwoPagePdfConformanceFixtureV2() },
  };
}
