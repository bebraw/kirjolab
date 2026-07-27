import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryHighlight, LibraryPdfArtifact, ProjectReferencePdf, ReferenceLibrarySnapshot } from "../domain/reference-library";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import { AssistantWorkflowStatus } from "./assistant-workflow-status";
import { CandidateListPanel } from "./candidate-list-panel";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { ClaimListPanel } from "./claim-list-panel";
import { ContextResourcePresenter, type ContextResourceSources } from "./context-resource-presenter";
import { LibraryPdfAnnotationToolbar } from "./library-pdf-annotation-toolbar";
import { LibraryPdfInspector } from "./library-pdf-inspector";
import { LibraryPdfMarkupLayer } from "./library-pdf-markup-layer";
import { ManuscriptCommentList } from "./manuscript-comment-list";
import { ProjectAnnotationForm } from "./project-annotation-form";
import { ProjectEvidencePanel } from "./project-evidence-panel";
import { PublicationContextPanel } from "./publication-context-panel";
import { PublicationIntakePanel } from "./publication-intake-panel";
import { PublicationListPanel } from "./publication-list-panel";
import type { ResearchResourceTab } from "./research-context";
import { WorkspaceRailTabs } from "./workspace-rail-tabs";

const libraryPdf: LibraryPdfArtifact = {
  contentType: "application/pdf",
  createdAt: "created",
  fingerprint: "library-fingerprint",
  id: "library/pdf",
  name: "library.pdf",
  objectKey: "library/library.pdf",
  referenceId: "reference:1",
  rights: "private",
  size: 2048,
};
const referencePdf: ProjectReferencePdf = {
  fingerprint: "reference-fingerprint",
  id: "reference/pdf",
  name: "reference.pdf",
  referenceId: "reference:1",
  size: 4096,
};
const highlight = {
  artifactId: libraryPdf.id,
  comment: "Private note",
  createdAt: "created",
  id: "highlight-1",
  page: 2,
  quote: "Quoted evidence",
  rects: [],
  referenceId: "reference:1",
  updatedAt: "updated",
} satisfies LibraryHighlight;
const library: ReferenceLibrarySnapshot = {
  artifacts: [libraryPdf],
  collections: {},
  highlights: [highlight],
  notes: [],
  reading: [],
  referenceKeyStates: {},
  references: [],
  tags: {},
  webSnapshots: [],
  webSources: [],
};

function resourceTab(kind: "pdf" | "library-pdf", id: string): Extract<ResearchResourceTab, { kind: "pdf" | "library-pdf" }> {
  return { focusedAnnotationId: null, id, key: `${kind}:${id}`, kind, page: 1, scrollTop: 0 };
}

function sources(activeTab: ResearchResourceTab | undefined): ContextResourceSources {
  return {
    activeTab,
    candidateDecision: null,
    library,
    projectApiBase: "/api/workspaces/workspace",
    referencePdfs: [referencePdf],
    snapshot: workspaceSnapshotFixture,
    sourceRevision: 3,
    stableDocument: true,
  };
}

function setup() {
  const presenter = new ContextResourcePresenter();
  const elements = {
    "assistant-workflow-status": new AssistantWorkflowStatus(),
    "candidate-list-panel": new CandidateListPanel(),
    "candidate-review-panel": new CandidateReviewPanel(),
    "claim-list-panel": new ClaimListPanel(),
    "library-pdf-annotation-toolbar": new LibraryPdfAnnotationToolbar(),
    "library-pdf-inspector": new LibraryPdfInspector(),
    "paper-markups": new LibraryPdfMarkupLayer(),
    "manuscript-comment-list-panel": new ManuscriptCommentList(),
    "project-annotation-form": new ProjectAnnotationForm(),
    "project-evidence-panel": new ProjectEvidencePanel(),
    "publication-context-panel": new PublicationContextPanel(),
    "publication-intake-panel": new PublicationIntakePanel(),
    "publication-list-panel": new PublicationListPanel(),
    "paper-reader": Object.assign(new HTMLElement(), { scrollTop: 36 }),
    "workspace-rail-tabs": new WorkspaceRailTabs(),
  };
  Object.defineProperty(elements["publication-context-panel"], "querySelector", { configurable: true, value: () => null });
  Object.defineProperty(elements["candidate-review-panel"], "querySelector", { configurable: true, value: () => null });
  vi.spyOn(elements["library-pdf-inspector"], "setContext").mockReturnValue({
    artifactChanged: false,
    highlights: [highlight],
    markups: [],
  });
  Object.defineProperty(presenter, "ownerDocument", {
    value: { getElementById: (id: string) => elements[id as keyof typeof elements] ?? null },
  });
  return { elements, presenter };
}

describe("context resource presenter", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "HTMLElement",
      class {
        scrollTop = 0;
      },
    ),
  );
  afterEach(() => vi.unstubAllGlobals());

  it("presents publication and candidate resources through their Lit owners", () => {
    const { elements, presenter } = setup();
    const setPublication = vi.spyOn(elements["publication-context-panel"], "setPublication").mockReturnValue(true);
    const setCandidate = vi.spyOn(elements["candidate-review-panel"], "setCandidate").mockReturnValue(true);
    const publicationTab = { id: "publication:1", key: "publication:publication:1", kind: "publication", scrollTop: 12 } as const;
    const candidateTab = { id: "candidate:1", key: "candidate:candidate:1", kind: "candidate", scrollTop: 24 } as const;

    expect(presenter.present(sources(publicationTab))).toMatchObject({ publicationPresented: true });
    presenter.present({ ...sources(candidateTab), candidateDecision: { action: "apply", id: candidateTab.id } });

    expect(setPublication).toHaveBeenCalledWith(expect.objectContaining({ publicationId: publicationTab.id }));
    expect(setCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: candidateTab.id, decision: { action: "apply", id: candidateTab.id } }),
    );
  });

  it("switches project, private-Library, and shared-reference PDF presentation", () => {
    const { elements, presenter } = setup();
    const setPdf = vi.spyOn(elements["publication-intake-panel"], "setPdf");
    const setAnnotationVisible = vi.spyOn(elements["project-annotation-form"], "setVisible");
    const setInspectorVisible = vi.spyOn(elements["library-pdf-inspector"], "setVisible");

    expect(presenter.present(sources(resourceTab("pdf", "project/pdf"))).privateHighlights).toBeUndefined();
    expect(presenter.present(sources(resourceTab("library-pdf", libraryPdf.id))).privateHighlights).toEqual([highlight]);
    expect(presenter.present(sources(resourceTab("library-pdf", referencePdf.id))).privateHighlights).toBeUndefined();

    expect(setPdf).toHaveBeenCalledWith("project/pdf", [], []);
    expect(setAnnotationVisible.mock.calls.map(([visible]) => visible)).toEqual([true, false, false]);
    expect(setInspectorVisible.mock.calls.map(([visible]) => visible)).toEqual([false, true, false]);
  });

  it("clears PDF-only presentation when no resource is active", () => {
    const { elements, presenter } = setup();
    const setCitationContext = vi.spyOn(elements["project-annotation-form"], "setCitationContext");

    expect(presenter.present(sources(undefined))).toEqual({
      privateHighlights: undefined,
      publicationPresented: false,
    });
    expect(setCitationContext).toHaveBeenCalledWith(null, []);
  });

  it("reads resource scroll from the owning panel", () => {
    const { elements, presenter } = setup();
    Object.defineProperty(elements["publication-context-panel"], "querySelector", { value: () => ({ scrollTop: 12 }) });
    Object.defineProperty(elements["candidate-review-panel"], "querySelector", { value: () => ({ scrollTop: 24 }) });

    expect(presenter.resourceScrollTop({ id: "publication:1", key: "publication:publication:1", kind: "publication", scrollTop: 0 })).toBe(
      12,
    );
    expect(presenter.resourceScrollTop({ id: "candidate:1", key: "candidate:candidate:1", kind: "candidate", scrollTop: 0 })).toBe(24);
    expect(presenter.resourceScrollTop(resourceTab("pdf", "pdf:1"))).toBe(36);
  });

  it("projects canonical workspace resources across their bounded Lit owners", () => {
    const { elements, presenter } = setup();
    const snapshot = {
      ...workspaceSnapshotFixture,
      annotations: [
        {
          comment: "Evidence",
          createdAt: "created",
          fragments: [],
          id: "annotation-1",
          page: 2,
          pdfId: "pdf-1",
          prefix: "",
          quote: "Quoted evidence",
          rects: [],
          suffix: "",
          updatedAt: "updated",
        },
      ],
    };
    const reconcileEvidence = vi.spyOn(elements["assistant-workflow-status"], "reconcileEvidence");
    const setEvidence = vi.spyOn(elements["project-evidence-panel"], "setEvidence");
    const setPdfs = vi.spyOn(elements["project-annotation-form"], "setPdfs");
    const setWorkspace = vi.spyOn(elements["publication-list-panel"], "setWorkspace");
    const setClaims = vi.spyOn(elements["claim-list-panel"], "setWorkspace");
    const setComments = vi.spyOn(elements["manuscript-comment-list-panel"], "setComments").mockReturnValue(3);
    const setCommentCount = vi.spyOn(elements["workspace-rail-tabs"], "setCommentCount");
    const setCandidates = vi.spyOn(elements["candidate-list-panel"], "setCandidates");

    expect(presenter.presentWorkspace(snapshot, "pdf-1")).toEqual(snapshot.annotations);
    expect(reconcileEvidence).toHaveBeenCalledWith(snapshot.annotations, snapshot.claims);
    expect(setEvidence).toHaveBeenCalledWith(snapshot, expect.any(Set));
    expect(setPdfs).toHaveBeenCalledWith(snapshot.pdfs, "pdf-1");
    expect(setWorkspace).toHaveBeenCalledWith(snapshot);
    expect(setClaims).toHaveBeenCalledWith(snapshot, expect.any(Set));
    expect(setComments).toHaveBeenCalledWith(snapshot.comments);
    expect(setCommentCount).toHaveBeenCalledWith(3);
    expect(setCandidates).toHaveBeenCalledWith(snapshot.candidates);
    expect(presenter.presentWorkspace(snapshot, undefined)).toEqual([]);
  });

  it("owns private-PDF inspector, markup reset, and toolbar presentation", () => {
    const { elements, presenter } = setup();
    const inspector = elements["library-pdf-inspector"];
    const toolbar = elements["library-pdf-annotation-toolbar"];
    const markups = elements["paper-markups"];
    vi.mocked(inspector.setContext).mockReturnValue({ artifactChanged: true, highlights: [highlight], markups: [] });
    const cancelShapeRecognition = vi.spyOn(markups, "cancelShapeRecognition").mockImplementation(() => undefined);
    const resetState = vi.spyOn(markups, "resetState").mockImplementation(() => undefined);
    const setInspectorOpen = vi.spyOn(inspector, "setInspectorOpen");
    const setToolbarOpen = vi.spyOn(toolbar, "setInspectorOpen");
    const setAnnotationAvailability = vi.spyOn(toolbar, "setAnnotationAvailability");
    const setExportArtifact = vi.spyOn(toolbar, "setExportArtifact");

    expect(presenter.present(sources(resourceTab("library-pdf", libraryPdf.id))).privateHighlights).toEqual([highlight]);
    expect(inspector.setContext).toHaveBeenCalledWith(
      expect.objectContaining({ artifact: libraryPdf, library, projectApiBase: "/api/workspaces/workspace" }),
    );
    expect(cancelShapeRecognition).toHaveBeenCalledOnce();
    expect(resetState).toHaveBeenCalledOnce();
    expect(setInspectorOpen).toHaveBeenCalledWith(false);
    expect(setToolbarOpen).toHaveBeenCalledWith(false);
    expect(setAnnotationAvailability).toHaveBeenCalledWith(1);
    expect(setExportArtifact).toHaveBeenCalledWith(libraryPdf);
  });

  it("owns page-local private markup and toolbar undo presentation", () => {
    const { elements, presenter } = setup();
    const setLibraryPage = vi.spyOn(elements["paper-markups"], "setLibraryPage").mockReturnValue([]);
    const setUndoDrawings = vi.spyOn(elements["library-pdf-annotation-toolbar"], "setUndoDrawings");

    presenter.presentLibraryPdfPage(libraryPdf, library, 2);

    expect(setLibraryPage).toHaveBeenCalledWith(libraryPdf, [], 2, elements["library-pdf-annotation-toolbar"].drawingStyle);
    expect(setUndoDrawings).toHaveBeenCalledWith([]);
  });

  it("coordinates private-PDF tools while returning viewer-only effects", () => {
    const { elements, presenter } = setup();
    const markups = elements["paper-markups"];
    const inspector = elements["library-pdf-inspector"];
    const toolbar = elements["library-pdf-annotation-toolbar"];
    const chooseTool = vi.spyOn(markups, "chooseTool").mockImplementation(() => undefined);
    const clearNote = vi.spyOn(inspector, "clearNote").mockImplementation(() => undefined);
    const clearMarkup = vi.spyOn(inspector, "clearMarkup").mockImplementation(() => undefined);
    const setStatus = vi.spyOn(inspector, "setStatus");
    vi.spyOn(inspector, "draftState", "get").mockReturnValue({ highlight: false, markup: false, note: false });
    const setInspectorOpen = vi.spyOn(inspector, "setInspectorOpen");
    const setToolbarOpen = vi.spyOn(toolbar, "setInspectorOpen");

    expect(presenter.chooseLibraryPdfTool("text")).toEqual({
      privateHighlightId: null,
      privateHighlightSelection: false,
      textSelectionEnabled: true,
    });

    expect(chooseTool).toHaveBeenCalledWith("text");
    expect(clearNote).toHaveBeenCalledOnce();
    expect(clearMarkup).toHaveBeenCalledOnce();
    expect(setStatus).toHaveBeenCalledWith("Select text to highlight.");
    expect(setInspectorOpen).toHaveBeenCalledWith(false);
    expect(setToolbarOpen).toHaveBeenCalledWith(false);
  });

  it("owns private-PDF draft clearing and exposes markup selection state", () => {
    const { elements, presenter } = setup();
    const markups = elements["paper-markups"];
    const inspector = elements["library-pdf-inspector"];
    vi.spyOn(markups, "tool", "get").mockReturnValue("select");
    const clearNote = vi.spyOn(markups, "clearNote");
    const clearSelection = vi.spyOn(markups, "clearSelection");
    const clearInspectorNote = vi.spyOn(inspector, "clearNote").mockImplementation(() => undefined);
    const clearInspectorMarkup = vi.spyOn(inspector, "clearMarkup").mockImplementation(() => undefined);

    presenter.clearLibraryPdfNoteDraft();
    expect(presenter.clearLibraryPdfMarkupSelection()).toBe(true);

    expect(clearNote).toHaveBeenCalledOnce();
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(clearInspectorNote).toHaveBeenCalledOnce();
    expect(clearInspectorMarkup).toHaveBeenCalledOnce();
  });

  it("closes private-PDF drafts and returns viewer-only cleanup", () => {
    const { elements, presenter } = setup();
    const markups = elements["paper-markups"];
    const inspector = elements["library-pdf-inspector"];
    const toolbar = elements["library-pdf-annotation-toolbar"];
    vi.spyOn(markups, "tool", "get").mockReturnValue("select");
    vi.spyOn(inspector, "draftState", "get").mockReturnValue({ highlight: true, markup: true, note: true });
    const clearHighlight = vi.spyOn(inspector, "clearHighlight").mockImplementation(() => undefined);
    const clearNote = vi.spyOn(inspector, "clearNote").mockImplementation(() => undefined);
    const clearMarkup = vi.spyOn(inspector, "clearMarkup").mockImplementation(() => undefined);
    const focusInspectorButton = vi.spyOn(toolbar, "focusInspectorButton").mockImplementation(() => undefined);

    expect(presenter.closeLibraryPdfInspector(3)).toEqual({
      clearDraftSelection: true,
      privateHighlightSelection: true,
    });

    expect(clearHighlight).toHaveBeenCalledWith(3, "Selection cancelled. Nothing was saved.");
    expect(clearNote).toHaveBeenCalledOnce();
    expect(clearMarkup).toHaveBeenCalledOnce();
    expect(focusInspectorButton).toHaveBeenCalledOnce();
  });
});
