import { describe, expect, it } from "vitest";
import {
  builtInProjectTemplate,
  isPersonalProjectTemplateId,
  isProjectTemplateSeed,
  isSaveProjectTemplateInput,
  listBuiltInProjectTemplates,
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
    for (const summary of summaries) {
      const record = builtInProjectTemplate(summary.id);
      expect(record?.source).toBe("built-in");
      expect(record?.createdAt).toBeNull();
      expect(isProjectTemplateSeed(record?.seed)).toBe(true);
    }
  });

  it("projects only portable authored structure from a workspace", () => {
    const snapshot: Pick<WorkspaceSnapshot, "files" | "folders" | "bibliography" | "publicationProfile"> & {
      pdfs: readonly { id: string }[];
      annotations: readonly { id: string }[];
    } = {
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
      files: [{ path: "main.md", content: "## Study\n" }],
      folders: ["figures"],
      bibliography: "@article{doe2026, title={Study}}\n",
      publicationProfile: defaultProjectPublicationProfile,
    });
  });

  it("rejects malformed, duplicate, entryless, and oversized seeds", () => {
    const seed = builtInProjectTemplate("builtin-guided")!.seed;
    expect(isProjectTemplateSeed({ ...seed, schemaVersion: 2 })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [{ path: "notes.md", content: "notes" }] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [...seed.files, { path: "MAIN.md", content: "duplicate" }] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, files: [{ path: "../main.md", content: "bad" }] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, folders: ["sections", "sections"] })).toBe(false);
    expect(isProjectTemplateSeed({ ...seed, bibliography: "x".repeat(2 * 1024 * 1024 + 1) })).toBe(false);
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
});
