import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BibliographicRecord,
  LibraryHighlight,
  LibraryPdfArtifact,
  LibraryPdfNote,
  ProjectReferencePdf,
  ReferenceLibrarySnapshot,
} from "../domain/reference-library";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import type { AnnotationResource, PdfResource, ProjectReferenceLink, WorkspaceSnapshot } from "../domain/workspace";
import { AssistantWorkflowStatus } from "./assistant-workflow-status";
import { CandidateListPanel } from "./candidate-list-panel";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { ClaimListPanel } from "./claim-list-panel";
import { ContextResourcePresenter, type ContextResourceSources, type LibraryPdfCoordinator } from "./context-resource-presenter";
import { ContextTabStrip } from "./context-tab-strip";
import { LibraryPdfAnnotationToolbar } from "./library-pdf-annotation-toolbar";
import { LibraryPdfInspector } from "./library-pdf-inspector";
import { LibraryPdfMarkupLayer } from "./library-pdf-markup-layer";
import { ManuscriptCommentList } from "./manuscript-comment-list";
import { ProjectAnnotationForm } from "./project-annotation-form";
import { ProjectEvidencePanel } from "./project-evidence-panel";
import { PublicationContextPanel } from "./publication-context-panel";
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
const reference = {
  abstract: "",
  archivedAt: null,
  authors: ["Doe, Jane"],
  createdAt: "created",
  deletedAt: null,
  doi: "",
  id: highlight.referenceId,
  provenance: {},
  referenceKey: "doe2026",
  title: "Source",
  type: "article-journal",
  updatedAt: "updated",
  url: "",
  venue: "",
  year: "2026",
} satisfies BibliographicRecord;
const note = {
  artifactId: libraryPdf.id,
  body: "Page note",
  createdAt: "created",
  id: "note-1",
  kind: "note",
  page: 3,
  referenceId: "reference:1",
  updatedAt: "updated",
  x: 0.2,
  y: 0.3,
} satisfies LibraryPdfNote;
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
    "context-tab-strip": new ContextTabStrip(),
    "library-pdf-annotation-toolbar": new LibraryPdfAnnotationToolbar(),
    "library-pdf-inspector": new LibraryPdfInspector(),
    "paper-markups": new LibraryPdfMarkupLayer(),
    "manuscript-comment-list-panel": new ManuscriptCommentList(),
    "project-annotation-form": new ProjectAnnotationForm(),
    "project-evidence-panel": new ProjectEvidencePanel(),
    "publication-context-panel": new PublicationContextPanel(),
    "publication-list-panel": new PublicationListPanel(),
    "paper-reader": Object.assign(new HTMLElement(), { scrollTop: 36 }),
    "workspace-rail-tabs": new WorkspaceRailTabs(),
  };
  Object.defineProperty(elements["publication-context-panel"], "querySelector", { configurable: true, value: () => null });
  Object.defineProperty(elements["candidate-review-panel"], "querySelector", { configurable: true, value: () => null });
  Object.defineProperty(elements["project-annotation-form"], "querySelector", { configurable: true, value: () => null });
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

  it("composes canonical tabs and the active resource presentation", () => {
    const { elements, presenter } = setup();
    const tab = resourceTab("pdf", "project/pdf");
    const setTabs = vi.spyOn(elements["context-tab-strip"], "setTabs").mockImplementation(() => undefined);
    const present = vi.spyOn(presenter, "present").mockReturnValue({ publicationPresented: false });

    const presentation = presenter.presentContext({
      ...sources(undefined),
      context: { activeKey: tab.key, tabs: [{ kind: "preview", key: "preview", scrollTop: 0 }, tab] },
      standaloneLibrary: false,
    });

    expect(setTabs).toHaveBeenCalledWith(
      expect.objectContaining({
        activeKey: tab.key,
        libraryArtifacts: [libraryPdf],
        referencePdfs: [referencePdf],
        tabs: expect.arrayContaining([tab]),
      }),
    );
    expect(present).toHaveBeenCalledWith(expect.objectContaining({ activeTab: tab }));
    expect(presentation.activeTab).toBe(tab);
    expect(presenter.activeTab).toBe(tab);
  });

  it("loads and validates the linked-reference PDF catalog", async () => {
    const { presenter } = setup();

    await presenter.refreshReferencePdfs("/api/workspaces/workspace", async () => Response.json([referencePdf]));
    expect(presenter.referencePdfs).toEqual([referencePdf]);
    await expect(
      presenter.refreshReferencePdfs("/api/workspaces/workspace", async () => Response.json([{ id: "incomplete" }])),
    ).rejects.toThrow("Project reference PDFs returned invalid metadata");
    await presenter.refreshReferencePdfs(null);
    expect(presenter.referencePdfs).toEqual([]);
  });

  it("switches project, private-Library, and shared-reference PDF presentation", () => {
    const { elements, presenter } = setup();
    const setPdf = vi.spyOn(elements["project-annotation-form"], "setIntakePdf").mockImplementation(() => undefined);
    const setAnnotationVisible = vi.spyOn(elements["project-annotation-form"], "setVisible");
    const setInspectorVisible = vi.spyOn(elements["library-pdf-inspector"], "setVisible");
    const beginHighlight = vi.spyOn(elements["library-pdf-inspector"], "beginHighlight").mockImplementation(() => undefined);

    presenter.present(sources(resourceTab("pdf", "project/pdf")));
    presenter.present(sources(resourceTab("library-pdf", libraryPdf.id)));
    presenter.capturePdfSelection({ page: 2, prefix: "", quote: "Evidence", rects: [], suffix: "" });
    expect(beginHighlight).toHaveBeenCalledWith(libraryPdf.id, {
      comment: "",
      highlightId: null,
      page: 2,
      quote: "Evidence",
      rects: [],
    });
    presenter.present(sources(resourceTab("library-pdf", referencePdf.id)));

    expect(setPdf).toHaveBeenCalledWith("project/pdf", [], []);
    expect(setAnnotationVisible.mock.calls.map(([visible]) => visible)).toEqual([true, false, false]);
    expect(setInspectorVisible.mock.calls.map(([visible]) => visible)).toEqual([false, true, false]);
  });

  it("clears PDF-only presentation when no resource is active", () => {
    const { elements, presenter } = setup();
    const setCitationContext = vi.spyOn(elements["project-annotation-form"], "setCitationContext");

    expect(presenter.present(sources(undefined))).toEqual({ publicationPresented: false });
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

  it("captures fixed and active PDF presentation state", () => {
    const { elements, presenter } = setup();
    const pdfTab = resourceTab("pdf", "pdf:1");
    const state = { activeKey: pdfTab.key, tabs: [{ kind: "preview", key: "preview", scrollTop: 0 } as const, pdfTab] };
    vi.spyOn(elements["context-tab-strip"], "fixedScrollTop").mockReturnValue(null);
    vi.spyOn(presenter, "resourceScrollTop").mockReturnValue(48);

    const captured = presenter.captureContext(state, {
      focusedAnnotationId: "annotation:1",
      page: 3,
      renderedContextKey: pdfTab.key,
    });

    expect(captured.tabs.find(({ key }) => key === pdfTab.key)).toMatchObject({
      focusedAnnotationId: "annotation:1",
      page: 3,
      scrollTop: 48,
    });

    vi.spyOn(elements["context-tab-strip"], "fixedScrollTop").mockReturnValue(24);
    const fixed = presenter.captureContext(
      { activeKey: "preview", tabs: [{ kind: "preview", key: "preview", scrollTop: 0 }] },
      { focusedAnnotationId: null, page: 1, renderedContextKey: undefined },
    );
    expect(fixed.tabs[0]?.scrollTop).toBe(24);
  });

  it("loads and retains the active project PDF through its bound viewer", async () => {
    const { elements, presenter } = setup();
    const pdf = {
      contentType: "application/pdf",
      createdAt: "created",
      fingerprint: "project-fingerprint",
      id: "project/pdf",
      name: "project.pdf",
      objectKey: "pdfs/project.pdf",
      size: 1024,
    } satisfies PdfResource;
    const annotation = {
      comment: "Evidence",
      createdAt: "created",
      fragments: [],
      id: "annotation:1",
      page: 2,
      pdfId: pdf.id,
      prefix: "",
      quote: "Quoted evidence",
      rects: [],
      suffix: "",
      updatedAt: "updated",
    } satisfies AnnotationResource;
    const tab = { ...resourceTab("pdf", pdf.id), focusedAnnotationId: annotation.id, page: 2, scrollTop: 24 };
    const project = { ...workspaceSnapshotFixture, annotations: [annotation], pdfs: [pdf] };
    const viewer = {
      currentPage: 3,
      focusedAnnotationId: annotation.id,
      open: vi.fn().mockResolvedValue(true),
      showError: vi.fn(),
      updateAnnotations: vi.fn(),
      updatePrivateHighlights: vi.fn(),
    };
    const capture = { page: 2, prefix: "Before", quote: "Evidence", rects: [], suffix: "After" };
    const persistCapture = vi.spyOn(elements["project-annotation-form"], "persistCapture").mockResolvedValue(undefined);
    const activateHighlight = vi.spyOn(elements["project-annotation-form"], "activateHighlight").mockResolvedValue(undefined);
    const selectPdf = vi.spyOn(elements["project-annotation-form"], "selectPdf");
    const showCapture = vi.spyOn(elements["project-annotation-form"], "showCapture");
    presenter.bindPdfViewer(viewer, "/api/workspaces/workspace");
    presenter.present({ ...sources(tab), snapshot: project });

    await presenter.loadActivePdf(false);

    expect(selectPdf).toHaveBeenCalledWith(pdf.id);
    expect(viewer.updateAnnotations).toHaveBeenCalledWith([annotation]);
    expect(viewer.open).toHaveBeenCalledWith({
      annotations: [annotation],
      focusAnnotationId: annotation.id,
      mode: "evidence",
      page: 2,
      privateHighlights: [],
      url: "/api/workspaces/workspace/pdfs/project%2Fpdf",
    });
    expect(elements["paper-reader"].scrollTop).toBe(24);
    expect(presenter.presentWorkspace(project)).toEqual([annotation]);
    presenter.capturePdfSelection(capture);
    expect(showCapture).toHaveBeenCalledWith(capture);
    expect(persistCapture).toHaveBeenCalledWith(project.annotations, pdf.id, capture);
    presenter.activateProjectHighlight(annotation.id, "fragment-1");
    expect(activateHighlight).toHaveBeenCalledWith(project.annotations, annotation.id, "fragment-1");

    const state = { activeKey: tab.key, tabs: [tab] };
    expect(presenter.captureBoundContext(state).tabs[0]).toMatchObject({ focusedAnnotationId: annotation.id, page: 3 });
    await presenter.loadActivePdf(false);
    expect(viewer.open).toHaveBeenCalledOnce();
  });

  it("presents active PDF loading failures only while the resource remains active", async () => {
    const { presenter } = setup();
    const viewer = {
      currentPage: 1,
      focusedAnnotationId: null,
      open: vi.fn().mockRejectedValue(new Error("Could not open PDF")),
      showError: vi.fn(),
      updateAnnotations: vi.fn(),
      updatePrivateHighlights: vi.fn(),
    };
    presenter.bindPdfViewer(viewer, "/api/workspaces/workspace");
    presenter.present(sources(resourceTab("library-pdf", libraryPdf.id)));

    await presenter.loadActivePdf(true);

    expect(viewer.showError).toHaveBeenCalledWith(expect.objectContaining({ message: "Could not open PDF" }));
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

  it("derives research-context authorization from canonical resources", () => {
    const { presenter } = setup();

    expect(presenter.resourceAuthorization(workspaceSnapshotFixture, library, [referencePdf])).toEqual({
      publicationIds: new Set(workspaceSnapshotFixture.publications.map(({ id }) => id)),
      pdfIds: new Set(workspaceSnapshotFixture.pdfs.map(({ id }) => id)),
      libraryPdfIds: new Set([...library.artifacts.map(({ id }) => id), referencePdf.id]),
      candidateIds: new Set(workspaceSnapshotFixture.candidates.map(({ id }) => id)),
    });
    expect(presenter.resourceAuthorization(null, null, [])).toEqual({
      publicationIds: new Set(),
      pdfIds: new Set(),
      libraryPdfIds: new Set(),
      candidateIds: new Set(),
    });
  });

  it("restores resource routes through canonical lookups and typed effects", async () => {
    const { elements, presenter } = setup();
    const publication = {
      abstract: "",
      authors: ["Ada Author"],
      citationKey: "Author2026",
      createdAt: "created",
      doi: "",
      id: "publication:route",
      metadataSource: "crossref" as const,
      title: "Route source",
      type: "article",
      updatedAt: "updated",
      url: "",
      venue: "Journal",
      year: "2026",
    };
    const showAnnotation = vi.spyOn(elements["project-annotation-form"], "showAnnotation");
    const pdf = {
      contentType: "application/pdf" as const,
      createdAt: "created",
      fingerprint: "route-fingerprint",
      id: "pdf:route",
      name: "route.pdf",
      objectKey: "pdfs/route.pdf",
      size: 1024,
    };
    const annotation = {
      comment: "Route note",
      createdAt: "created",
      fragments: [],
      id: "annotation:route",
      page: 3,
      pdfId: pdf.id,
      prefix: "",
      quote: "Route evidence",
      rects: [],
      suffix: "",
      updatedAt: "updated",
    };
    const candidate = {
      createdAt: "created",
      evidence: [],
      id: "candidate:route",
      instruction: "Draft a claim",
      model: "local-model",
      operation: "draft-claim" as const,
      promptVersion: "draft-claim-v1" as const,
      proposedNote: "",
      proposedText: "Claim",
      providerAdapter: "openai-compatible" as const,
      providerLabel: "Local",
      relation: "supports" as const,
      status: "pending" as const,
    };
    const project = {
      ...workspaceSnapshotFixture,
      annotations: [annotation],
      candidates: [candidate],
      pdfs: [pdf],
      publicationPdfLinks: [{ createdAt: "created", id: "link:route", pdfId: pdf.id, publicationId: publication.id }],
      publications: [publication],
    };
    let currentLibrary: ReferenceLibrarySnapshot | null = null;
    const coordinator = {
      library: vi.fn(() => currentLibrary),
      openCandidate: vi.fn(),
      openLibraryPdf: vi.fn().mockResolvedValue(undefined),
      openProjectPdf: vi.fn().mockResolvedValue(undefined),
      openPublication: vi.fn(),
      openReferencePdf: vi.fn().mockResolvedValue(undefined),
      project: vi.fn(() => project),
      referencePdfs: vi.fn(() => [referencePdf]),
      refreshLibrary: vi.fn(async () => {
        currentLibrary = library;
      }),
    };
    presenter.bindRoutes(coordinator);

    await presenter.restoreTarget({ kind: "publication", id: publication.id });
    await presenter.restoreTarget({ kind: "pdf", id: pdf.id }, 4, "annotation-1");
    await presenter.restoreTarget({ kind: "candidate", id: candidate.id });
    await presenter.restoreTarget({ kind: "library-pdf", id: libraryPdf.id }, 5);
    await presenter.restoreTarget({ kind: "library-pdf", id: referencePdf.id }, 6);
    await presenter.restoreTarget({ kind: "publication", id: "missing" });
    presenter.openProjectAnnotation(annotation.id, true);
    await presenter.openPublicationPaper({ kind: "project", pdf, linkId: "link:route" });
    await presenter.openPublicationPaper({ kind: "library", artifact: libraryPdf });
    await presenter.openPublicationPaper({ kind: "reference", pdf: referencePdf });
    expect(presenter.openCitation({ keys: ["author2026"], locator: "p. 7" })).toBeNull();
    expect(presenter.openCitation({ keys: ["Author2026"] })).toBeNull();

    expect(coordinator.openPublication).toHaveBeenCalledWith(publication);
    expect(coordinator.openProjectPdf).toHaveBeenCalledWith(pdf, 4, "annotation-1");
    expect(coordinator.openProjectPdf).toHaveBeenCalledWith(pdf, 7);
    expect(coordinator.openProjectPdf).toHaveBeenCalledWith(pdf, annotation.page, annotation.id);
    expect(coordinator.openProjectPdf).toHaveBeenCalledWith(pdf);
    expect(showAnnotation).toHaveBeenCalledWith(annotation);
    expect(coordinator.openCandidate).toHaveBeenCalledWith(candidate);
    expect(coordinator.refreshLibrary).toHaveBeenCalledOnce();
    expect(coordinator.openLibraryPdf).toHaveBeenCalledWith(libraryPdf, 5);
    expect(coordinator.openLibraryPdf).toHaveBeenCalledWith(libraryPdf);
    expect(coordinator.openReferencePdf).toHaveBeenCalledWith(referencePdf, 6);
    expect(coordinator.openReferencePdf).toHaveBeenCalledWith(referencePdf);
    expect(presenter.openCitation({ keys: ["one", "two"] })).toBe("Open this grouped citation from Preview to choose a reference.");
    expect(presenter.openCitation({ keys: ["missing"] })).toBe("No publication resource is available for missing.");
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

    presenter.present(sources(resourceTab("library-pdf", libraryPdf.id)));
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

    const tab = resourceTab("library-pdf", libraryPdf.id);
    presenter.present(sources(tab));
    const presentation = presenter.presentPdfPage({ activeKey: tab.key, tabs: [tab] }, 2);

    expect(setLibraryPage).toHaveBeenCalledWith(libraryPdf, [], 2, elements["library-pdf-annotation-toolbar"].drawingStyle);
    expect(setUndoDrawings).toHaveBeenCalledWith([]);
    expect(presentation).toMatchObject({ activePdf: true, libraryPdfId: libraryPdf.id });
    expect(presentation.context.tabs[0]).toMatchObject({ page: 2 });
  });

  it("leaves canonical context unchanged when a PDF is not active", () => {
    const { presenter } = setup();
    const state = { activeKey: "preview" as const, tabs: [] };
    presenter.present(sources(undefined));

    expect(presenter.presentPdfPage(state, 2)).toEqual({ activePdf: false, context: state, libraryPdfId: undefined });
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

  it("coordinates private-PDF highlight and note editing", () => {
    const { elements, presenter } = setup();
    const markups = elements["paper-markups"];
    const inspector = elements["library-pdf-inspector"];
    vi.spyOn(markups, "tool", "get").mockReturnValue("select");
    const selectHighlight = vi.spyOn(markups, "selectHighlight");
    const editMarkupNote = vi.spyOn(markups, "editNote").mockImplementation(() => undefined);
    const editHighlight = vi.spyOn(inspector, "editHighlight").mockImplementation(() => undefined);
    const editNote = vi.spyOn(inspector, "editNote").mockImplementation(() => undefined);

    expect(presenter.editLibraryHighlight(highlight)).toEqual({
      clearDraftSelection: false,
      privateHighlightId: highlight.id,
      privateHighlightSelection: true,
    });
    expect(presenter.editLibraryPdfNote(note)).toEqual({ clearDraftSelection: false });

    expect(selectHighlight).toHaveBeenCalledWith(highlight.id);
    expect(editHighlight).toHaveBeenCalledWith(highlight);
    expect(editMarkupNote).toHaveBeenCalledWith(note);
    expect(editNote).toHaveBeenCalledWith(note);
  });

  it("coordinates private-PDF markup selection and highlight-draft cleanup", () => {
    const { elements, presenter } = setup();
    const markups = elements["paper-markups"];
    const inspector = elements["library-pdf-inspector"];
    vi.spyOn(inspector, "draftState", "get").mockReturnValue({ highlight: true, markup: false, note: false });
    const clearHighlight = vi.spyOn(inspector, "clearHighlight").mockImplementation(() => undefined);
    const selectMarkup = vi.spyOn(markups, "selectMarkup");
    const selectInspectorMarkup = vi.spyOn(inspector, "selectMarkup").mockImplementation(() => undefined);

    expect(presenter.selectLibraryPdfMarkup(note, 3)).toEqual({
      clearDraftSelection: true,
      privateHighlightSelection: true,
    });

    expect(clearHighlight).toHaveBeenCalledWith(3, "Selection cancelled. Nothing was saved.");
    expect(selectMarkup).toHaveBeenCalledWith(note.id);
    expect(selectInspectorMarkup).toHaveBeenCalledWith(note);
  });

  it("owns private-PDF highlight and note draft composition", () => {
    const { elements, presenter } = setup();
    const inspector = elements["library-pdf-inspector"];
    const beginHighlight = vi.spyOn(inspector, "beginHighlight").mockImplementation(() => undefined);
    const beginNote = vi.spyOn(inspector, "beginNote").mockImplementation(() => undefined);
    const capture = {
      page: 4,
      prefix: "Before",
      quote: "Selected passage",
      rects: [{ height: 0.1, width: 0.2, x: 0.3, y: 0.4 }],
      suffix: "After",
    };
    const draft = { artifactId: libraryPdf.id, editingId: null, page: 4, referenceId: "reference:1", x: 0.2, y: 0.3 };

    presenter.beginLibraryHighlight(libraryPdf.id, capture);
    presenter.beginLibraryPdfNote(draft);

    expect(beginHighlight).toHaveBeenCalledWith(libraryPdf.id, {
      comment: "",
      highlightId: null,
      page: 4,
      quote: "Selected passage",
      rects: capture.rects,
    });
    expect(beginNote).toHaveBeenCalledWith(draft);
  });

  it("routes private-PDF sibling events through the bounded coordinator", async () => {
    const { elements, presenter } = setup();
    const coordinator = {
      acceptProjectMutation: vi.fn(async () => undefined),
      applyViewerPresentation: vi.fn(),
      canInsertCitation: vi.fn(() => true),
      clearViewerDraftSelection: vi.fn(),
      completeMarkup: vi.fn(),
      currentPage: vi.fn(() => 3),
      insertCitation: vi.fn(),
      library: vi.fn(() => library),
      openHighlight: vi.fn(),
      openPdf: vi.fn(),
      project: vi.fn(() => workspaceSnapshotFixture),
      projectApiBase: "/api/workspaces/workspace",
      refreshLibrary: vi.fn(async () => undefined),
      showToast: vi.fn(),
    };
    vi.spyOn(elements["paper-markups"], "chooseTool").mockImplementation(() => undefined);
    vi.spyOn(elements["library-pdf-inspector"], "clearNote").mockImplementation(() => undefined);
    vi.spyOn(elements["library-pdf-inspector"], "clearMarkup").mockImplementation(() => undefined);
    vi.spyOn(elements["library-pdf-inspector"], "draftState", "get").mockReturnValue({ highlight: false, markup: false, note: false });
    presenter.bindLibraryPdf(coordinator);

    elements["library-pdf-annotation-toolbar"].dispatchEvent(
      new CustomEvent("library-pdf-toolbar-action", { detail: { action: "choose-tool", tool: "text" } }),
    );
    elements["paper-markups"].dispatchEvent(new CustomEvent("library-pdf-markup-action", { detail: { action: "drawing-saved" } }));
    elements["library-pdf-inspector"].dispatchEvent(
      new CustomEvent("library-pdf-annotation-list-action", { detail: { action: "open-highlight", highlight } }),
    );
    elements["library-pdf-inspector"].dispatchEvent(
      new CustomEvent("library-pdf-annotation-action", { detail: { action: "highlight-saved", kind: "created" } }),
    );

    expect(coordinator.applyViewerPresentation).toHaveBeenCalledWith({
      privateHighlightId: null,
      privateHighlightSelection: false,
      textSelectionEnabled: true,
    });
    expect(coordinator.completeMarkup).toHaveBeenCalledWith("Drawing saved privately.");
    expect(coordinator.openHighlight).toHaveBeenCalledWith(highlight);
    await vi.waitFor(() => expect(coordinator.refreshLibrary).toHaveBeenCalledOnce());
    expect(coordinator.clearViewerDraftSelection).toHaveBeenCalledOnce();
    expect(coordinator.showToast).toHaveBeenCalledWith("Private highlight saved to your library.");
  });

  it("owns existing and collision-safe project-reference preparation before citing a highlight", async () => {
    const { presenter } = setup();
    const existingProjectReference = {
      citationAlias: reference.referenceKey,
      createdAt: "created",
      id: "project-reference-1",
      referenceId: reference.id,
      snapshot: {
        authors: reference.authors,
        capturedAt: "created",
        doi: reference.doi,
        referenceId: reference.id,
        title: reference.title,
        tombstone: false,
        type: reference.type,
        url: reference.url,
        venue: reference.venue,
        webSnapshot: null,
        year: reference.year,
      },
      updatedAt: "updated",
    } satisfies ProjectReferenceLink;
    const project = vi.fn<() => WorkspaceSnapshot | null>(() => ({
      ...workspaceSnapshotFixture,
      projectReferences: [existingProjectReference],
    }));
    const librarySource = vi.fn<() => ReferenceLibrarySnapshot | null>(() => ({ ...library, references: [reference] }));
    const coordinator = {
      acceptProjectMutation: vi.fn(async () => undefined),
      applyViewerPresentation: vi.fn(),
      canInsertCitation: vi.fn(() => true),
      clearViewerDraftSelection: vi.fn(),
      completeMarkup: vi.fn(),
      currentPage: vi.fn(() => 3),
      insertCitation: vi.fn(),
      library: librarySource,
      openHighlight: vi.fn(),
      openPdf: vi.fn(),
      project,
      projectApiBase: "/api/workspaces/workspace",
      refreshLibrary: vi.fn(async () => undefined),
      showToast: vi.fn(),
    } satisfies LibraryPdfCoordinator;
    presenter.bindLibraryPdf(coordinator);

    await presenter.citeLibraryHighlight(highlight);

    expect(coordinator.insertCitation).toHaveBeenCalledWith("doe2026", "p. 2");
    expect(coordinator.acceptProjectMutation).not.toHaveBeenCalled();

    const linked = { ...existingProjectReference, citationAlias: "doe2026a" };
    const snapshot = { ...workspaceSnapshotFixture, projectReferences: [linked] };
    project.mockReturnValue({ ...workspaceSnapshotFixture, projectReferences: [{ ...existingProjectReference, referenceId: "other" }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(snapshot)));
    coordinator.insertCitation.mockClear();

    await presenter.citeLibraryHighlight(highlight);

    expect(fetch).toHaveBeenCalledWith("/api/workspaces/workspace/references", {
      body: JSON.stringify({ referenceId: reference.id, citationAlias: "doe2026a" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(coordinator.acceptProjectMutation).toHaveBeenCalledWith(snapshot);
    expect(coordinator.insertCitation).toHaveBeenCalledWith("doe2026a", "p. 2");
  });

  it("contains unavailable highlight citation feedback", async () => {
    const { presenter } = setup();
    const librarySource = vi.fn<() => ReferenceLibrarySnapshot | null>(() => ({ ...library, references: [reference] }));
    const coordinator = {
      acceptProjectMutation: vi.fn(async () => undefined),
      applyViewerPresentation: vi.fn(),
      canInsertCitation: vi.fn(() => false),
      clearViewerDraftSelection: vi.fn(),
      completeMarkup: vi.fn(),
      currentPage: vi.fn(() => 3),
      insertCitation: vi.fn(),
      library: librarySource,
      openHighlight: vi.fn(),
      openPdf: vi.fn(),
      project: vi.fn(() => workspaceSnapshotFixture),
      projectApiBase: "/api/workspaces/workspace",
      refreshLibrary: vi.fn(async () => undefined),
      showToast: vi.fn(),
    } satisfies LibraryPdfCoordinator;
    presenter.bindLibraryPdf(coordinator);

    await presenter.citeLibraryHighlight(highlight);
    expect(coordinator.showToast).toHaveBeenLastCalledWith("Place the manuscript caret before citing a highlight.");

    coordinator.canInsertCitation.mockReturnValue(true);
    librarySource.mockReturnValue(library);
    await presenter.citeLibraryHighlight(highlight);
    expect(coordinator.showToast).toHaveBeenLastCalledWith("The highlighted source is no longer available in the library.");
    expect(coordinator.insertCitation).not.toHaveBeenCalled();
  });
});
