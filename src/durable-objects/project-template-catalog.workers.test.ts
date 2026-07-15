import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { builtInProjectTemplate } from "../domain/project-templates";
import { defaultProjectPublicationProfile } from "../domain/workspace";
import { ProjectTemplateCatalog } from "./project-template-catalog";

describe("ProjectTemplateCatalog in the Workers runtime", () => {
  it("stores, replaces, deletes, and isolates personal templates", async () => {
    const catalog = env.PROJECT_TEMPLATE_CATALOGS.getByName("template-owner-a");
    const otherCatalog = env.PROJECT_TEMPLATE_CATALOGS.getByName("template-owner-b");
    const seed = builtInProjectTemplate("builtin-blank")!.seed;
    const created = await catalog.saveTemplate({ name: "Lab paper", description: "Shared structure", seed });

    expect(created).toMatchObject({
      source: "personal",
      name: "Lab paper",
      description: "Shared structure",
      preview: { files: ["main.md"], fileCount: 1, folders: ["figures"], folderCount: 1 },
    });
    expect(await catalog.listTemplates()).toEqual([created]);
    expect(await otherCatalog.listTemplates()).toEqual([]);
    expect((await catalog.getTemplate(created.id))?.seed).toEqual(seed);

    const replacement = builtInProjectTemplate("builtin-literature-review")!.seed;
    const updated = await catalog.saveTemplate({
      id: created.id,
      name: "Review protocol",
      description: "Updated structure",
      seed: replacement,
    });
    expect(updated).toMatchObject({ id: created.id, name: "Review protocol", description: "Updated structure" });
    expect((await catalog.getTemplate(created.id))?.seed).toEqual(replacement);

    await catalog.deleteTemplate(created.id);
    expect(await catalog.listTemplates()).toEqual([]);
    await runInDurableObject(catalog, (instance: ProjectTemplateCatalog) => {
      expect(() => instance.deleteTemplate(created.id)).toThrow("not found");
    });
    expect(await catalog.getTemplate("builtin-guided")).toBeNull();
  });

  it("instantiates an independent project from a sanitized seed", async () => {
    const templateCatalog = env.PROJECT_TEMPLATE_CATALOGS.getByName("template-instantiation-owner");
    const initialSeed = builtInProjectTemplate("builtin-research-article")!.seed;
    const template = await templateCatalog.saveTemplate({ name: "Article", description: "Lab article", seed: initialSeed });
    const stored = await templateCatalog.getTemplate(template.id);
    const room = env.DOCUMENT_ROOMS.getByName("template-instantiated-room");
    const snapshot = await room.seedFromTemplate("template-project", "Template project", stored!.seed);

    expect(snapshot.title).toBe("Template project");
    expect(snapshot.files.map((file) => file.path)).toEqual([
      "main.md",
      "sections/discussion.md",
      "sections/introduction.md",
      "sections/methods.md",
      "sections/results.md",
    ]);
    expect(snapshot.folders.map((folder) => folder.path)).toEqual(["figures", "sections"]);
    expect(snapshot.publicationProfile).toEqual(defaultProjectPublicationProfile);
    expect(snapshot.pdfs).toEqual([]);
    expect(snapshot.annotations).toEqual([]);
    expect(snapshot.claims).toEqual([]);
    expect(snapshot.comments).toEqual([]);
    expect(snapshot.assets).toEqual([]);
    expect((await room.listRevisions()).map((revision) => revision.reason)).toEqual(["template-instantiation"]);

    await templateCatalog.saveTemplate({
      id: template.id,
      name: "Article",
      description: "Blanked later",
      seed: builtInProjectTemplate("builtin-blank")!.seed,
    });
    expect((await room.getSnapshot("template-project")).files.map((file) => file.path)).toContain("sections/methods.md");
  });

  it("enforces names, uniqueness, bounds, and a migration ledger", async () => {
    const catalog = env.PROJECT_TEMPLATE_CATALOGS.getByName("template-bounds-owner");
    const seed = builtInProjectTemplate("builtin-blank")!.seed;
    await catalog.saveTemplate({ name: "Unique", description: "", seed });
    await runInDurableObject(catalog, (instance: ProjectTemplateCatalog) => {
      expect(() => instance.saveTemplate({ name: "unique", description: "collision", seed })).toThrow();
      expect(() => instance.saveTemplate({ name: "", description: "", seed })).toThrow("invalid");
      expect(() => instance.saveTemplate({ name: "x".repeat(121), description: "", seed })).toThrow("invalid");
      expect(() => instance.saveTemplate({ name: "Valid", description: "x".repeat(501), seed })).toThrow("invalid");
    });

    const backup = await catalog.getBackupSnapshot();
    expect(backup.templates).toHaveLength(1);
    expect(backup.bookmark).toBeNull();
    expect(
      await runInDurableObject(catalog, (_instance: ProjectTemplateCatalog, state) =>
        state.storage.sql.exec<{ version: number; name: string }>("SELECT version, name FROM _kirjolab_migrations").toArray(),
      ),
    ).toEqual([{ version: 1, name: "store-personal-project-templates" }]);
  });
});
