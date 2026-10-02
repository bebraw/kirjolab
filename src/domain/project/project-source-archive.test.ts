import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { inspectProjectImportArchive } from "./project-source-archive";
import { buildProjectArchive } from "./project-archive";
import { projectArchiveFixture } from "../../test-support/project-archive";

describe("source project archive import", () => {
  it("ignores unrelated nested manifest and project JSON files in a source folder", async () => {
    const result = await inspectProjectImportArchive(
      zipSync({
        "paper/main.md": strToU8("# Paper"),
        "paper/config/manifest.json": strToU8('{"name":"Plugin settings"}'),
        "paper/config/project.json": strToU8("{}"),
      }),
    );
    expect(result.kind).toBe("source");
    expect(result.summary).toMatchObject({ title: "Paper", entryPath: "main.md", files: 1 });
    if (result.kind !== "source") throw new Error("Expected source inspection");
    expect(result.source.skippedEntries).toBe(2);
  });

  it("imports a wrapped Markdown project despite dependency entries and builds deterministic native metadata", async () => {
    const entries: Record<string, Uint8Array> = {
      "paper/manuscript.md": strToU8("# My paper\n\nOriginal :cite[Author2026].\n"),
      "paper/notes/design.md": strToU8("# Notes"),
      "paper/bibliography.bib": strToU8("@article{Author2026,title={Evidence},author={Writer, Ada},year={2026}}"),
      "paper/references/source.pdf": strToU8("%PDF-1.7\nfixture"),
      "__MACOSX/._paper": strToU8("metadata"),
      "paper/.git/config": strToU8("git data"),
    };
    for (let index = 0; index < 1_100; index++) entries[`paper/node_modules/package/${index}.md`] = strToU8("dependency");
    const bytes = zipSync(entries);
    const first = await inspectProjectImportArchive(bytes);
    const second = await inspectProjectImportArchive(bytes);
    expect(first).toEqual(second);
    expect(first.kind).toBe("source");
    if (first.kind !== "source") throw new Error("Expected source inspection");
    expect(first.summary).toMatchObject({ title: "My paper", entryPath: "manuscript.md", files: 2, references: 1, pdfs: 1 });
    expect(first.project.files.map(({ path }) => path)).toEqual(["manuscript.md", "notes/design.md"]);
    expect(first.project.projectReferences[0]).toMatchObject({ citationAlias: "Author2026", snapshot: { title: "Evidence" } });
    expect(first.source.skippedEntries).toBe(1_102);
    expect(first.manifest.payloads.map(({ path }) => path)).toEqual(["payloads/0.bin", "project.json"]);
    expect(first.payloads.has("project.json")).toBe(true);
    expect(first.project.pdfs[0]?.name).toBe("references/source.pdf");
  });

  it("lets setup choose the entry file and bibliography and omit PDFs", async () => {
    const bytes = zipSync({
      "main.md": strToU8("# Main"),
      "chapters/paper.md": strToU8("# Selected"),
      "first.bib": strToU8("@misc{One,title={One}}"),
      "second.bib": strToU8("@misc{Two,title={Two}}"),
      "source.pdf": strToU8("%PDF-1.7"),
    });
    const result = await inspectProjectImportArchive(bytes, {
      entryPath: "chapters/paper.md",
      bibliographyPath: "second.bib",
      includePdfs: false,
    });
    if (result.kind !== "source") throw new Error("Expected source inspection");
    expect(result.summary).toMatchObject({ entryPath: "chapters/paper.md", title: "Selected", references: 1, pdfs: 0 });
    expect(result.project.projectReferences[0]?.citationAlias).toBe("Two");
    expect(result.source.bibliographyCandidates).toEqual(["first.bib", "second.bib"]);
    await expect(inspectProjectImportArchive(bytes, { entryPath: "missing.md" })).rejects.toThrow("entry");
    await expect(inspectProjectImportArchive(bytes, { bibliographyPath: "missing.bib" })).rejects.toThrow("bibliography");
  });

  it("excludes omitted PDFs before retained-content limits and inflation", async () => {
    const pdf = new Uint8Array(21 * 1024 * 1024);
    pdf.set(strToU8("%PDF-1.7\n"));
    let seed = 123456789;
    const pattern = Uint8Array.from({ length: 4_096 }, () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed & 0xff;
    });
    for (let offset = 9; offset < pdf.length; offset += pattern.length)
      pdf.set(pattern.subarray(0, Math.min(pattern.length, pdf.length - offset)), offset);
    const bytes = zipSync({ "main.md": strToU8("# Paper"), "bundled.pdf": pdf });
    expect(bytes.length).toBeLessThan(20 * 1024 * 1024);
    await expect(inspectProjectImportArchive(bytes)).rejects.toThrow("Imported project content exceeds 20 MiB");
    const result = await inspectProjectImportArchive(bytes, { includePdfs: false });
    expect(result.kind).toBe("source");
    expect(result.summary).toMatchObject({ entryPath: "main.md", files: 1, pdfs: 0 });
    if (result.kind !== "source") throw new Error("Expected source inspection");
    expect([...result.payloads.keys()]).toEqual(["project.json"]);
    expect(result.source.skippedEntries).toBe(1);
  });

  it("keeps source paths stable when omitting PDFs outside the Markdown folder", async () => {
    const bytes = zipSync({ "chapters/main.md": strToU8("# Paper"), "reference.pdf": strToU8("%PDF-1.7") });
    const first = await inspectProjectImportArchive(bytes);
    const withoutPdfs = await inspectProjectImportArchive(bytes, { entryPath: "chapters/main.md", includePdfs: false });
    expect(first.summary.entryPath).toBe("chapters/main.md");
    expect(withoutPdfs.summary).toMatchObject({ entryPath: "chapters/main.md", files: 1, pdfs: 0 });
  });

  it("preserves native validation and refuses to reinterpret a corrupt manifest as source", async () => {
    expect((await inspectProjectImportArchive(await buildProjectArchive(projectArchiveFixture(), new Map()))).kind).toBe("native");
    await expect(inspectProjectImportArchive(zipSync({ "manifest.json": strToU8("{}"), "main.md": strToU8("# Paper") }))).rejects.toThrow(
      "manifest",
    );
    await expect(inspectProjectImportArchive(zipSync({ "../main.md": strToU8("# Paper") }))).rejects.toThrow("Unsafe archive path");
    await expect(inspectProjectImportArchive(zipSync({ "readme.txt": strToU8("text") }))).rejects.toThrow("Markdown");
  });

  it("validates selected text and binaries while skipping large dependency text", async () => {
    const withDependency = await inspectProjectImportArchive(
      zipSync({ "main.md": strToU8("# Paper"), "node_modules/vendor/source.bib": new Uint8Array(3 * 1024 * 1024) }, { level: 0 }),
    );
    expect(withDependency.summary.files).toBe(1);
    await expect(inspectProjectImportArchive(zipSync({ "main.md": Uint8Array.from([0xff]) }))).rejects.toThrow("UTF-8");
    await expect(inspectProjectImportArchive(zipSync({ "main.md": new Uint8Array(2 * 1024 * 1024 + 1) }, { level: 0 }))).rejects.toThrow(
      "2 MiB",
    );
    await expect(
      inspectProjectImportArchive(zipSync({ "main.md": strToU8("# Paper"), "source.pdf": strToU8("not a PDF") })),
    ).rejects.toThrow("PDF signature");
    await expect(
      inspectProjectImportArchive(
        zipSync({
          "main.md": strToU8("# Paper"),
          "figure.svg": strToU8('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        }),
      ),
    ).rejects.toThrow("unsafe project image");
  });

  it("bounds raw ZIP entry count and imported file count separately", async () => {
    const entries: Record<string, Uint8Array> = { "main.md": strToU8("# Paper") };
    for (let index = 0; index < 16_384; index++) entries[`node_modules/${index}.js`] = new Uint8Array();
    await expect(inspectProjectImportArchive(zipSync(entries))).rejects.toThrow("16384 entries");
    const many: Record<string, Uint8Array> = {};
    for (let index = 0; index < 1_025; index++) many[`${index}.md`] = strToU8("Paper");
    await expect(inspectProjectImportArchive(zipSync(many))).rejects.toThrow("1,024 importable files");
  });
});
