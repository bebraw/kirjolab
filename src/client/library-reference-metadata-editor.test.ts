import { describe, expect, it } from "vitest";
import type { BibliographicRecord, LibraryPdfArtifact, MetadataRefinementPreview } from "../domain/reference-library";
import {
  LibraryReferenceMetadataEditor,
  libraryReferenceMetadataActionEvent,
  type LibraryReferenceMetadataAction,
} from "./library-reference-metadata-editor";

class TestLibraryReferenceMetadataEditor extends LibraryReferenceMetadataEditor {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  saveForTest(): void {
    this.save();
  }

  refineForTest(): void {
    this.refine();
  }

  applyPdfForTest(): void {
    this.applyPdf();
  }

  applyProviderForTest(): void {
    this.applyProvider();
  }
}

const reference = {
  id: "ref-1",
  referenceKey: "doe2026",
  type: "article",
  title: "Current title",
  authors: ["Jane Doe"],
  year: "2025",
  venue: "Journal",
  doi: "10.1000/current",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
} satisfies BibliographicRecord;

const artifact = {
  id: "pdf-1",
  referenceId: reference.id,
  name: "paper.pdf",
  contentType: "application/pdf" as const,
  size: 2048,
  objectKey: "pdfs/paper",
  fingerprint: "fingerprint",
  rights: "private" as const,
  createdAt: "2026-07-25T00:00:00.000Z",
} satisfies LibraryPdfArtifact;

const local = {
  title: "Suggested title",
  authors: ["Jane Doe", "John Roe"],
  year: "2026",
  doi: "10.1000/suggested",
  diagnostics: ["Two pages inspected."],
  pagesScanned: 2,
};

const preview = {
  referenceId: reference.id,
  artifactId: artifact.id,
  candidates: [
    {
      provider: "crossref",
      match: "doi",
      score: 1,
      metadata: {
        type: "article",
        title: "Provider title",
        authors: ["Jane Doe"],
        year: "2026",
        venue: "Provider Journal",
        doi: "10.1000/suggested",
        url: "https://example.test/paper",
        abstract: "Provider abstract",
      },
      metadataFingerprint: "provider-fingerprint",
    },
  ],
} satisfies MetadataRefinementPreview;

describe("library reference metadata editor", () => {
  it("owns manual, progress, and review presentation in light DOM", () => {
    const editor = new TestLibraryReferenceMetadataEditor();
    expect(editor.rootForTest()).toBe(editor);
    expect(editor.renderForTest()).toBeDefined();
    editor.setData(reference, "Current title", artifact);
    expect(editor.renderForTest()).toBeDefined();
    editor.showStatus("Refine metadata", "Reading PDF…");
    expect(editor.renderForTest()).toBeDefined();
    editor.showReview(artifact, local, preview, "", true);
    expect(editor.renderForTest()).toBeDefined();
  });

  it("emits save, refine, PDF, and provider application actions", () => {
    const editor = new TestLibraryReferenceMetadataEditor();
    const actions: LibraryReferenceMetadataAction[] = [];
    editor.addEventListener(libraryReferenceMetadataActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryReferenceMetadataAction>).detail);
    });
    editor.setData(reference, "Current title", artifact);
    editor.saveForTest();
    editor.refineForTest();
    editor.showReview(artifact, local, preview);
    editor.applyPdfForTest();
    editor.applyProviderForTest();
    expect(actions.map(({ action }) => action)).toEqual(["save", "refine", "apply-pdf", "apply-provider"]);
    expect(actions[2]).toMatchObject({
      action: "apply-pdf",
      artifactId: "pdf-1",
      fields: { title: "Suggested title", year: "2026" },
      referenceId: "ref-1",
    });
    expect(actions[3]).toMatchObject({
      action: "apply-provider",
      referenceId: "ref-1",
      selections: expect.arrayContaining([{ candidateIndex: 0, fields: expect.arrayContaining(["title", "year"]) }]),
    });
  });
});
