import { describe, expect, it } from "vitest";
import {
  composeProject,
  inboundProjectIncludes,
  isInertSvgImage,
  normalizeProjectPath,
  previewProjectFile,
  projectFileCollaborationTextName,
  projectUsesCitationAlias,
  relativeProjectPath,
  resolveProjectPath,
  rewriteProjectCitationAlias,
  rewriteInboundProjectIncludes,
  rewriteProjectIncludesForMoves,
  rewriteProjectImageReferencesForMoves,
  resolveProjectEntryFileId,
  type ProjectFile,
} from "./project-files";

const timestamp = "2026-07-11T10:00:00.000Z";

function file(id: string, path: string, content: string): ProjectFile {
  return { id, path, content, mediaType: "text/markdown", createdAt: timestamp, updatedAt: timestamp };
}

describe("project composition", () => {
  it("accepts inert SVG figures and rejects active or external content", () => {
    const svg = (source: string): Uint8Array => new TextEncoder().encode(source);
    expect(
      isInertSvgImage(
        svg(
          `<?xml version="1.0"?>
<!-- publication figure -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <defs><linearGradient id="fade"><stop offset="0" stop-color="#fff"/></linearGradient></defs>
  <rect width="10" height="10" fill="url(#fade)"/>
  <use href="#shape"/>
</svg>`,
        ),
      ),
    ).toBe(true);
    expect(isInertSvgImage(svg(`<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo="/></svg>`))).toBe(
      true,
    );
    expect(isInertSvgImage(new Uint8Array([0xff, 0xfe, 0x00]))).toBe(false);
    expect(isInertSvgImage(svg("not svg"))).toBe(false);
    for (const source of [
      `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>`,
      `<svg><script>alert(1)</script></svg>`,
      `<svg><foreignObject><iframe src="https://example.test"/></foreignObject></svg>`,
      `<svg onload="alert(1)"></svg>`,
      `<svg><style>@import "https://example.test/style.css";</style></svg>`,
      `<svg><image href="https://example.test/pixel.png"/></svg>`,
      `<svg><rect style="fill: url(https://example.test/pixel.png)"/></svg>`,
      `<svg><?xml-stylesheet href="https://example.test/style.css"?></svg>`,
      `<svg><image href="data:image/svg+xml;base64,PHN2Zz4="/></svg>`,
    ]) {
      expect(isInertSvgImage(svg(source)), source).toBe(false);
    }
  });

  it("recursively composes relative includes while retaining source provenance", () => {
    const files = [
      file("main", "main.md", "---\ntitle: Study\n---\n# Study\n\n::include[chapters/01_intro.md]\n"),
      file("intro", "chapters/01_intro.md", "---\ndraft: true\n---\n## Intro\n\n::include[../figures/result.md]\n"),
      file("figure", "figures/result.md", "![Result](result.png)\n"),
    ];

    const result = composeProject(files, "main");

    expect(result.content).toBe("---\ntitle: Study\n---\n# Study\n\n## Intro\n\n![Result](result.png)\n");
    expect(result.diagnostics).toEqual([]);
    expect(result.dependencies).toEqual({ main: ["intro"], intro: ["figure"] });
    expect(result.sourceMap.map(({ fileId, includeChain }) => ({ fileId, includeChain }))).toEqual([
      { fileId: "main", includeChain: ["main"] },
      { fileId: "intro", includeChain: ["main", "intro"] },
      { fileId: "figure", includeChain: ["main", "intro", "figure"] },
    ]);
  });

  it("previews main as the composition and a supporting file in isolation", () => {
    const files = [
      file("main", "main.md", "Root\n::include[sections/method.md]\n"),
      file("method", "sections/method.md", "## Method\n\n::include[nested.md]\n"),
      file("nested", "sections/nested.md", "Nested detail\n"),
    ];

    expect(previewProjectFile(files, "main", "main")).toMatchObject({
      mode: "composed",
      fileId: "main",
      path: "main.md",
      content: "Root\n## Method\n\nNested detail\n",
    });
    expect(previewProjectFile(files, "main", null).mode).toBe("composed");
    expect(previewProjectFile(files, "main", "missing").mode).toBe("composed");

    const isolated = previewProjectFile(files, "main", "method");
    expect(isolated).toEqual({
      mode: "isolated",
      fileId: "method",
      path: "sections/method.md",
      content: "## Method\n\n::include[nested.md]\n",
      sourceMap: [
        {
          outputStart: 0,
          outputEnd: 32,
          fileId: "method",
          path: "sections/method.md",
          sourceStart: 0,
          sourceEnd: 32,
          includeChain: ["method"],
        },
      ],
      diagnostics: [],
      dependencies: {},
    });
    expect(() => previewProjectFile([], "main", null)).toThrow("entry file does not exist");
  });

  it("resolves and composes a persisted entry without requiring main.md", () => {
    const files = [file("second", "02_chapter.md", "Second\n"), file("first", "00_introduction.md", "Intro\n::include[02_chapter.md]\n")];

    expect(resolveProjectEntryFileId(files)).toBe("first");
    expect(resolveProjectEntryFileId([...files, file("main", "main.md", "Main\n")])).toBe("main");
    expect(resolveProjectEntryFileId(files, "second")).toBe("second");
    expect(() => resolveProjectEntryFileId(files, "missing")).toThrow("selected project entry file does not exist");
    expect(() => resolveProjectEntryFileId([])).toThrow("at least one Markdown file");
    expect(composeProject(files, "first").content).toBe("Intro\nSecond\n");
  });

  it("retains collaboration text identity when the entry changes", () => {
    expect(projectFileCollaborationTextName(file("entry", "chapter.md", ""), "entry")).toBe("source");
    expect(
      projectFileCollaborationTextName({ ...file("chapter", "chapter.md", ""), collaborationTextName: "file:chapter" }, "chapter"),
    ).toBe("file:chapter");
  });

  it("renames only exact project-local citation aliases", () => {
    expect(rewriteProjectCitationAlias('See :cite[doe2026, doe2020]{locator="p. 2"}.', "doe2026", "doeStudy")).toBe(
      'See :cite[doeStudy, doe2020]{locator="p. 2"}.',
    );
    expect(rewriteProjectCitationAlias("See :cite[doe20260].", "doe2026", "doeStudy")).toBe("See :cite[doe20260].");
    expect(rewriteProjectCitationAlias(":cite[doe2026]\n:cite[other, doe2026]\n", "doe2026", "renamed")).toBe(
      ":cite[renamed]\n:cite[other, renamed]\n",
    );
    expect(rewriteProjectCitationAlias(":citet[doe2026] :citep[doe2026]", "doe2026", "renamed")).toBe(":citet[renamed] :citep[renamed]");
    const cited = [file("main", "main.md", "See :citet[doe2026] and :citep[other]."), file("other", "other.md", "No citation")];
    expect(projectUsesCitationAlias(cited, "doe2026")).toBe(true);
    expect(projectUsesCitationAlias(cited, "doe20260")).toBe(false);
  });

  it("reports missing files and cycles without inventing output", () => {
    const result = composeProject(
      [file("main", "main.md", "::include[a.md]\n::include[missing.md]\n"), file("a", "a.md", "::include[main.md]\n")],
      "main",
    );

    expect(result.content).toBe("");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["cycle", "missing-file"]);
  });

  it("terminates direct and indirect cycles at the offending include edge", () => {
    const indirect = composeProject(
      [
        file("main", "main.md", "start\n::include[a.md]\n::include[shared.md]\nend\n"),
        file("a", "a.md", "A\n::include[b.md]\nA end\n"),
        file("b", "b.md", "B\n::include[a.md]\nB end\n"),
        file("shared", "shared.md", "Shared\n"),
      ],
      "main",
    );

    expect(indirect.content).toBe("start\nA\nB\nB end\nA end\nShared\nend\n");
    expect(indirect.diagnostics).toEqual([
      expect.objectContaining({
        code: "cycle",
        message: "Include cycle: main.md → a.md → b.md → a.md",
        fileId: "b",
        path: "b.md",
        from: 12,
        to: 16,
        includeChain: ["main", "a", "b"],
      }),
    ]);
    expect(indirect.dependencies).toEqual({
      a: ["b"],
      b: ["a"],
      main: ["a", "shared"],
    });

    const direct = composeProject([file("main", "main.md", "before\n::include[main.md]\nafter\n")], "main");

    expect(direct.content).toBe("before\nafter\n");
    expect(direct.diagnostics).toEqual([
      expect.objectContaining({
        code: "cycle",
        message: "Include cycle: main.md → main.md",
        fileId: "main",
        from: 17,
        to: 24,
        includeChain: ["main"],
      }),
    ]);
    expect(direct.dependencies).toEqual({ main: ["main"] });
  });

  it("allows the same file through separate non-cyclic include branches", () => {
    const result = composeProject(
      [
        file("main", "main.md", "top\n::include[left.md]\n::include[right.md]\n"),
        file("left", "left.md", "left\n::include[shared.md]\n"),
        file("right", "right.md", "right\n::include[shared.md]\n"),
        file("shared", "shared.md", "shared\n"),
      ],
      "main",
    );

    expect(result.content).toBe("top\nleft\nshared\nright\nshared\n");
    expect(result.diagnostics).toEqual([]);
    expect(result.dependencies).toEqual({
      left: ["shared"],
      main: ["left", "right"],
      right: ["shared"],
    });
    expect(result.sourceMap.filter(({ fileId }) => fileId === "shared").map(({ includeChain }) => includeChain)).toEqual([
      ["main", "left", "shared"],
      ["main", "right", "shared"],
    ]);
  });

  it("enforces entry identity and resource bounds", () => {
    expect(composeProject([file("intro", "intro.md", "Hello")], "intro").content).toBe("Hello");
    const result = composeProject([file("main", "main.md", "12345")], "main", { maximumOutputBytes: 4 });
    expect(result.content).toBe("");
    expect(result.diagnostics[0]?.code).toBe("output-limit");
    expect(() => composeProject([file("main", "main.md", "text")], "missing")).toThrow("does not exist");
    for (const limits of [{ maximumDepth: 0 }, { maximumFiles: -1 }, { maximumOutputBytes: 1.5 }]) {
      expect(() => composeProject([file("main", "main.md", "text")], "main", limits)).toThrow("positive safe integer");
    }
    const depth = composeProject(
      [file("main", "main.md", "::include[a.md]\n"), file("a", "a.md", "::include[b.md]\n"), file("b", "b.md", "deep")],
      "main",
      { maximumDepth: 2 },
    );
    expect(depth.diagnostics.map(({ code }) => code)).toEqual(["depth-limit"]);
    const count = composeProject(
      [file("main", "main.md", "::include[a.md]\n::include[b.md]\n"), file("a", "a.md", "a"), file("b", "b.md", "b")],
      "main",
      { maximumFiles: 2 },
    );
    expect(count.content).toBe("a");
    expect(count.diagnostics.map(({ code }) => code)).toEqual(["file-limit"]);
    expect(composeProject([file("main", "main.md", "é")], "main", { maximumOutputBytes: 1 }).diagnostics[0]?.code).toBe("output-limit");
  });

  it("normalizes safe project-relative paths and finds inbound includes", () => {
    expect(normalizeProjectPath("chapters/../main.md")).toBe("main.md");
    expect(normalizeProjectPath("../outside.md")).toBeNull();
    expect(normalizeProjectPath("/absolute.md")).toBeNull();
    expect(normalizeProjectPath("\0bad.md")).toBeNull();
    expect(normalizeProjectPath(" ./chapters\\intro.md ")).toBe("chapters/intro.md");
    expect(normalizeProjectPath("chapters//./intro.md")).toBe("chapters/intro.md");
    expect(normalizeProjectPath("chapters/../..")).toBeNull();
    expect(resolveProjectPath("chapters/intro.md", "../tables/result.md")).toBe("tables/result.md");
    const files = [file("main", "main.md", "::include[chapters/intro.md]\n"), file("intro", "chapters/intro.md", "Text")];
    expect(inboundProjectIncludes(files, "chapters/intro.md").map(({ id }) => id)).toEqual(["main"]);
    expect(inboundProjectIncludes(files, "missing.md")).toEqual([]);
    expect(rewriteInboundProjectIncludes(files[0]!, "chapters/intro.md", "sections/01_intro.md")).toBe("::include[sections/01_intro.md]\n");
    expect(
      rewriteInboundProjectIncludes(file("peer", "chapters/peer.md", "::include[intro.md]\n"), "chapters/intro.md", "text/intro.md"),
    ).toBe("::include[../text/intro.md]\n");
    expect(relativeProjectPath("chapters/peer.md", "chapters/intro.md")).toBe("intro.md");
    expect(relativeProjectPath("main.md", "chapters/intro.md")).toBe("chapters/intro.md");
  });

  it("keeps includes valid when containing folders move", () => {
    const moves = new Map([
      ["drafts/section.md", "chapters/section.md"],
      ["drafts/notes/detail.md", "chapters/notes/detail.md"],
    ]);
    expect(rewriteProjectIncludesForMoves(file("main", "main.md", "::include[drafts/section.md]\n"), moves)).toBe(
      "::include[chapters/section.md]\n",
    );
    expect(rewriteProjectIncludesForMoves(file("section", "drafts/section.md", "::include[notes/detail.md]\n"), moves)).toBe(
      "::include[notes/detail.md]\n",
    );
    expect(rewriteProjectIncludesForMoves(file("detail", "drafts/notes/detail.md", "::include[../section.md]\n"), moves)).toBe(
      "::include[../section.md]\n",
    );
  });

  it("keeps image references valid when source files or assets move", () => {
    const moves = new Map([
      ["drafts/section.md", "chapters/section.md"],
      ["figures/results/chart.png", "figures/final/chart.png"],
    ]);
    expect(
      rewriteProjectImageReferencesForMoves(
        file("section", "drafts/section.md", "![Chart](../figures/results/chart.png)\n![Remote](https://example.test/chart.png)\n"),
        moves,
      ),
    ).toBe("![Chart](../figures/final/chart.png)\n![Remote](https://example.test/chart.png)\n");
    expect(rewriteProjectImageReferencesForMoves(file("main", "main.md", '![Chart](<figures/results/chart.png> "Result")\n'), moves)).toBe(
      '![Chart](<figures/final/chart.png> "Result")\n',
    );
  });

  it("reports invalid and duplicate stored paths while preserving valid composition", () => {
    const result = composeProject(
      [
        file("main", "main.md", "root\n"),
        file("unsafe", "../unsafe.md", "unsafe"),
        file("duplicate-a", "same.md", "a"),
        file("duplicate-b", "same.md", "b"),
      ],
      "main",
    );
    expect(result.content).toBe("root\n");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["invalid-path", "duplicate-path"]);
  });

  it("maps source ranges around repeated includes and strips only leading included frontmatter", () => {
    const result = composeProject(
      [
        file("main", "main.md", "before\n::include[part.md]\nafter\n::include[part.md]\n"),
        file("part", "part.md", "---\r\ntitle: Hidden\r\n---\r\npart\n---\nnot frontmatter\n"),
      ],
      "main",
    );
    expect(result.content).toBe("before\npart\n---\nnot frontmatter\nafter\npart\n---\nnot frontmatter\n");
    expect(result.sourceMap.map((span) => span.fileId)).toEqual(["main", "part", "main", "part"]);
    expect(result.dependencies).toEqual({ main: ["part"] });
  });
});
