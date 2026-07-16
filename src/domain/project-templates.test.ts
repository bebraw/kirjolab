import { describe, expect, it } from "vitest";
import {
  builtInProjectTemplate,
  isPersonalProjectTemplateId,
  isProjectTemplateSeed,
  isProjectTemplateSummaries,
  isSaveProjectTemplateInput,
  listBuiltInProjectTemplates,
  projectTemplatePreview,
  projectTemplateSeed,
} from "./project-templates";
import { defaultProjectPublicationProfile, type WorkspaceSnapshot } from "./workspace";

describe("project templates", () => {
  it("provides four valid and distinct built-in starting structures", () => {
    const summaries = listBuiltInProjectTemplates();
    expect(summaries.map((template) => template.id)).toEqual([
      "builtin-guided",
      "builtin-blank",
      "builtin-research-article",
      "builtin-literature-review",
    ]);
    expect(builtInProjectTemplate("builtin-blank")?.seed.files).toEqual([{ path: "main.md", content: "" }]);
    expect(builtInProjectTemplate("builtin-research-article")?.seed.files.map((file) => file.path)).toContain("sections/methods.md");
    expect(builtInProjectTemplate("builtin-literature-review")?.seed.files.map((file) => file.path)).toContain(
      "sections/search-strategy.md",
    );
    expect(builtInProjectTemplate("missing")).toBeNull();
    expect(summaries[0]?.preview).toMatchObject({
      files: ["main.md", "KIRJOLAB.md", "sections/transclusion.md"],
      fileCount: 3,
      folders: ["figures", "sections"],
      folderCount: 2,
      hasBibliography: true,
      citationStyle: "apa",
      locale: "en-US",
      submissionTemplate: "article",
      paperSize: "a4",
    });
    for (const summary of summaries) {
      const record = builtInProjectTemplate(summary.id);
      expect(record?.source).toBe("built-in");
      expect(record?.createdAt).toBeNull();
      expect(isProjectTemplateSeed(record?.seed)).toBe(true);
    }
  });

  it("derives a bounded content-free preview from a template seed", () => {
    const seed = builtInProjectTemplate("builtin-blank")!.seed;
    const files = [
      { path: "sections/z-last.md", content: "Private" },
      ...seed.files,
      ...Array.from({ length: 9 }, (_, index) => ({ path: `sections/${String(index).padStart(2, "0")}.md`, content: "Private" })),
    ];
    const folders = ["z-last", "figures", "sections", "appendices", "notes", "data", "tables", "assets", "archive"];
    const preview = projectTemplatePreview({ ...seed, files, folders });

    expect(preview.fileCount).toBe(11);
    expect(preview.files).toEqual([
      "main.md",
      "sections/00.md",
      "sections/01.md",
      "sections/02.md",
      "sections/03.md",
      "sections/04.md",
      "sections/05.md",
      "sections/06.md",
    ]);
    expect(preview.folderCount).toBe(9);
    expect(preview.folders).toEqual(["appendices", "archive", "assets", "data", "figures", "notes", "sections", "tables"]);
    expect(preview.hasBibliography).toBe(false);
    expect(JSON.stringify(preview)).not.toContain("Private");
    expect(projectTemplatePreview({ ...seed, bibliography: "  @article{x}  " }).hasBibliography).toBe(true);
    expect(() => projectTemplatePreview({ ...seed, files: [] })).toThrow("valid seed");
  });

  it("projects only portable authored structure from a workspace", () => {
    const snapshot: Pick<WorkspaceSnapshot, "entryFileId" | "files" | "folders" | "bibliography" | "publicationProfile"> & {
      pdfs: readonly { id: string }[];
      annotations: readonly { id: string }[];
    } = {
      entryFileId: "private-id",
      files: [
        { id: "private-id", path: "main.md", mediaType: "text/markdown", content: "## Study\n", createdAt: "then", updatedAt: "now" },
      ],
      folders: [{ id: "folder-id", path: "figures", createdAt: "then", updatedAt: "now" }],
      bibliography: "@article{doe2026, title={Study}}\n",
      publicationProfile: defaultProjectPublicationProfile,
      pdfs: [{ id: "private-pdf" }],
      annotations: [{ id: "private-note" }],
    };

    expect(projectTemplateSeed(snapshot)).toEqual({
      schemaVersion: 1,
      entryPath: "main.md",
      files: [{ path: "main.md", content: "## Study\n" }],
      folders: ["figures"],
      bibliography: "@article{doe2026, title={Study}}\n",
      publicationProfile: defaultProjectPublicationProfile,
    });
  });

  it("rejects malformed, duplicate, missing explicit entry, and oversized seeds", () => {
    const seed = builtInProjectTemplate("builtin-guided")!.seed;
    expect(isProjectTemplateSeed(null)).toBe(false);
    expect(isProjectTemplateSeed([])).toBe(false);
    expect(isProjectTemplateSeed({})).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, schemaVersion: 2 })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: "main.md" })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, folders: "figures" })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: Array.from({ length: 513 }, () => seed.files[0]) })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, folders: Array.from({ length: 513 }, (_, index) => `folder-${index}`) })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, bibliography: 42 })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, publicationProfile: null })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, entryPath: "missing.md" })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, entryPath: 42 })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, entryPath: "../main.md" })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, entryPath: undefined, files: [{ path: "notes.md", content: "notes" }] })).toBe(true);
    expect(isProjectTemplateSeed({ ...seed, files: [...seed.files, { path: "MAIN.md", content: "duplicate" }] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [null] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [{ path: 42, content: "bad" }] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [{ path: "main.md", content: 42 }] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [{ path: "../main.md", content: "bad" }] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [{ path: "main.txt", content: "bad" }] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [{ path: "sections//main.md", content: "bad" }] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, folders: ["sections", "sections"] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, folders: [42] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, folders: ["../figures"] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, folders: ["notes.md"] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, folders: ["Figures", "figures"] })).toBe(false);

    const minimalSeed = { ...seed, files: [{ path: "main.md", content: "" }], folders: [] };
    expect(isProjectTemplateSeed({ ...minimalSeed, bibliography: "x".repeat(2 * 1024 * 1024) })).toBe(true);
    expect(isProjectTemplateSeed({ ...minimalSeed, bibliography: "x".repeat(2 * 1024 * 1024 + 1) })).toBe(false);
    expect(() =>
      projectTemplateSeed({
        entryFileId: "missing",
        files: [],
        folders: [],
        bibliography: "",
        publicationProfile: defaultProjectPublicationProfile,
      }),
    ).toThrow("Project cannot be represented as a bounded template");
  });

  it("validates promotion inputs and personal ids", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(isSaveProjectTemplateInput({ name: "Lab paper", description: "Reusable", templateId: id })).toBe(true);
    expect(isSaveProjectTemplateInput({ name: "Lab paper" })).toBe(true);
    expect(isSaveProjectTemplateInput({ name: "" })).toBe(false);
    expect(isSaveProjectTemplateInput({ name: "x".repeat(121) })).toBe(false);
    expect(isSaveProjectTemplateInput({ name: "Lab", description: "x".repeat(501) })).toBe(false);
    expect(isSaveProjectTemplateInput({ name: "Lab", templateId: "builtin-guided" })).toBe(false);
    expect(isPersonalProjectTemplateId(id)).toBe(true);
    expect(isPersonalProjectTemplateId("builtin-guided")).toBe(false);
  });

  it("strictly validates template list summaries", () => {
    const summary = listBuiltInProjectTemplates()[0]!;
    expect(isProjectTemplateSummaries(listBuiltInProjectTemplates())).toBe(true);
    expect(isProjectTemplateSummaries([])).toBe(true);
    expect(isProjectTemplateSummaries(null)).toBe(false);
    expect(isProjectTemplateSummaries({})).toBe(false);
    expect(isProjectTemplateSummaries([null])).toBe(false);
    expect(isProjectTemplateSummaries([[]])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, id: 42 }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, id: "" }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, id: "x".repeat(64) }])).toBe(true);
    expect(isProjectTemplateSummaries([{ ...summary, id: "x".repeat(65) }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, source: "foreign" }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, name: 42 }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, name: " " }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, name: "x".repeat(121) }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, description: 42 }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, description: "x".repeat(501) }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, createdAt: "2026-07-15T00:00:00.000Z" }])).toBe(true);
    expect(isProjectTemplateSummaries([{ ...summary, createdAt: 42 }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, updatedAt: "2026-07-15T00:00:00.000Z" }])).toBe(true);
    expect(isProjectTemplateSummaries([{ ...summary, updatedAt: 42 }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: null }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, files: ["../private.md"] } }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, files: ["notes.txt"] } }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, folders: ["notes.md"] } }])).toBe(false);
    expect(
      isProjectTemplateSummaries([
        { ...summary, preview: { ...summary.preview, files: Array.from({ length: 9 }, (_, index) => `${index}.md`), fileCount: 9 } },
      ]),
    ).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, fileCount: 2.5 } }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, fileCount: 2 } }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, fileCount: 0 } }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, fileCount: 513 } }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, folderCount: 1 } }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, folderCount: 513 } }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, hasBibliography: "yes" } }])).toBe(false);
    expect(isProjectTemplateSummaries([{ ...summary, preview: { ...summary.preview, citationStyle: "unknown" } }])).toBe(false);
  });
});
