import { describe, expect, it } from "vitest";
import {
  composeProject,
  inboundProjectIncludes,
  normalizeProjectPath,
  resolveProjectPath,
  rewriteInboundProjectIncludes,
  type ProjectFile,
} from "./project-files";

const timestamp = "2026-07-11T10:00:00.000Z";

function file(id: string, path: string, content: string): ProjectFile {
  return { id, path, content, mediaType: "text/markdown", createdAt: timestamp, updatedAt: timestamp };
}

describe("project composition", () => {
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

  it("reports missing files and cycles without inventing output", () => {
    const result = composeProject(
      [file("main", "main.md", "::include[a.md]\n::include[missing.md]\n"), file("a", "a.md", "::include[main.md]\n")],
      "main",
    );

    expect(result.content).toBe("");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["cycle", "missing-file"]);
  });

  it("enforces entry point and resource bounds", () => {
    expect(() => composeProject([file("intro", "intro.md", "Hello")], "intro")).toThrow(/main\.md/u);
    const result = composeProject([file("main", "main.md", "12345")], "main", { maximumOutputBytes: 4 });
    expect(result.content).toBe("");
    expect(result.diagnostics[0]?.code).toBe("output-limit");
  });

  it("normalizes safe project-relative paths and finds inbound includes", () => {
    expect(normalizeProjectPath("chapters/../main.md")).toBe("main.md");
    expect(normalizeProjectPath("../outside.md")).toBeNull();
    expect(resolveProjectPath("chapters/intro.md", "../tables/result.md")).toBe("tables/result.md");
    const files = [file("main", "main.md", "::include[chapters/intro.md]\n"), file("intro", "chapters/intro.md", "Text")];
    expect(inboundProjectIncludes(files, "chapters/intro.md").map(({ id }) => id)).toEqual(["main"]);
    expect(rewriteInboundProjectIncludes(files[0]!, "chapters/intro.md", "sections/01_intro.md")).toBe("::include[sections/01_intro.md]\n");
    expect(
      rewriteInboundProjectIncludes(file("peer", "chapters/peer.md", "::include[intro.md]\n"), "chapters/intro.md", "text/intro.md"),
    ).toBe("::include[../text/intro.md]\n");
  });
});
