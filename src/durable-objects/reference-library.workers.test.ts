import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { LibraryPdfArtifact } from "../domain/reference-library";
import { ReferenceLibrary } from "./reference-library";

describe("ReferenceLibrary in the Workers runtime", () => {
  it("keeps one private stable record with field provenance and reusable research state", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`library-${crypto.randomUUID()}`);
    const first = await library.importBibTeX(
      `@article{doe2026,
        title = {Inspectable Evidence},
        author = {Doe, Jane},
        year = {2026},
        journal = {Open Research},
        doi = {10.1000/example}
      }`,
      "owner@example.test",
    );
    const second = await library.importBibTeX(
      `@article{localAlias,
        title = {Corrected Inspectable Evidence},
        author = {Doe, Jane},
        year = {2026},
        journal = {Open Research},
        doi = {https://doi.org/10.1000/EXAMPLE}
      }`,
      "owner@example.test",
    );
    expect(second[0]?.reference.id).toBe(first[0]?.reference.id);
    expect(second[0]?.created).toBe(false);
    expect(second[0]?.suggestedAlias).toBe("localAlias");
    expect(second[0]?.reference.provenance.title).toMatchObject({ method: "bibtex", actor: "owner@example.test" });

    const referenceId = first[0]!.reference.id;
    expect(await library.setTags(referenceId, ["Methods", "methods", "To read"])).toEqual(["Methods", "To read"]);
    expect((await library.createNote(referenceId, "Private interpretation")).body).toBe("Private interpretation");
    expect(await library.setReadingState(referenceId, "reading", 4)).toMatchObject({ status: "reading", rating: 4 });
    expect((await library.getSnapshot()).references[0]?.title).toBe("Corrected Inspectable Evidence");
    expect((await library.archiveReference(referenceId, true)).archivedAt).not.toBeNull();
    expect((await library.getSnapshot()).references).toEqual([]);
    expect((await library.getSnapshot(true)).references).toHaveLength(1);

    const note = (await library.getSnapshot(true)).notes[0];
    const share = await library.shareResearch("project-a", referenceId, "note", note!.id);
    expect(share).toMatchObject({ projectId: "project-a", kind: "note", content: { kind: "note", body: "Private interpretation" } });
    expect(await library.revokeResearchShare(share.id)).toMatchObject({ revokedAt: expect.any(String) });
  });

  it("requires bibliographic identification before a PDF becomes an ordinary source artifact", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`pdf-library-${crypto.randomUUID()}`);
    const [incomplete] = await library.importBibTeX("@article{draft, title={Draft}}", "owner@example.test");
    const artifact: LibraryPdfArtifact = {
      id: crypto.randomUUID(),
      referenceId: null,
      name: "draft.pdf",
      contentType: "application/pdf",
      size: 100,
      objectKey: "libraries/owner/draft.pdf",
      fingerprint: "etag:draft",
      rights: "private",
      createdAt: "2026-07-11T10:00:00.000Z",
    };
    await library.registerPdf(artifact);
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() => instance.identifyPdf(artifact.id, incomplete!.reference.id)).toThrow("Complete required article fields");
    });

    const [complete] = await library.importBibTeX("@manual{guide, title={Field Guide}}", "owner@example.test");
    expect(await library.identifyPdf(artifact.id, complete!.reference.id)).toMatchObject({ referenceId: complete!.reference.id });
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() => instance.shareResearch("project-a", complete!.reference.id, "artifact", artifact.id)).toThrow("rights allow");
    });
    await library.setArtifactRights(artifact.id, "shareable");
    expect(await library.shareResearch("project-a", complete!.reference.id, "artifact", artifact.id)).toMatchObject({
      content: { kind: "artifact", objectKey: artifact.objectKey },
    });
  });

  it("distinguishes project unlink dependencies, archive, and confirmed permanent deletion", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`deletion-library-${crypto.randomUUID()}`);
    const [item] = await library.importBibTeX("@manual{guide, title={Field Guide}}", "owner@example.test");
    const referenceId = item!.reference.id;
    await library.registerProjectDependency("project-a", referenceId);
    expect(await library.getDeletionImpact(referenceId)).toMatchObject({ referenceId, projectIds: ["project-a"] });
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() => instance.permanentlyDeleteReference(referenceId, [])).toThrow("dependencies changed");
    });
    const tombstone = await library.permanentlyDeleteReference(referenceId, ["project-a"]);
    expect(tombstone).toMatchObject({ id: referenceId, deletedAt: expect.any(String), title: "Field Guide" });
    expect((await library.getReferences([referenceId]))[0]).toMatchObject({ deletedAt: expect.any(String), authors: [] });
  });
});
