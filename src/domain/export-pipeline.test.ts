import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { archivalSourceBundle, latexArchive, renderExportPdf } from "../api/export-artifacts";
import {
  assertExportable,
  buildExportBundle,
  countPublicationWords,
  ExportPipelineError,
  publicationWordStatistics,
} from "./export-pipeline";
import { composeProject, type ProjectFile } from "./project-files";
import { isPublicationWordStatistics } from "./publication-statistics";

const createdAt = "2026-07-12T00:00:00.000Z";

describe("source-mapped export pipeline", () => {
  it("composes main.md once, scopes citations, and maps generated LaTeX to authored files", () => {
    const files = [
      file("main", "main.md", "# Study\nIntro words.\n::include[chapters/method.md]\n:cite[Used, used]\n"),
      file("method", "chapters/method.md", "---\ntitle: Method\n---\n## Method\nThree more words.\n"),
    ];
    const bundle = buildExportBundle({
      title: "Mapped study",
      files,
      entryFileId: "main",
      bibliography: "@article{used,\n  title = {Included}\n}\n\n@article{unused,\n  title = {Excluded}\n}\n",
    });

    expect(bundle.intermediate.markdown).toContain("## Method\nThree more words.");
    expect(bundle.intermediate.markdown).not.toContain("title: Method");
    expect(bundle.intermediate.citationKeys).toEqual(["Used"]);
    expect(bundle.bibliography).toContain("@article{used");
    expect(bundle.bibliography).not.toContain("unused");
    expect(bundle.mainTex).toContain("\\section{Study}");
    expect(bundle.mainTex).toContain("\\subsection{Method}");
    expect(bundle.mainTex).toContain("\\citep{Used,used}");
    expect(bundle.intermediate.statistics.totalWords).toBe(7);
    expect(bundle.intermediate.statistics.files).toEqual([
      { fileId: "method", path: "chapters/method.md", words: 4 },
      { fileId: "main", path: "main.md", words: 3 },
    ]);
    expect(bundle.intermediate.statistics.headings.map(({ heading, words }) => ({ heading, words }))).toEqual([
      { heading: "Study", words: 3 },
      { heading: "Method", words: 4 },
    ]);
    expect(bundle.generatedSourceMap.find((span) => span.path === "chapters/method.md")).toMatchObject({
      fileId: "method",
      line: 4,
      from: 22,
      to: 31,
      includeChain: ["main", "method"],
    });
  });

  it("returns authored composition diagnostics and refuses invalid artifacts", () => {
    const bundle = buildExportBundle({
      title: "Broken",
      files: [file("main", "main.md", "Before\n::include[missing.md]\nAfter")],
      entryFileId: "main",
      bibliography: "",
    });

    expect(bundle.intermediate.diagnostics).toEqual([
      expect.objectContaining({ code: "missing-file", path: "main.md", line: 2, severity: "error", includeChain: ["main"] }),
    ]);
    const nested = buildExportBundle({
      title: "Nested diagnostic",
      files: [file("main", "main.md", "::include[chapter.md]\n"), file("chapter", "chapter.md", "Before\n::include[missing.md]\n")],
      entryFileId: "main",
      bibliography: "",
    });
    expect(nested.intermediate.diagnostics).toEqual([
      expect.objectContaining({ code: "missing-file", fileId: "chapter", path: "chapter.md", line: 2 }),
    ]);
    expect(() => assertExportable(bundle.intermediate)).toThrow(ExportPipelineError);
    try {
      assertExportable(bundle.intermediate);
    } catch (error) {
      expect(error).toMatchObject({
        name: "ExportPipelineError",
        message: "Project composition must be fixed before export",
        diagnostics: bundle.intermediate.diagnostics,
      });
    }
    expect(() =>
      assertExportable({
        ...bundle.intermediate,
        diagnostics: bundle.intermediate.diagnostics.map((diagnostic) => ({ ...diagnostic, severity: "warning" })),
      }),
    ).not.toThrow();
  });

  it("refuses publication artifacts for cyclic composition", () => {
    const bundle = buildExportBundle({
      title: "Cyclic",
      files: [
        file("main", "main.md", "Before\n::include[chapter.md]\nAfter\n"),
        file("chapter", "chapter.md", "Chapter\n::include[main.md]\n"),
      ],
      entryFileId: "main",
      bibliography: "",
    });

    expect(bundle.intermediate.markdown).toBe("Before\nChapter\nAfter\n");
    expect(bundle.intermediate.diagnostics).toEqual([
      expect.objectContaining({
        code: "cycle",
        fileId: "chapter",
        path: "chapter.md",
        line: 2,
        severity: "error",
        includeChain: ["main", "chapter"],
      }),
    ]);
    expect(() => assertExportable(bundle.intermediate)).toThrow("Project composition must be fixed before export");
  });

  it("materializes the complete maintained LaTeX vocabulary and pinned manifest", () => {
    const source = [
      "prefix # not-a-heading",
      "#  Spaced heading",
      "# Top {#top}",
      "## Second",
      "### Third",
      "#### Fourth",
      "##### Fifth",
      "###### Sixth",
      "- Bullet **strong**",
      "-  Double-space bullet",
      "prefix - not-a-bullet",
      "12) Numbered *emphasis*",
      "12)  Double-space number",
      "prefix 12) not-a-number",
      "",
      "```text",
      "Literal fence",
      "```",
      "prefix ``` not-a-fence",
      "Special & # % _ ~ ^ \\ with $x_1$ and `code_1`, [site](https://example.test/a%20b), :cite[valid, bad key].",
      "A [plain link](http://example.test/path) and invalid-only :cite[bad key].",
    ].join("\n");
    const bundle = buildExportBundle({
      title: "  Custom & title  ",
      files: [file("main", "main.md", source)],
      entryFileId: "main",
      bibliography: "@article{valid,\n title = {Used}\n}\n@article{unused,\n title = {Not used}\n}\n",
    });

    expect(bundle.intermediate.title).toBe("Custom & title");
    expect(bundle.intermediate.citationKeys).toEqual(["valid"]);
    expect(bundle.manifest).toEqual({
      schemaVersion: "kirjolab-export-v1",
      templateVersion: "kirjolab-article-v3",
      pdfEngine: "kirjolab-pdf-lib-v2@1.17.1",
      zipEngine: "fflate@0.8.3",
      entrypoint: "main.tex",
      canonicalSource: "main.md",
      citationKeys: ["valid"],
      wordCount: bundle.intermediate.statistics.totalWords,
      publicationProfile: { citationStyle: "apa", locale: "en-US", submissionTemplate: "article", paperSize: "a4" },
    });
    for (const line of [
      "% Generated by Kirjolab; canonical source remains main.md.",
      "\\documentclass[11pt,a4paper]{article}",
      "\\usepackage[T1]{fontenc}",
      "\\usepackage[utf8]{inputenc}",
      "\\usepackage{lmodern}",
      "\\usepackage{hyperref}",
      "\\usepackage{natbib}",
      "\\usepackage{graphicx}",
      "\\usepackage{booktabs}",
      "\\title{Custom \\& title}",
      "\\date{}",
      "\\begin{document}",
      "\\section{Spaced heading}",
      "\\section{Top}",
      "\\subsection{Second}",
      "\\subsubsection{Third}",
      "\\paragraph{Fourth}",
      "\\subparagraph{Fifth}",
      "\\subparagraph{Sixth}",
      "\\begin{itemize}",
      "\\item Bullet \\textbf{strong}",
      "\\item Double-space bullet",
      "\\end{itemize}",
      "\\begin{enumerate}",
      "\\item Numbered \\emph{emphasis}",
      "\\item Double-space number",
      "\\end{enumerate}",
      "% fenced code boundary",
      "\\bibliographystyle{apalike}",
      "\\bibliography{bibliography}",
      "\\end{document}",
    ]) {
      expect(bundle.mainTex, line).toContain(line);
    }
    expect(bundle.mainTex).toContain("prefix \\# not-a-heading");
    expect(bundle.mainTex).toContain("prefix - not-a-bullet");
    expect(bundle.mainTex).toContain("prefix 12) not-a-number");
    expect(bundle.mainTex).toContain("prefix ``` not-a-fence");
    expect(bundle.mainTex).toContain(
      "Special \\& \\# \\% \\_ \\textasciitilde{} \\textasciicircum{} \\textbackslash{} with $x_1$ and \\texttt{code\\_1}, \\href{https://example.test/a\\%20b}{site}, \\citep{valid}.",
    );
    expect(bundle.mainTex).toContain("A \\href{http://example.test/path}{plain link} and invalid-only .");
    expect(bundle.mainTex).not.toContain("bad key");
    expect(bundle.mainTex.split("\n").slice(0, 16)).toEqual([
      "% Generated by Kirjolab; canonical source remains main.md.",
      "\\documentclass[11pt,a4paper]{article}",
      "\\usepackage[T1]{fontenc}",
      "\\usepackage[utf8]{inputenc}",
      "\\usepackage{lmodern}",
      "\\usepackage{hyperref}",
      "\\usepackage{natbib}",
      "\\usepackage{graphicx}",
      "\\usepackage{booktabs}",
      "\\usepackage[margin=1in]{geometry}",
      "\\usepackage{setspace}",
      "\\singlespacing",
      "\\title{Custom \\& title}",
      "\\author{}",
      "\\date{}",
      "\\begin{document}",
    ]);
    expect(bundle.mainTex).not.toContain("\\maketitle");
    expect(bundle.mainTex.endsWith("\\end{document}\n")).toBe(true);
    expect(bundle.generatedSourceMap).toHaveLength(source.split("\n").length);
    expect(bundle.generatedSourceMap[0]).toMatchObject({ generatedLineStart: 17, generatedLineEnd: 18, from: 0, line: 1 });
    expect(bundle.generatedSourceMap.at(-1)).toMatchObject({
      path: "main.md",
      line: source.split("\n").length,
      from: source.lastIndexOf("A [plain link]"),
      to: source.length,
      includeChain: ["main"],
    });
  });

  it("uses an explicit fallback for an empty untitled project without inventing bibliography", () => {
    const bundle = buildExportBundle({ title: "   ", files: [file("main", "main.md", "")], entryFileId: "main", bibliography: "" });

    expect(bundle.intermediate).toMatchObject({ title: "Untitled project", markdown: "", citationKeys: [], bibliography: "" });
    expect(bundle.mainTex).toContain("\\title{Untitled project}");
    expect(bundle.mainTex).not.toContain("\\bibliography{");
    expect(bundle.generatedSourceMap).toEqual([
      {
        target: "main.tex",
        generatedLineStart: 17,
        generatedLineEnd: 17,
        fileId: "",
        path: "main.md",
        from: 0,
        to: 0,
        line: 1,
        includeChain: [],
      },
    ]);
  });

  it("uses a stable prose-only word-counting rule for composed files and headings", () => {
    const source =
      "# Heading words\nVisible [link label](https://example.test/path) :cite[key].\n`ignored code` $x + y$\n```ts\nignored block\n```\n";
    const files = [file("main", "main.md", source)];
    const composition = composeProject(files, "main");

    expect(countPublicationWords(source)).toBe(5);
    const statistics = publicationWordStatistics(composition, files);
    expect(statistics).toMatchObject({
      countingRule: "kirjolab-prose-v1",
      totalWords: 5,
      files: [{ fileId: "main", path: "main.md", words: 5 }],
      headings: [{ heading: "Heading words", depth: 1, words: 5 }],
    });
    expect(isPublicationWordStatistics(statistics)).toBe(true);
    expect(isPublicationWordStatistics({ ...statistics, totalWords: -1 })).toBe(false);
    expect(isPublicationWordStatistics({ ...statistics, files: [{ path: "main.md", words: 5 }] })).toBe(false);
    expect(isPublicationWordStatistics({ ...statistics, headings: [{ ...statistics.headings[0], includeChain: [1] }] })).toBe(false);
  });

  it("counts visible Unicode prose across every excluded Markdown form without joining adjacent words", () => {
    for (const [label, source, expected] of [
      ["front matter", "--- \r\ntitle: Hidden words\r\nkind: article\r\n--- \r\nVisible words", 2],
      ["anchored front matter", "Prelude\n---\ntitle: visible metadata\n---\nTail", 5],
      ["fenced code", "Before```ts\nhidden block words\n```After", 2],
      ["inline code", "Before`hidden code`After", 2],
      ["block equation", "Before$$\nx + hidden = y\n$$After", 2],
      ["inline equation", "Before$x + hidden$After", 2],
      ["citation", "Before:cite[hiddenKey]After", 2],
      ["image", 'Before![descriptive alt text](image-long.png "Long image title")After', 5],
      ["empty image", "Before![](image.png)After", 2],
      ["link", 'Before[visible link label](https://example.test/long-path "Long link title")After', 5],
      ["autolinks", "Before<http://example.test/long><https://example.test/long>After", 2],
      ["html", 'Before<section data-name="hidden words">Middle</section>After', 3],
      ["heading id", "Before{#long-hidden-id}After", 2],
      ["word boundaries", "can't researcher’s state-of-the-art 123 naïve", 5],
    ] as const) {
      expect(countPublicationWords(source), label).toBe(expected);
    }
  });

  it("maps heading statistics to exact authored ranges and rejects malformed public statistics", () => {
    const source = "Prelude\r\n#  *First heading* {#first}\r\nOne word\r\nnot # heading\r\n## `Second`\r\nTwo";
    const files = [file("main", "main.md", source)];
    const statistics = publicationWordStatistics(composeProject(files, "main"), files);
    const firstOffset = source.indexOf("#  *First");
    const secondOffset = source.indexOf("## `Second`");

    expect(statistics.headings).toEqual([
      {
        fileId: "main",
        path: "main.md",
        from: firstOffset,
        to: firstOffset + "#  *First heading* {#first}".length,
        line: 2,
        includeChain: ["main"],
        depth: 1,
        heading: "First heading",
        words: 6,
      },
      {
        fileId: "main",
        path: "main.md",
        from: secondOffset,
        to: secondOffset + "## `Second`".length,
        line: 5,
        includeChain: ["main"],
        depth: 2,
        heading: "Second",
        words: 1,
      },
    ]);

    const validFile = statistics.files[0]!;
    const validHeading = statistics.headings[0]!;
    for (const invalid of [
      null,
      [],
      { ...statistics, countingRule: "other" },
      { ...statistics, totalWords: 1.5 },
      { ...statistics, files: null },
      { ...statistics, files: [validFile, { ...validFile, words: -1 }] },
      { ...statistics, files: [{ ...validFile, fileId: null }] },
      { ...statistics, files: [{ ...validFile, path: null }] },
      { ...statistics, headings: null },
      { ...statistics, headings: [validHeading, { ...validHeading, heading: null }] },
      { ...statistics, headings: [{ ...validHeading, from: -1 }] },
      { ...statistics, headings: [{ ...validHeading, to: 1.5 }] },
      { ...statistics, headings: [{ ...validHeading, line: null }] },
      { ...statistics, headings: [{ ...validHeading, depth: -1 }] },
      { ...statistics, headings: [{ ...validHeading, words: "2" }] },
      { ...statistics, headings: [{ ...validHeading, path: null }] },
      { ...statistics, headings: [{ ...validHeading, fileId: null }] },
      { ...statistics, headings: [{ ...validHeading, includeChain: null }] },
      { ...statistics, headings: [{ ...validHeading, includeChain: ["main", 2] }] },
    ]) {
      expect(isPublicationWordStatistics(invalid), JSON.stringify(invalid)).toBe(false);
    }
  });

  it("creates byte-reproducible LaTeX and archival ZIPs with pinned manifests", () => {
    const files = [file("main", "main.md", "# Reproducible\nText")];
    const bundle = buildExportBundle({ title: "Archive", files, entryFileId: "main", bibliography: "" });

    const first = latexArchive(bundle);
    const second = latexArchive(bundle);
    expect(first).toEqual(second);
    const latexFiles = unzipSync(first);
    expect(Object.keys(latexFiles).sort()).toEqual([
      "README.txt",
      "bibliography.bib",
      "export-manifest.json",
      "intermediate.json",
      "main.tex",
      "source-map.json",
    ]);
    expect(strFromU8(latexFiles["export-manifest.json"] ?? new Uint8Array())).toContain('"pdfEngine": "kirjolab-pdf-lib-v2@1.17.1"');

    const archive = archivalSourceBundle(bundle, files, { title: "Archive" }, { "../unsafe/paper.pdf": new Uint8Array([1, 2, 3]) });
    const archiveFiles = unzipSync(archive);
    expect(strFromU8(archiveFiles["project/main.md"] ?? new Uint8Array())).toBe("# Reproducible\nText");
    expect(archiveFiles["project-assets/unsafe/paper.pdf"]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("materializes the selected citation profile without rewriting Markdown", () => {
    const ieee = buildExportBundle({
      title: "Numeric paper",
      files: [file("main", "main.md", "Evidence :cite[valid].")],
      entryFileId: "main",
      bibliography: "@article{valid, title={Evidence}, year={2026}}",
      publicationProfile: { citationStyle: "ieee", locale: "en-GB", submissionTemplate: "anonymous-review", paperSize: "letter" },
    });
    expect(ieee.intermediate.markdown).toBe("Evidence :cite[valid].");
    expect(ieee.mainTex).toContain("\\cite{valid}");
    expect(ieee.mainTex).toContain("\\bibliographystyle{unsrt}");
    expect(ieee.mainTex).toContain("\\documentclass[11pt,letterpaper]{article}");
    expect(ieee.mainTex).toContain("\\usepackage[margin=1.25in]{geometry}");
    expect(ieee.mainTex).toContain("\\doublespacing");
    expect(ieee.mainTex).toContain("\\author{Anonymous}");
    expect(ieee.mainTex).not.toContain("\\begin{titlepage}");
    expect(ieee.mainTex).not.toContain("\\maketitle");
    expect(ieee.manifest.publicationProfile).toEqual({
      citationStyle: "ieee",
      locale: "en-GB",
      submissionTemplate: "anonymous-review",
      paperSize: "letter",
    });
  });

  it("renders the same materialized bundle through the pinned bounded PDF engine", async () => {
    const bundle = buildExportBundle({
      title: "PDF study",
      files: [
        file(
          "main",
          "main.md",
          [
            '::alias[Legacy result]{target="sec:legacy" slug="result"}',
            "# Result {#result}",
            "::anchor[Table one]{target=table:one}",
            'See :ref[sec:legacy] and :ref[custom table]{target="table:one"} before :cite[source]{mode=textual prefix="See " locator="p. 4" suffix="."}',
            "",
            "- One finding",
          ].join("\n"),
        ),
      ],
      entryFileId: "main",
      bibliography: "@article{source,\n author = {Source, Sam},\n title = {Source title},\n year = {2026}\n}\n",
    });

    expect(bundle.mainTex).toContain("See Result and custom table before See \\citet{source}, p. 4.");
    expect(bundle.mainTex.match(/% scholarly reference declaration/gu)).toHaveLength(2);
    for (const leaked of ["::alias", "::anchor", ":ref[", "{mode=", "locator=", "prefix=", "suffix="]) {
      expect(bundle.mainTex, leaked).not.toContain(leaked);
    }

    const first = await renderExportPdf(bundle);
    const second = await renderExportPdf(bundle);
    expect(first).toEqual(second);
    expect(new TextDecoder().decode(first.slice(0, 8))).toContain("%PDF-");
    const document = await PDFDocument.load(first, { updateMetadata: false });
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe("PDF study");
    expect(document.getProducer()).toBe("kirjolab-pdf-lib-v2@1.17.1");
    const loadingTask = getDocument({ data: first });
    const pdf = await loadingTask.promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ");
    await loadingTask.destroy();
    expect(text.trim().startsWith("Result")).toBe(true);
    expect(text).not.toContain("PDF study");
    expect(text).toContain("See Result and custom table before See Source (2026), p. 4.");
    for (const leaked of ["::alias", "::anchor", ":ref[", "{mode=", "locator=", "prefix=", "suffix="]) {
      expect(text, leaked).not.toContain(leaked);
    }

    const review = buildExportBundle({
      title: "Review copy",
      files: [file("main", "main.md", "A double-spaced anonymous review paragraph.")],
      entryFileId: "main",
      bibliography: "",
      publicationProfile: {
        citationStyle: "apa",
        locale: "en-US",
        submissionTemplate: "anonymous-review",
        paperSize: "letter",
      },
    });
    const reviewDocument = await PDFDocument.load(await renderExportPdf(review), { updateMetadata: false });
    expect(reviewDocument.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  it("projects a composed publication conformance fixture into structured LaTeX and PDF", async () => {
    const source = [
      "| Measure | Value | Meaning |",
      "| :--- | ---: | :---: |",
      "| **Effect** | `12` | A \\| B |",
      "",
      "Evidence[^method] and repeated evidence[^method] :cite[source].",
      "[^method]: Note with *emphasis*.",
      "  Continued note.",
      "",
      "- Listed result",
      "Math $x_1$.",
      "```md",
      "| Literal | table |",
      "| --- | --- |",
      "[^literal]: literal note",
      "```",
    ].join("\n");
    const bundle = buildExportBundle({
      title: "Conformance study",
      files: [
        file("main", "main.md", "# Findings {#findings}\nSee :ref[findings].\n::include[results.md]"),
        file("results", "results.md", source),
      ],
      entryFileId: "main",
      bibliography: "@article{source, author={Source, Sam}, title={Evidence}, year={2026}}",
    });

    expect(bundle.intermediate.markdown).toContain("| :--- | ---: | :---: |");
    expect(bundle.intermediate.markdown).toContain("[^method]: Note with *emphasis*.");
    for (const expected of [
      "\\begin{tabular}{lrc}",
      "\\toprule",
      "\\textbf{Measure} & \\textbf{Value} & \\textbf{Meaning}",
      "\\textbf{Effect} & \\texttt{12} & A | B",
      "\\footnote{Note with \\emph{emphasis}. Continued note.}",
      "\\footnotemark[1]",
      "\\citep{source}",
      "See Findings.",
      "Math $x_1$.",
      "| Literal | table |",
      "[\\textasciicircum{}literal]: literal note",
    ]) {
      expect(bundle.mainTex, expected).toContain(expected);
    }
    expect(bundle.mainTex).not.toContain("| :--- | ---: | :---: |");
    expect(bundle.mainTex).not.toContain("[^method]:");
    expect(bundle.generatedSourceMap).toHaveLength(bundle.intermediate.markdown.split("\n").length);

    const bytes = await renderExportPdf(bundle);
    const loadingTask = getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ");
    await loadingTask.destroy();
    for (const expected of [
      "Measure",
      "Value",
      "Meaning",
      "Effect",
      "12",
      "A | B",
      "Evidence[1] and repeated evidence[1] (Source, 2026).",
      "[1] Note with emphasis. Continued note.",
      "Listed result",
      "Math x1.",
      "| Literal | table |",
      "[^literal]: literal note",
      "See Findings.",
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(text).not.toContain("| :--- | ---: | :---: |");
    expect(text).not.toContain("[^method]:");
  });

  it("keeps scholarly-looking text literal inside fenced code", () => {
    const bundle = buildExportBundle({
      title: "Literal directives",
      files: [file("main", "main.md", '```text\n:ref[literal]{target="section"}\n::anchor[Literal]{target=literal}\n```')],
      entryFileId: "main",
      bibliography: "",
    });

    expect(bundle.mainTex).toContain(':ref[literal]\\{target="section"\\}');
    expect(bundle.mainTex).toContain("::anchor[Literal]\\{target=literal\\}");
  });
});

function file(id: string, path: string, content: string): ProjectFile {
  return { id, path, content, mediaType: "text/markdown", createdAt, updatedAt: createdAt };
}
