import { describe, expect, it, vi } from "vitest";
import type {
  BibliographicRecord,
  LibraryHighlight,
  LibraryPdfArtifact,
  LibraryPdfDrawing,
  LibraryPdfNote,
  ReferenceLibrarySnapshot,
} from "../domain/reference-library";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import type { LibraryPdfAnnotationForms } from "./library-pdf-annotation-forms";
import type { LibraryPdfAnnotationList } from "./library-pdf-annotation-list";
import { LibraryPdfInspector, libraryPdfInspectorCloseEvent } from "./library-pdf-inspector";
import type { LibraryPdfProjectUse } from "./library-pdf-project-use";
import type { PdfHighlightImportPanel } from "./pdf-highlight-import-panel";
import { projectReferenceChangedEvent } from "./project-reference-mutation";
import { projectResearchChangedEvent } from "./project-research-mutation";

const reference: BibliographicRecord = {
  abstract: "",
  archivedAt: null,
  authors: ["Researcher"],
  createdAt: "created",
  deletedAt: null,
  doi: "",
  id: "ref-1",
  provenance: {},
  referenceKey: "researcher2026",
  title: "Paper",
  type: "article",
  updatedAt: "updated",
  url: "",
  venue: "Journal",
  year: "2026",
};
const artifact: LibraryPdfArtifact = {
  contentType: "application/pdf",
  createdAt: "created",
  fingerprint: "fingerprint",
  id: "pdf-1",
  name: "paper.pdf",
  objectKey: "pdfs/paper",
  referenceId: reference.id,
  rights: "private",
  size: 100,
};
const highlight: LibraryHighlight = {
  artifactId: artifact.id,
  comment: "Interpretation",
  createdAt: "created",
  id: "highlight-1",
  page: 2,
  quote: "Evidence",
  rects: [{ height: 1, width: 1, x: 0, y: 0 }],
  referenceId: reference.id,
  updatedAt: "updated",
};
const note: LibraryPdfNote = {
  artifactId: artifact.id,
  body: "Page note",
  createdAt: "created",
  id: "note-1",
  kind: "note",
  page: 3,
  referenceId: reference.id,
  updatedAt: "updated",
  x: 0.2,
  y: 0.3,
};
const drawing: LibraryPdfDrawing = {
  artifactId: artifact.id,
  color: "#000000",
  createdAt: "created",
  id: "drawing-1",
  kind: "drawing",
  page: 4,
  points: [{ x: 0.1, y: 0.2 }],
  referenceId: reference.id,
  updatedAt: "updated",
  width: 4,
};
const library: ReferenceLibrarySnapshot = {
  artifacts: [artifact],
  collections: {},
  highlights: [highlight],
  notes: [],
  pdfMarkups: [note, drawing],
  reading: [],
  referenceKeyStates: { [reference.id]: "final" },
  references: [reference],
  tags: {},
  webSnapshots: [],
  webSources: [],
};

class TestLibraryPdfInspector extends LibraryPdfInspector {
  readonly forms = {
    clearHighlight: vi.fn(),
    clearMarkup: vi.fn(),
    clearNote: vi.fn(),
    empty: false,
    focusHighlightComment: vi.fn(),
    focusNote: vi.fn(),
    highlightOpen: true,
    markupOpen: true,
    noteOpen: true,
    setHighlightContext: vi.fn(),
    showHighlight: vi.fn(),
    showMarkup: vi.fn(),
    showNote: vi.fn(),
  };
  readonly list = { setData: vi.fn() };
  readonly importPanel = { reset: vi.fn(), setContext: vi.fn() };
  readonly project = { setContext: vi.fn() };

  renderForTest() {
    return this.render();
  }

  closeForTest(): void {
    this.close();
  }

  setArtifactForTest(artifactId: string): void {
    this.setArtifact(artifactId);
  }

  showsArtifactForTest(artifactId: string): boolean {
    return this.showsArtifact(artifactId);
  }

  protected override get annotationForms(): LibraryPdfAnnotationForms {
    return this.forms as unknown as LibraryPdfAnnotationForms;
  }

  protected override get annotationList(): LibraryPdfAnnotationList {
    return this.list as unknown as LibraryPdfAnnotationList;
  }

  protected override get highlightImport(): PdfHighlightImportPanel {
    return this.importPanel as unknown as PdfHighlightImportPanel;
  }

  protected override get projectUse(): LibraryPdfProjectUse {
    return this.project as unknown as LibraryPdfProjectUse;
  }
}

describe("library PDF inspector", () => {
  it("registers every child component it owns", () => {
    expect(customElements.get("library-pdf-annotation-forms")).toBeDefined();
    expect(customElements.get("library-pdf-annotation-list")).toBeDefined();
    expect(customElements.get("library-pdf-project-use")).toBeDefined();
    expect(customElements.get("pdf-highlight-import-panel")).toBeDefined();
  });

  it("owns artifact, visibility, status, and inspector presentation", () => {
    const inspector = new TestLibraryPdfInspector();
    inspector.setArtifactForTest("pdf-1");
    inspector.setVisible(true);
    inspector.setStatus("Selection ready.");
    inspector.setInspectorOpen(true);

    expect(inspector.showsArtifactForTest("pdf-1")).toBe(true);
    expect(inspector.showsArtifactForTest("pdf-2")).toBe(false);
    expect(inspector.renderForTest()).toBeDefined();
  });

  it("emits a close intent", () => {
    const inspector = new TestLibraryPdfInspector();
    let closed = false;
    inspector.addEventListener(libraryPdfInspectorCloseEvent, () => {
      closed = true;
    });

    inspector.closeForTest();

    expect(closed).toBe(true);
  });

  it("routes child project mutations through its binding", () => {
    const inspector = new TestLibraryPdfInspector();
    const projectMutations = { applyProjectMutation: vi.fn().mockResolvedValue(undefined) };
    inspector.bindProjectMutations(projectMutations);

    inspector.dispatchEvent(
      new CustomEvent(projectReferenceChangedEvent, { detail: { message: "Reference linked", snapshot: workspaceSnapshotFixture } }),
    );
    inspector.dispatchEvent(
      new CustomEvent(projectResearchChangedEvent, { detail: { message: "Research shared", snapshot: workspaceSnapshotFixture } }),
    );

    expect(projectMutations.applyProjectMutation.mock.calls).toEqual([
      [workspaceSnapshotFixture, "Reference linked"],
      [workspaceSnapshotFixture, "Research shared"],
    ]);
  });

  it("projects one active artifact into its owned child components", () => {
    const inspector = new TestLibraryPdfInspector();
    const context = {
      artifact,
      library,
      projectApiBase: "/api/workspaces/project-1",
      projectReferences: [{ citationAlias: "researcher2026", referenceId: reference.id }],
      researchShares: [],
    };

    expect(inspector.setContext(context)).toEqual({ artifactChanged: true, highlights: [highlight], markups: [note, drawing] });
    expect(inspector.importPanel.reset).toHaveBeenCalledOnce();
    expect(inspector.forms.setHighlightContext).toHaveBeenCalledWith({
      artifactId: artifact.id,
      highlights: [highlight],
      referenceId: reference.id,
    });
    expect(inspector.project.setContext).toHaveBeenCalledWith({
      artifact,
      projectApiBase: context.projectApiBase,
      projectReferences: context.projectReferences,
      references: [reference],
    });
    expect(inspector.list.setData).toHaveBeenCalledWith(
      expect.objectContaining({ artifact, highlights: [highlight], markups: [note, drawing] }),
    );
    expect(inspector.setContext(context).artifactChanged).toBe(false);
    expect(inspector.importPanel.reset).toHaveBeenCalledOnce();
  });

  it("owns highlight, note, markup, and reset presentation", () => {
    const inspector = new TestLibraryPdfInspector();
    inspector.beginHighlight(artifact.id, {
      comment: "",
      highlightId: null,
      page: 2,
      quote: "Evidence",
      rects: highlight.rects,
    });
    inspector.editHighlight(highlight);
    inspector.clearHighlight(5, "Cancelled");
    inspector.beginNote({ artifactId: artifact.id, editingId: null, page: 3, referenceId: reference.id, x: 0.2, y: 0.3 });
    inspector.editNote(note);
    inspector.selectMarkup(drawing);
    inspector.selectMarkup(note);
    inspector.clearNote();
    inspector.clearMarkup();

    expect(inspector.forms.showHighlight).toHaveBeenCalledTimes(2);
    expect(inspector.forms.clearHighlight).toHaveBeenCalledWith(5);
    expect(inspector.forms.showNote).toHaveBeenCalledTimes(2);
    expect(inspector.forms.showMarkup).toHaveBeenCalledTimes(2);
    expect(inspector.forms.focusHighlightComment).toHaveBeenCalledOnce();
    expect(inspector.forms.focusNote).toHaveBeenCalledTimes(2);
    expect(inspector.draftState).toEqual({ highlight: true, markup: true, note: true });
  });
});
