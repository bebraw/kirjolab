import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createManuscriptAnchor, toManuscriptAnchorSelector } from "../domain/manuscript-anchor";
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
import { ContextResourcePresenter, type ContextResourceSources, type ResearchContextSources } from "./context-resource-presenter";
import { ContextTabStrip } from "./context-tab-strip";
import { LibraryPdfAnnotationToolbar } from "./library-pdf-annotation-toolbar";
import { LibraryPdfInspector } from "./library-pdf-inspector";
import { LibraryPdfMarkupLayer } from "./library-pdf-markup-layer";
import { ManuscriptCommentList, type ManuscriptCommentAuthoring } from "./manuscript-comment-list";
import { ProjectAnnotationForm } from "./project-annotation-form";
import { ProjectEvidencePanel } from "./project-evidence-panel";
import { ProjectMapWorkspace } from "./project-map-workspace";
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
    library,
    projectApiBase: "/api/workspaces/workspace",
    referencePdfs: [referencePdf],
    snapshot: workspaceSnapshotFixture,
  };
}

function standaloneLibraryRoutes() {
  return { pushPdfRoute: vi.fn(), replaceLibraryRoute: vi.fn(), replacePdfRoute: vi.fn() };
}

interface TestContextBinding {
  readonly activateSurface: () => void;
  readonly citationAvailable: () => boolean;
  readonly openLibrary: (updateHistory?: boolean) => Promise<void>;
  readonly refreshAssistant: () => void;
  readonly restorePaneWidth: () => void;
  readonly sources: () => ResearchContextSources;
  readonly standaloneLibraryRoutes: ReturnType<typeof standaloneLibraryRoutes>;
  readonly syncRoute: (mode: "push" | "replace") => void;
}

function contextBinding(options: TestContextBinding): Parameters<ContextResourcePresenter["bindContext"]> {
  const source = options.sources;
  return [
    source().standaloneLibrary ? null : source().projectApiBase,
    { restorePaneWidth: options.restorePaneWidth },
    {
      assistantGenerationPresenter: { refreshAvailability: options.refreshAssistant },
      editorStatus: {
        get caret() {
          return options.citationAvailable() ? 0 : null;
        },
      },
      referenceLibraryWorkspace: {
        get snapshot() {
          return source().library;
        },
        open: options.openLibrary,
        ...options.standaloneLibraryRoutes,
      },
      projectFileDialog: {
        get project() {
          return source().snapshot;
        },
      },
      workspaceSurfaceSwitcher: { navigate: () => options.activateSurface(), syncRoute: options.syncRoute },
    },
  ];
}

function routeSpies() {
  return {
    authoring: vi.fn<() => ManuscriptCommentAuthoring>(() => ({
      passage: { end: 8, excerpt: "Evidence", fileId: "main.md", start: 0 },
      sourceRevision: 3,
      stable: true,
    })),
    document: vi.fn(() => new Y.Doc()),
    insertCitation: vi.fn(),
    openCandidate: vi.fn(),
    openPublication: vi.fn(),
    presentNotice: vi.fn(),
    refreshLibrary: vi.fn().mockResolvedValue(undefined),
    refreshResources: vi.fn().mockResolvedValue(undefined),
    selectPassage: vi.fn(),
  };
}

function bindTestRoutes(presenter: ContextResourcePresenter, routes: ReturnType<typeof routeSpies>, document = routes.document()): void {
  presenter.bindRoutes(
    document,
    {
      get stable() {
        return routes.authoring().stable;
      },
    },
    { request: routes.refreshResources },
    {
      editorStatus: { selectedPassage: () => routes.authoring().passage },
      projectFileDialog: { revealRange: routes.selectPassage },
      projectHistoryTrigger: {
        get value() {
          return routes.authoring().sourceRevision;
        },
      },
      referenceLibraryWorkspace: { refreshBoundProject: routes.refreshLibrary },
      sourceCitationControl: { insertCitation: routes.insertCitation },
      toast: { show: routes.presentNotice },
    },
  );
}

interface TestLibraryPdfCoordinator {
  readonly acceptProjectMutation: (snapshot: WorkspaceSnapshot) => Promise<void>;
  readonly canInsertCitation: ReturnType<typeof vi.fn<() => boolean>>;
  readonly completeMarkup: (message: string) => void;
  readonly projectApiBase: string;
}

function bindTestLibraryPdf(presenter: ContextResourcePresenter, coordinator: TestLibraryPdfCoordinator): void {
  presenter.bindLibraryPdf(coordinator.projectApiBase, {
    editorStatus: {
      get caret() {
        return coordinator.canInsertCitation() ? 0 : null;
      },
    },
    referenceLibraryWorkspace: {
      applyProjectMutation: coordinator.acceptProjectMutation,
      completeRefresh: async (message) => coordinator.completeMarkup(message),
    },
  });
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
    "project-map": new ProjectMapWorkspace(),
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
  const pdfRoutes = {
    openLibraryPdf: vi.spyOn(presenter, "openLibraryPdf").mockResolvedValue(undefined),
    openProjectPdf: vi.spyOn(presenter, "openProjectPdf").mockResolvedValue(undefined),
    openReferencePdf: vi.spyOn(presenter, "openReferencePdf").mockResolvedValue(undefined),
  };
  const routes = routeSpies();
  bindTestRoutes(presenter, routes);
  return { elements, pdfRoutes, presenter, routes };
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

  it("owns linked-passage resolution and notices", () => {
    const { presenter, routes } = setup();
    const document = new Y.Doc();
    const source = document.getText("source");
    source.insert(0, "Evidence matters");
    const anchor = toManuscriptAnchorSelector(createManuscriptAnchor(document, 0, 8, 1));
    bindTestRoutes(presenter, routes, document);

    presenter.openPassage(anchor);
    expect(routes.selectPassage).toHaveBeenCalledWith("main", 0, 8);
    expect(routes.presentNotice).toHaveBeenCalledWith("Linked manuscript passage selected.");

    source.delete(0, 1);
    source.insert(0, "e");
    presenter.openPassage(anchor);
    expect(routes.presentNotice).toHaveBeenCalledWith("Changed linked passage selected; review its current text.");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("presents publication and candidate resources through their Lit owners", () => {
    const { elements, presenter } = setup();
    const setPublication = vi.spyOn(elements["publication-context-panel"], "setPublication").mockReturnValue(true);
    const candidatePresenter = { presentCandidate: vi.fn() };
    presenter.bindCandidatePresentation(candidatePresenter);
    const publicationTab = { id: "publication:1", key: "publication:publication:1", kind: "publication", scrollTop: 12 } as const;
    const candidateTab = { id: "candidate:1", key: "candidate:candidate:1", kind: "candidate", scrollTop: 24 } as const;

    expect(presenter.present(sources(publicationTab))).toMatchObject({ publicationPresented: true });
    presenter.present(sources(candidateTab));

    expect(setPublication).toHaveBeenCalledWith(expect.objectContaining({ publicationId: publicationTab.id }));
    expect(candidatePresenter.presentCandidate).toHaveBeenCalledWith(candidateTab.id, workspaceSnapshotFixture, 24);
  });

  it("composes canonical tabs and the active resource presentation", () => {
    const { elements, presenter } = setup();
    const tab = resourceTab("pdf", "project/pdf");
    const setTabs = vi.spyOn(elements["context-tab-strip"], "setTabs").mockImplementation(() => undefined);
    const present = vi.spyOn(presenter, "present").mockReturnValue({ publicationPresented: false });
    vi.spyOn(presenter, "referencePdfs", "get").mockReturnValue([referencePdf]);
    presenter.openResourceContext({ kind: "pdf", id: tab.id });

    const presentation = presenter.presentContext({
      ...sources(undefined),
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
    expect(presentation.activeTab).toEqual(tab);
    expect(presenter.activeTab).toEqual(tab);
  });

  it("owns canonical research-context transitions and authorization reconciliation", () => {
    const { presenter } = setup();

    presenter.activateContext("library");
    expect(presenter.activeKey).toBe("library");

    const key = presenter.openResourceContext({ kind: "publication", id: "publication:1" });
    expect(key).toBe("publication:publication:1");
    expect(presenter.activeContextTab).toMatchObject({ id: "publication:1", kind: "publication" });

    presenter.closeContext(key);
    expect(presenter.activeKey).toBe("assistant");

    presenter.openResourceContext({ kind: "candidate", id: "candidate:1" });
    presenter.reconcileContext({
      candidateIds: new Set(),
      libraryPdfIds: new Set(),
      pdfIds: new Set(),
      publicationIds: new Set(),
    });
    expect(presenter.activeKey).toBe("preview");
  });

  it("owns bound context presentation, navigation, focus, and route effects", async () => {
    const { elements, presenter } = setup();
    const bindNavigation = vi.spyOn(elements["context-tab-strip"], "bindNavigation");
    const focusTab = vi.spyOn(elements["context-tab-strip"], "focusTab").mockImplementation(() => undefined);
    const presentContext = vi.spyOn(presenter, "presentContext").mockReturnValue({
      activeTab: undefined,
      publicationPresented: false,
    });
    const activateSurface = vi.fn();
    const openLibrary = vi.fn().mockResolvedValue(undefined);
    const libraryRoutes = standaloneLibraryRoutes();
    const restorePaneWidth = vi.fn();
    const syncRoute = vi.fn();
    let standaloneLibrary = false;
    const bindingOptions = {
      activateSurface,
      citationAvailable: () => true,
      openLibrary,
      standaloneLibraryRoutes: libraryRoutes,
      refreshAssistant: vi.fn(),
      restorePaneWidth,
      sources: () => ({ ...sources(undefined), standaloneLibrary }),
      syncRoute,
    };
    presenter.bindContext(...contextBinding(bindingOptions));
    const navigation = bindNavigation.mock.calls[0]?.[0];

    navigation?.activate("library");
    navigation?.openLibrary();
    presenter.navigateResource({ kind: "publication", id: "publication:1" });

    expect(presenter.activeKey).toBe("publication:publication:1");
    expect(activateSurface).toHaveBeenCalledTimes(2);
    expect(focusTab).toHaveBeenCalledWith("library");
    expect(focusTab).toHaveBeenCalledWith("publication:publication:1");
    expect(syncRoute).toHaveBeenCalledWith("push");
    await vi.waitFor(() => expect(openLibrary).toHaveBeenCalledWith());

    standaloneLibrary = true;
    presenter.bindContext(...contextBinding(bindingOptions));
    navigation?.close("publication:publication:1");
    expect(presenter.activeKey).toBe("library");
    expect(libraryRoutes.replaceLibraryRoute).toHaveBeenCalledOnce();
    expect(syncRoute).toHaveBeenCalledWith("replace");
    expect(presentContext).toHaveBeenCalled();
    expect(restorePaneWidth).toHaveBeenCalled();
  });

  it("restores routed context with general, resource, and failure fallbacks", async () => {
    const { elements, presenter, routes } = setup();
    const openLibrary = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(elements["context-tab-strip"], "focusTab").mockImplementation(() => undefined);
    vi.spyOn(presenter, "presentContext").mockReturnValue({ activeTab: undefined, publicationPresented: false });
    const restoreTarget = vi.spyOn(presenter, "restoreTarget").mockResolvedValue(undefined);
    presenter.bindContext(
      ...contextBinding({
        activateSurface: vi.fn(),
        citationAvailable: () => false,
        openLibrary,
        standaloneLibraryRoutes: standaloneLibraryRoutes(),
        refreshAssistant: vi.fn(),
        restorePaneWidth: vi.fn(),
        sources: () => ({ ...sources(undefined), standaloneLibrary: false }),
        syncRoute: vi.fn(),
      }),
    );
    await presenter.restoreContext("assistant");
    await presenter.restoreContext("library");
    await presenter.restoreContext("pdf:pdf-1", 4, "annotation-1");
    restoreTarget.mockRejectedValueOnce(new Error("PDF is unavailable"));
    await presenter.restoreContext("pdf:missing");

    expect(openLibrary).toHaveBeenCalledWith(false);
    expect(restoreTarget).toHaveBeenNthCalledWith(1, { kind: "pdf", id: "pdf-1" }, 4, "annotation-1");
    expect(restoreTarget).toHaveBeenNthCalledWith(2, { kind: "pdf", id: "missing" }, undefined, undefined);
    expect(presenter.activeKey).toBe("preview");
    expect(routes.presentNotice).toHaveBeenCalledWith("PDF is unavailable");
  });

  it("selects an authorized PDF for PDF-only layout", async () => {
    const { pdfRoutes, presenter, routes } = setup();
    const pdf = {
      contentType: "application/pdf",
      createdAt: "created",
      fingerprint: "layout-fingerprint",
      id: "layout/pdf",
      name: "layout.pdf",
      objectKey: "pdfs/layout.pdf",
      size: 1024,
    } satisfies PdfResource;
    let contextSources = {
      ...sources(undefined),
      library: library as ReferenceLibrarySnapshot | null,
      snapshot: { ...workspaceSnapshotFixture, pdfs: [pdf] },
      standaloneLibrary: false,
    };
    presenter.bindContext(
      ...contextBinding({
        activateSurface: vi.fn(),
        citationAvailable: () => false,
        openLibrary: vi.fn(),
        standaloneLibraryRoutes: standaloneLibraryRoutes(),
        refreshAssistant: vi.fn(),
        restorePaneWidth: vi.fn(),
        sources: () => contextSources,
        syncRoute: vi.fn(),
      }),
    );

    await presenter.ensurePdfResource();
    contextSources = { ...contextSources, snapshot: workspaceSnapshotFixture };
    await presenter.ensurePdfResource();
    contextSources = { ...contextSources, library: null };
    await presenter.ensurePdfResource();
    presenter.openResourceContext({ kind: "pdf", id: pdf.id });
    await presenter.ensurePdfResource();

    expect(pdfRoutes.openProjectPdf).toHaveBeenCalledOnce();
    expect(pdfRoutes.openProjectPdf).toHaveBeenCalledWith(pdf);
    expect(pdfRoutes.openLibraryPdf).toHaveBeenCalledOnce();
    expect(pdfRoutes.openLibraryPdf).toHaveBeenCalledWith(libraryPdf);
    expect(routes.presentNotice).toHaveBeenCalledOnce();
    expect(routes.presentNotice).toHaveBeenCalledWith("Add or open a PDF before using PDF-only view.");
  });

  it("owns PDF context preparation, history effects, and load timing", async () => {
    const { pdfRoutes, presenter } = setup();
    pdfRoutes.openProjectPdf.mockRestore();
    pdfRoutes.openLibraryPdf.mockRestore();
    pdfRoutes.openReferencePdf.mockRestore();
    const preparePdfContext = vi.spyOn(presenter, "preparePdfContext").mockImplementation((target) => `${target.kind}:${target.id}`);
    const loadActivePdf = vi.spyOn(presenter, "loadActivePdf").mockResolvedValue(undefined);
    const libraryRoutes = standaloneLibraryRoutes();
    const syncRoute = vi.fn();
    let standaloneLibrary = false;
    const bindingOptions = {
      activateSurface: vi.fn(),
      citationAvailable: () => false,
      openLibrary: vi.fn(),
      standaloneLibraryRoutes: libraryRoutes,
      refreshAssistant: vi.fn(),
      restorePaneWidth: vi.fn(),
      sources: () => ({ ...sources(undefined), standaloneLibrary }),
      syncRoute,
    };
    presenter.bindContext(...contextBinding(bindingOptions));
    const pdf = {
      contentType: "application/pdf",
      createdAt: "created",
      fingerprint: "navigation-fingerprint",
      id: "navigation/pdf",
      name: "navigation.pdf",
      objectKey: "pdfs/navigation.pdf",
      size: 1024,
    } satisfies PdfResource;

    await presenter.openProjectPdf(pdf, 3, "annotation-1");
    await presenter.openLibraryPdf(libraryPdf, 5);
    await presenter.openReferencePdf(referencePdf, 6, false);
    standaloneLibrary = true;
    presenter.bindContext(...contextBinding(bindingOptions));
    await presenter.openLibraryPdf(libraryPdf, 7);
    await presenter.openLibraryPdf(libraryPdf, 8, false);

    expect(preparePdfContext).toHaveBeenNthCalledWith(1, { kind: "pdf", id: pdf.id }, { focusedAnnotationId: "annotation-1", page: 3 });
    expect(preparePdfContext).toHaveBeenNthCalledWith(2, { kind: "library-pdf", id: libraryPdf.id }, { page: 5 });
    expect(preparePdfContext).toHaveBeenNthCalledWith(3, { kind: "library-pdf", id: referencePdf.id }, { page: 6 });
    expect(syncRoute).toHaveBeenCalledTimes(2);
    expect(syncRoute).toHaveBeenCalledWith("push");
    expect(libraryRoutes.pushPdfRoute).toHaveBeenCalledOnce();
    expect(libraryRoutes.pushPdfRoute).toHaveBeenCalledWith(libraryPdf.id, 7);
    expect(loadActivePdf).toHaveBeenCalledTimes(5);
    expect(loadActivePdf).toHaveBeenCalledWith(true);
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

  it("owns bound reference refresh and workspace resource presentation", async () => {
    const { presenter } = setup();
    const refreshAssistant = vi.fn();
    const syncRoute = vi.fn();
    const presentWorkspace = vi.spyOn(presenter, "presentWorkspace");
    const presentBoundContext = vi.spyOn(presenter, "presentBoundContext").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([referencePdf])));
    presenter.presentBoundWorkspace();
    await presenter.refreshBoundReferencePdfs();
    presenter.bindContext(
      ...contextBinding({
        activateSurface: vi.fn(),
        citationAvailable: () => false,
        openLibrary: vi.fn(),
        standaloneLibraryRoutes: standaloneLibraryRoutes(),
        refreshAssistant,
        restorePaneWidth: vi.fn(),
        sources: () => ({ ...sources(undefined), standaloneLibrary: false }),
        syncRoute,
      }),
    );

    await presenter.refreshBoundReferencePdfs();

    expect(presenter.referencePdfs).toEqual([referencePdf]);
    expect(presentWorkspace).toHaveBeenCalledWith(workspaceSnapshotFixture);
    expect(presentBoundContext).toHaveBeenCalledOnce();
    expect(refreshAssistant).toHaveBeenCalledOnce();
    expect(syncRoute).toHaveBeenCalledWith("replace");
  });

  it("refreshes and reconciles Library context for its bound project", async () => {
    const { presenter } = setup();
    const refreshBoundReferencePdfs = vi.spyOn(presenter, "refreshBoundReferencePdfs").mockResolvedValue();
    const resourceAuthorization = vi.spyOn(presenter, "resourceAuthorization");
    const reconcileContext = vi.spyOn(presenter, "reconcileContext").mockImplementation(() => undefined);

    await presenter.refreshLibraryContext(workspaceSnapshotFixture, library);

    expect(refreshBoundReferencePdfs).toHaveBeenCalledWith(false);
    expect(resourceAuthorization).toHaveBeenCalledWith(workspaceSnapshotFixture, library);
    expect(reconcileContext).toHaveBeenCalledWith({
      candidateIds: new Set(workspaceSnapshotFixture.candidates.map(({ id }) => id)),
      libraryPdfIds: new Set(library.artifacts.map(({ id }) => id)),
      pdfIds: new Set(workspaceSnapshotFixture.pdfs.map(({ id }) => id)),
      publicationIds: new Set(workspaceSnapshotFixture.publications.map(({ id }) => id)),
    });
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
      clearDraftSelection: vi.fn(),
      currentPage: 3,
      focusedAnnotationId: annotation.id,
      open: vi.fn().mockResolvedValue(true),
      setPrivateHighlightSelection: vi.fn(),
      setTextSelectionEnabled: vi.fn(),
      setTool: vi.fn(),
      showError: vi.fn(),
      updateAnnotations: vi.fn(),
      updatePrivateHighlights: vi.fn(),
    };
    const capture = { page: 2, prefix: "Before", quote: "Evidence", rects: [], suffix: "After" };
    const persistCapture = vi.spyOn(elements["project-annotation-form"], "persistCapture").mockResolvedValue(undefined);
    const activateHighlight = vi.spyOn(elements["project-annotation-form"], "activateHighlight").mockResolvedValue(undefined);
    const configureAnnotation = vi.spyOn(elements["project-annotation-form"], "configure");
    const selectPdf = vi.spyOn(elements["project-annotation-form"], "selectPdf");
    const showCapture = vi.spyOn(elements["project-annotation-form"], "showCapture");
    vi.spyOn(elements["context-tab-strip"], "fixedScrollTop").mockReturnValue(null);
    presenter.bindPdfViewer(viewer, "/api/workspaces/workspace");
    expect(configureAnnotation).toHaveBeenCalledWith("/api/workspaces/workspace");
    presenter.preparePdfContext({ kind: "pdf", id: pdf.id }, { focusedAnnotationId: annotation.id, page: tab.page });
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

    presenter.captureBoundContext();
    expect(presenter.activeContextTab).toMatchObject({ focusedAnnotationId: annotation.id, page: 3 });
    await presenter.loadActivePdf(false);
    expect(viewer.open).toHaveBeenCalledOnce();
  });

  it("presents active PDF loading failures only while the resource remains active", async () => {
    const { presenter } = setup();
    const viewer = {
      clearDraftSelection: vi.fn(),
      currentPage: 1,
      focusedAnnotationId: null,
      open: vi.fn().mockRejectedValue(new Error("Could not open PDF")),
      setPrivateHighlightSelection: vi.fn(),
      setTextSelectionEnabled: vi.fn(),
      setTool: vi.fn(),
      showError: vi.fn(),
      updateAnnotations: vi.fn(),
      updatePrivateHighlights: vi.fn(),
    };
    presenter.bindPdfViewer(viewer, "/api/workspaces/workspace");
    presenter.present(sources(resourceTab("library-pdf", libraryPdf.id)));

    await presenter.loadActivePdf(true);

    expect(viewer.showError).toHaveBeenCalledWith(expect.objectContaining({ message: "Could not open PDF" }));
  });

  it("owns project-annotation sibling and viewer effects", async () => {
    const { elements, presenter, routes } = setup();
    const viewer = {
      clearDraftSelection: vi.fn(),
      currentPage: 1,
      focusedAnnotationId: null,
      open: vi.fn().mockResolvedValue(true),
      setPrivateHighlightSelection: vi.fn(),
      setTextSelectionEnabled: vi.fn(),
      setTool: vi.fn(),
      showError: vi.fn(),
      updateAnnotations: vi.fn(),
      updatePrivateHighlights: vi.fn(),
    };
    const bindWorkflow = vi.spyOn(elements["project-annotation-form"], "bindWorkflow");
    const removeFragment = vi.spyOn(elements["project-evidence-panel"], "removeFragment").mockResolvedValue(true);
    const linkPassage = vi.spyOn(elements["project-evidence-panel"], "linkPassage").mockResolvedValue(undefined);
    const revealAnnotation = vi.spyOn(elements["project-evidence-panel"], "revealAnnotation").mockReturnValue(true);
    const insertCitation = vi.spyOn(presenter, "insertActiveCitation");
    presenter.bindPdfViewer(viewer, "/api/workspaces/workspace");

    presenter.bindProjectAnnotationWorkflow();
    const workflow = bindWorkflow.mock.calls[0]?.[0];
    expect(workflow).toBeDefined();
    workflow?.chooseTool("erase");
    workflow?.citePage();
    workflow?.revealHighlight("annotation-1");
    await workflow?.removeHighlight("annotation-1", "fragment-1");
    await workflow?.completeWorkflow?.({
      clearDraftSelection: true,
      linkAnnotationId: "annotation-1",
      notice: "Annotation saved.",
      refreshResources: true,
    });

    expect(viewer.setTool).toHaveBeenCalledWith("erase");
    expect(insertCitation).toHaveBeenCalledWith(true);
    expect(revealAnnotation).toHaveBeenCalledWith("annotation-1");
    expect(removeFragment).toHaveBeenCalledWith("annotation-1", "fragment-1");
    expect(viewer.clearDraftSelection).toHaveBeenCalledOnce();
    expect(routes.refreshResources).toHaveBeenCalledOnce();
    expect(linkPassage).toHaveBeenCalledWith({
      annotationId: "annotation-1",
      end: 8,
      excerpt: "Evidence",
      fileId: "main.md",
      sourceRevision: 3,
      start: 0,
    });
    expect(routes.presentNotice).toHaveBeenCalledWith("Annotation saved.");
  });

  it("owns project-evidence routes across its composed Lit resources", async () => {
    const { elements, pdfRoutes, presenter, routes } = setup();
    const completeProjectMutation = vi.spyOn(presenter, "completeProjectMutation").mockResolvedValue(undefined);
    const pdf = {
      contentType: "application/pdf",
      createdAt: "created",
      fingerprint: "project-fingerprint",
      id: "pdf-1",
      name: "project.pdf",
      objectKey: "pdfs/project.pdf",
      size: 1024,
    } satisfies PdfResource;
    const annotation = {
      comment: "Evidence",
      createdAt: "created",
      fragments: [],
      id: "annotation-1",
      page: 2,
      pdfId: pdf.id,
      prefix: "",
      quote: "Quoted evidence",
      rects: [],
      suffix: "",
      updatedAt: "updated",
    } satisfies AnnotationResource;
    const configure = vi.spyOn(elements["project-evidence-panel"], "configure");
    const bind = vi.spyOn(elements["project-evidence-panel"], "bind");
    const clearAnnotation = vi.spyOn(elements["project-annotation-form"], "clearAnnotation");
    const selectPdf = vi.spyOn(elements["project-annotation-form"], "selectPdf");
    const linkPassage = vi.spyOn(elements["project-evidence-panel"], "linkPassage").mockResolvedValue(undefined);
    const openProjectAnnotation = vi.spyOn(presenter, "openProjectAnnotation").mockImplementation(() => undefined);
    presenter.bindProjectEvidence("/api/workspaces/workspace");
    const binding = bind.mock.calls[0]?.[0];
    binding?.annotationRemoved(annotation.id, "Highlight deleted.");
    binding?.completeMutation("Project changed.");
    binding?.editAnnotation(annotation);
    await binding?.fragmentRemoved({ annotationDeleted: true, annotationId: annotation.id, announce: true });
    binding?.linkAnnotation(annotation.id);
    binding?.notice("Evidence notice.");
    binding?.openPassage({
      anchoredRevision: 1,
      exact: "Evidence",
      fileId: "main.tex",
      originalRange: { end: 8, start: 0 },
      prefix: "",
      relativeEnd: null,
      relativeStart: null,
      suffix: "",
      version: 1,
    });
    binding?.openPdf(pdf, annotation.page, annotation.id);

    expect(configure).toHaveBeenCalledWith("/api/workspaces/workspace");
    expect(clearAnnotation).toHaveBeenCalledTimes(2);
    expect(completeProjectMutation).toHaveBeenNthCalledWith(
      1,
      "Highlight deleted.",
      "The highlight was deleted, but project resources could not be refreshed.",
    );
    expect(completeProjectMutation).toHaveBeenNthCalledWith(
      2,
      "Project changed.",
      "The project changed, but project resources could not be refreshed.",
    );
    expect(completeProjectMutation).toHaveBeenNthCalledWith(3);
    expect(openProjectAnnotation).toHaveBeenCalledWith(annotation.id, true);
    expect(linkPassage).toHaveBeenCalledWith({
      annotationId: annotation.id,
      end: 8,
      excerpt: "Evidence",
      fileId: "main.md",
      sourceRevision: 3,
      start: 0,
    });
    expect(routes.selectPassage).not.toHaveBeenCalled();
    expect(routes.presentNotice).toHaveBeenCalledWith("This manuscript anchor is stale and needs to be linked again.");
    expect(routes.presentNotice).toHaveBeenCalledWith("Highlight stroke erased.");
    expect(routes.presentNotice).toHaveBeenCalledWith("Evidence notice.");
    expect(selectPdf).toHaveBeenCalledWith(pdf.id);
    expect(pdfRoutes.openProjectPdf).toHaveBeenCalledWith(pdf, annotation.page, annotation.id);
  });

  it("owns project mutation refresh and notice completion", async () => {
    const { presenter, routes } = setup();

    await presenter.completeProjectMutation("Project changed.", "Refresh failed.");
    expect(routes.refreshResources).toHaveBeenCalledOnce();
    expect(routes.presentNotice).toHaveBeenLastCalledWith("Project changed.");

    vi.mocked(routes.refreshResources).mockRejectedValueOnce(new Error("Unavailable"));
    await presenter.completeProjectMutation("Project changed.", "Refresh failed.");
    expect(routes.presentNotice).toHaveBeenLastCalledWith("Refresh failed.");

    vi.mocked(routes.refreshResources).mockRejectedValueOnce(new Error("Unavailable"));
    await expect(presenter.completeProjectMutation()).rejects.toThrow("Unavailable");
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
    const setPassageLinks = vi.spyOn(elements["project-evidence-panel"], "setPassageLinks");
    const setClaimPassageLinks = vi.spyOn(elements["claim-list-panel"], "setPassageLinks");
    const presentMap = vi.spyOn(elements["project-map"], "presentWorkspace");

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
    presenter.presentResolvedWorkspace(snapshot, "@article{source}", "# Manuscript");
    expect(setPassageLinks).toHaveBeenCalledWith(snapshot.links);
    expect(setClaimPassageLinks).toHaveBeenCalledWith(snapshot.claimLinks);
    expect(setComments).toHaveBeenLastCalledWith(snapshot.comments);
    expect(presentMap).toHaveBeenCalledWith(snapshot, "@article{source}", "# Manuscript");
  });

  it("owns project-map routes across its composed Lit resources", () => {
    const { elements, presenter } = setup();
    const map = elements["project-map"];
    const configure = vi.spyOn(map, "configure");
    const bindNavigation = vi.spyOn(map, "bindNavigation");
    const restoreTarget = vi.spyOn(presenter, "restoreTarget").mockResolvedValue(undefined);
    const openProjectAnnotation = vi.spyOn(presenter, "openProjectAnnotation").mockImplementation(() => undefined);
    const openProjectNote = vi.spyOn(presenter, "openProjectNote").mockImplementation(() => undefined);
    const revealClaim = vi.spyOn(elements["claim-list-panel"], "revealClaim").mockReturnValue(true);
    const owners = {
      projectFileDialog: { revealAuthoring: vi.fn() },
      workspaceSharingPanel: { open: vi.fn() },
      workspacePreview: { scrollToAnchor: vi.fn() },
      workspaceSwitcher: { focusSelect: vi.fn() },
    };

    presenter.bindProjectMap("/api/workspaces/workspace", owners);
    const navigation = bindNavigation.mock.calls[0]?.[0];
    navigation?.document("document");
    navigation?.person("person");
    navigation?.project("project");
    navigation?.section("section-1");
    navigation?.annotation("annotation-1");
    navigation?.claim("claim-1");
    navigation?.["model-candidate"]("candidate-1");
    navigation?.note("note-1");
    navigation?.pdf("pdf-1");
    navigation?.publication("publication-1");

    expect(configure).toHaveBeenCalledWith("/api/workspaces/workspace");
    expect(owners.projectFileDialog.revealAuthoring).toHaveBeenCalledOnce();
    expect(owners.workspaceSharingPanel.open).toHaveBeenCalledOnce();
    expect(owners.workspaceSwitcher.focusSelect).toHaveBeenCalledOnce();
    expect(owners.workspacePreview.scrollToAnchor).toHaveBeenCalledWith("section-1");
    expect(presenter.activeKey).toBe("preview");
    expect(openProjectAnnotation).toHaveBeenCalledWith("annotation-1");
    expect(revealClaim).toHaveBeenCalledWith("claim-1");
    expect(restoreTarget).toHaveBeenCalledWith({ kind: "candidate", id: "candidate-1" });
    expect(openProjectNote).toHaveBeenCalledWith("note-1");
    expect(restoreTarget).toHaveBeenCalledWith({ kind: "pdf", id: "pdf-1" });
    expect(restoreTarget).toHaveBeenCalledWith({ kind: "publication", id: "publication-1" });
  });

  it("owns claim and publication routes across its composed Lit resources", () => {
    const { elements, presenter, routes } = setup();
    const navigateResource = vi.spyOn(presenter, "navigateResource").mockImplementation(() => undefined);
    const completeProjectMutation = vi.spyOn(presenter, "completeProjectMutation").mockResolvedValue(undefined);
    const claimBind = vi.spyOn(elements["claim-list-panel"], "bind");
    const contextBind = vi.spyOn(elements["publication-context-panel"], "bind");
    const listBind = vi.spyOn(elements["publication-list-panel"], "bind");
    const commentBind = vi.spyOn(elements["manuscript-comment-list-panel"], "bind");
    const revealAnnotation = vi.spyOn(elements["project-evidence-panel"], "revealAnnotation").mockReturnValue(true);
    const insertActiveCitation = vi.spyOn(presenter, "insertActiveCitation").mockImplementation(() => undefined);
    const openPublicationPaper = vi.spyOn(presenter, "openPublicationPaper").mockResolvedValue(undefined);
    const library = { openAvailableReference: vi.fn().mockResolvedValue(undefined) };
    const linkPassage = vi.spyOn(elements["claim-list-panel"], "linkPassage").mockResolvedValue(undefined);
    const publication = {
      abstract: "",
      authors: ["Ada Author"],
      citationKey: "Author2026",
      createdAt: "created",
      doi: "",
      id: "publication-1",
      metadataSource: "crossref" as const,
      title: "Route source",
      type: "article",
      updatedAt: "updated",
      url: "",
      venue: "Journal",
      year: "2026",
    };

    presenter.bindClaimList("/api/workspaces/workspace");
    presenter.bindManuscriptComments("/api/workspaces/workspace");
    presenter.bindPublicationContext("/api/workspaces/workspace");
    presenter.bindPublicationList("/api/workspaces/workspace", library);
    claimBind.mock.calls[0]?.[0].completeMutation("Claim changed.");
    claimBind.mock.calls[0]?.[0].linkPassage("claim-1");
    claimBind.mock.calls[0]?.[0].openAnnotation("annotation-1");
    contextBind.mock.calls[0]?.[0].insertCitation();
    contextBind.mock.calls[0]?.[0].openPaper({ kind: "reference", pdf: referencePdf });
    contextBind.mock.calls[0]?.[0].papersChanged("Paper changed.");
    commentBind.mock.calls[0]?.[0].completeMutation("Comment changed.");
    commentBind.mock.calls[0]?.[0].notice("Comment notice.");
    listBind.mock.calls[0]?.[0].enriched("Reference enriched.");
    listBind.mock.calls[0]?.[0].manage(publication.id);
    listBind.mock.calls[0]?.[0].open(publication);

    expect(completeProjectMutation).toHaveBeenNthCalledWith(
      1,
      "Claim changed.",
      "The claim changed, but project resources could not be refreshed.",
    );
    expect(completeProjectMutation).toHaveBeenNthCalledWith(
      2,
      "Paper changed.",
      "The paper links changed, but project resources could not be refreshed.",
    );
    expect(completeProjectMutation).toHaveBeenNthCalledWith(
      3,
      "Comment changed.",
      "The comment changed, but project resources could not be refreshed.",
    );
    expect(completeProjectMutation).toHaveBeenNthCalledWith(
      4,
      "Reference enriched.",
      "The reference was enriched, but project resources could not be refreshed.",
    );
    expect(commentBind.mock.calls[0]?.[0].authoring()).toEqual(routes.authoring());
    expect(linkPassage).toHaveBeenCalledWith({
      claimId: "claim-1",
      end: 8,
      excerpt: "Evidence",
      fileId: "main.md",
      sourceRevision: 3,
      start: 0,
    });
    expect(routes.presentNotice).toHaveBeenCalledWith("Comment notice.");
    expect(revealAnnotation).toHaveBeenCalledWith("annotation-1");
    expect(insertActiveCitation).toHaveBeenCalledOnce();
    expect(openPublicationPaper).toHaveBeenCalledWith({ kind: "reference", pdf: referencePdf });
    expect(library.openAvailableReference).toHaveBeenCalledWith(publication.id);
    expect(navigateResource).toHaveBeenCalledWith({ kind: "publication", id: publication.id });
  });

  it("guards claim and evidence passage links with shared authoring state", () => {
    const { elements, presenter, routes } = setup();
    const claimBind = vi.spyOn(elements["claim-list-panel"], "bind");
    const evidenceBind = vi.spyOn(elements["project-evidence-panel"], "bind");
    presenter.bindClaimList("/api/workspaces/workspace");
    presenter.bindProjectEvidence("/api/workspaces/workspace");

    routes.authoring.mockReturnValue({ passage: null, sourceRevision: 3, stable: false });
    claimBind.mock.calls[0]?.[0].linkPassage("claim-1");
    routes.authoring.mockReturnValue({ passage: null, sourceRevision: 3, stable: true });
    evidenceBind.mock.calls[0]?.[0].linkAnnotation("annotation-1");

    expect(routes.presentNotice).toHaveBeenNthCalledWith(1, "Wait for the manuscript to finish synchronizing before linking a claim.");
    expect(routes.presentNotice).toHaveBeenNthCalledWith(2, "Select manuscript text before linking an annotation.");
  });

  it("provides canonical resource routes to the assistant presenter", async () => {
    const { elements, pdfRoutes, presenter, routes } = setup();
    const navigateResource = vi.spyOn(presenter, "navigateResource").mockImplementation(() => undefined);
    const focusTab = vi.spyOn(elements["context-tab-strip"], "focusTab").mockImplementation(() => undefined);
    const pdf = {
      contentType: "application/pdf",
      createdAt: "created",
      fingerprint: "assistant-fingerprint",
      id: "pdf-assistant",
      name: "assistant.pdf",
      objectKey: "pdfs/assistant.pdf",
      size: 1024,
    } satisfies PdfResource;
    const candidate = {
      createdAt: "created",
      evidence: [],
      id: "candidate-assistant",
      instruction: "Draft a claim",
      model: "local-model",
      operation: "draft-claim" as const,
      promptVersion: "draft-claim-v1" as const,
      proposedNote: "",
      proposedText: "Grounded claim",
      providerAdapter: "openai-compatible" as const,
      providerLabel: "Local",
      relation: "supports" as const,
      status: "pending" as const,
    };
    const evidence = {
      comment: "Working note",
      createdAt: "created",
      id: "annotation-assistant",
      kind: "annotation" as const,
      page: 2,
      pdfId: pdf.id,
      prefix: "Before",
      quote: "Evidence",
      rects: [],
      suffix: "After",
      updatedAt: "updated",
      version: "updated",
    };
    const resources = presenter.assistantResources();
    presenter.present(sources(undefined));

    resources.focusAssistant();
    resources.openCandidate(candidate);
    resources.openPaper(pdf, evidence);
    await resources.refreshLibrary();
    resources.reportNoEvidence();

    expect(focusTab).toHaveBeenCalledWith("assistant");
    expect(resources.project()).toBe(workspaceSnapshotFixture);
    expect(navigateResource).toHaveBeenCalledWith({ kind: "candidate", id: candidate.id });
    expect(pdfRoutes.openProjectPdf).toHaveBeenCalledWith(pdf, evidence.page, evidence.id);
    expect(routes.refreshLibrary).toHaveBeenCalledOnce();
    expect(routes.presentNotice).toHaveBeenCalledWith("No project evidence is available yet.");
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
    const { elements, pdfRoutes, presenter } = setup();
    const navigateResource = vi.spyOn(presenter, "navigateResource").mockImplementation(() => undefined);
    const bindIntake = vi.spyOn(elements["project-annotation-form"], "bindIntake");
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
    const note = {
      content: { body: "  Private   note  ", kind: "note" as const },
      createdAt: "created",
      id: "share:note",
      kind: "note" as const,
      projectId: workspaceSnapshotFixture.id,
      referenceId: "reference:note",
      resourceId: "note:route",
      revokedAt: null,
    } satisfies WorkspaceSnapshot["researchShares"][number];
    const longNote = {
      ...note,
      content: { body: "a".repeat(241), kind: "note" as const },
      id: "share:long-note",
      resourceId: "note:long-route",
    } satisfies WorkspaceSnapshot["researchShares"][number];
    const project = {
      ...workspaceSnapshotFixture,
      annotations: [annotation],
      candidates: [candidate],
      pdfs: [pdf],
      publicationPdfLinks: [{ createdAt: "created", id: "link:route", pdfId: pdf.id, publicationId: publication.id }],
      publications: [publication],
      researchShares: [note, longNote],
    };
    let currentLibrary: ReferenceLibrarySnapshot | null = null;
    presenter.bindContext(
      ...contextBinding({
        activateSurface: vi.fn(),
        citationAvailable: () => false,
        openLibrary: vi.fn(),
        standaloneLibraryRoutes: standaloneLibraryRoutes(),
        refreshAssistant: vi.fn(),
        restorePaneWidth: vi.fn(),
        sources: () => ({ ...sources(undefined), library: currentLibrary, snapshot: project, standaloneLibrary: false }),
        syncRoute: vi.fn(),
      }),
    );
    vi.spyOn(presenter, "referencePdfs", "get").mockReturnValue([referencePdf]);
    const coordinator = {
      authoring: vi.fn(() => ({ passage: null, sourceRevision: 0, stable: false })),
      document: vi.fn(() => new Y.Doc()),
      insertCitation: vi.fn(),
      openCandidate: vi.fn(),
      openPublication: vi.fn(),
      presentNotice: vi.fn(),
      refreshResources: vi.fn().mockResolvedValue(undefined),
      refreshLibrary: vi.fn(async () => {
        currentLibrary = library;
      }),
      selectPassage: vi.fn(),
    };
    bindTestRoutes(presenter, coordinator);

    await presenter.restoreTarget({ kind: "publication", id: publication.id });
    await presenter.restoreTarget({ kind: "pdf", id: pdf.id }, 4, "annotation-1");
    await presenter.restoreTarget({ kind: "candidate", id: candidate.id });
    await presenter.restoreTarget({ kind: "library-pdf", id: libraryPdf.id }, 5);
    await presenter.restoreTarget({ kind: "library-pdf", id: referencePdf.id }, 6);
    await presenter.restoreTarget({ kind: "publication", id: "missing" });
    presenter.openProjectAnnotation(annotation.id, true);
    presenter.openProjectNote(note.resourceId);
    presenter.openProjectNote(longNote.resourceId);
    presenter.openProjectNote("missing");
    const setCitationAvailable = vi.spyOn(elements["publication-context-panel"], "setCitationAvailable");
    presenter.present({
      ...sources({ id: publication.id, key: `publication:${publication.id}`, kind: "publication", scrollTop: 0 }),
      snapshot: project,
    });
    presenter.setCitationAvailable(true);
    presenter.insertActiveCitation();
    presenter.present({ ...sources({ ...resourceTab("pdf", pdf.id), page: 8 }), snapshot: project });
    presenter.setCitationAvailable(true);
    presenter.insertActiveCitation(true);
    await presenter.openPublicationPaper({ kind: "project", pdf, linkId: "link:route" });
    await presenter.openPublicationPaper({ kind: "library", artifact: libraryPdf });
    await presenter.openPublicationPaper({ kind: "reference", pdf: referencePdf });
    presenter.openCitation({ keys: ["author2026"], locator: "p. 7" });
    presenter.openCitation({ keys: ["Author2026"] });

    expect(navigateResource).toHaveBeenCalledWith({ kind: "publication", id: publication.id });
    expect(pdfRoutes.openProjectPdf).toHaveBeenCalledWith(pdf, 4, "annotation-1");
    expect(pdfRoutes.openProjectPdf).toHaveBeenCalledWith(pdf, 7);
    expect(pdfRoutes.openProjectPdf).toHaveBeenCalledWith(pdf, annotation.page, annotation.id);
    expect(pdfRoutes.openProjectPdf).toHaveBeenCalledWith(pdf);
    expect(showAnnotation).toHaveBeenCalledWith(annotation);
    expect(navigateResource).toHaveBeenCalledWith({ kind: "candidate", id: candidate.id });
    expect(coordinator.refreshLibrary).toHaveBeenCalledOnce();
    expect(pdfRoutes.openLibraryPdf).toHaveBeenCalledWith(libraryPdf, 5, false);
    expect(pdfRoutes.openLibraryPdf).toHaveBeenCalledWith(libraryPdf);
    expect(pdfRoutes.openReferencePdf).toHaveBeenCalledWith(referencePdf, 6, false);
    expect(pdfRoutes.openReferencePdf).toHaveBeenCalledWith(referencePdf);
    expect(coordinator.presentNotice).toHaveBeenNthCalledWith(1, "Private note");
    expect(coordinator.presentNotice).toHaveBeenNthCalledWith(2, `${"a".repeat(239)}…`);
    expect(coordinator.insertCitation).toHaveBeenNthCalledWith(1, publication.citationKey);
    expect(coordinator.insertCitation).toHaveBeenNthCalledWith(2, publication.citationKey, "p. 8");
    expect(setCitationAvailable).toHaveBeenNthCalledWith(1, true);
    expect(setCitationAvailable).toHaveBeenNthCalledWith(2, false);
    presenter.openCitation({ keys: ["one", "two"] });
    presenter.openCitation({ keys: ["missing"] });
    expect(coordinator.presentNotice).toHaveBeenNthCalledWith(3, "Open this grouped citation from Preview to choose a reference.");
    expect(coordinator.presentNotice).toHaveBeenNthCalledWith(4, "No publication resource is available for missing.");

    presenter.bindProjectAnnotationIntake();
    const intake = bindIntake.mock.calls[0]?.[0];
    expect(intake?.publications()).toEqual(project.publications);
    intake?.openPublication(publication);
    intake?.presentNotice("Reference connected.");
    await intake?.refresh();
    expect(navigateResource).toHaveBeenCalledWith({ kind: "publication", id: publication.id });
    expect(coordinator.presentNotice).toHaveBeenCalledWith("Reference connected.");
    expect(coordinator.refreshResources).toHaveBeenCalledOnce();
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
    presenter.preparePdfContext({ kind: "library-pdf", id: tab.id }, { page: tab.page });
    presenter.present(sources(tab));
    const libraryRoutes = standaloneLibraryRoutes();
    const syncRoute = vi.fn();
    presenter.bindContext(
      ...contextBinding({
        activateSurface: vi.fn(),
        citationAvailable: () => false,
        openLibrary: vi.fn(),
        refreshAssistant: vi.fn(),
        restorePaneWidth: vi.fn(),
        sources: () => ({ ...sources(undefined), standaloneLibrary: false }),
        standaloneLibraryRoutes: libraryRoutes,
        syncRoute,
      }),
    );
    presenter.presentPdfPage(2);

    expect(setLibraryPage).toHaveBeenCalledWith(libraryPdf, [], 2, elements["library-pdf-annotation-toolbar"].drawingStyle);
    expect(setUndoDrawings).toHaveBeenCalledWith([]);
    expect(presenter.activeContextTab).toMatchObject({ page: 2 });
    expect(syncRoute).toHaveBeenCalledWith("replace");
    expect(libraryRoutes.replacePdfRoute).toHaveBeenCalledWith(libraryPdf.id, 2);
  });

  it("leaves canonical context unchanged when a PDF is not active", () => {
    const { presenter } = setup();
    presenter.present(sources(undefined));

    expect(presenter.presentPdfPage(2)).toBeUndefined();
    expect(presenter.activeKey).toBe("preview");
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
    const { elements, presenter, routes } = setup();
    const viewer = {
      clearDraftSelection: vi.fn(),
      currentPage: 3,
      focusedAnnotationId: null,
      open: vi.fn().mockResolvedValue(true),
      setPrivateHighlightSelection: vi.fn(),
      setTextSelectionEnabled: vi.fn(),
      setTool: vi.fn(),
      showError: vi.fn(),
      updateAnnotations: vi.fn(),
      updatePrivateHighlights: vi.fn(),
    };
    const coordinator = {
      acceptProjectMutation: vi.fn(async () => undefined),
      canInsertCitation: vi.fn(() => true),
      completeMarkup: vi.fn(),
      openPdf: vi.fn().mockResolvedValue(undefined),
      projectApiBase: "/api/workspaces/workspace",
    };
    vi.spyOn(elements["paper-markups"], "chooseTool").mockImplementation(() => undefined);
    const setStatus = vi.spyOn(elements["library-pdf-inspector"], "setStatus");
    vi.spyOn(elements["library-pdf-inspector"], "clearNote").mockImplementation(() => undefined);
    vi.spyOn(elements["library-pdf-inspector"], "clearMarkup").mockImplementation(() => undefined);
    vi.spyOn(elements["library-pdf-inspector"], "draftState", "get").mockReturnValue({ highlight: false, markup: false, note: false });
    presenter.bindPdfViewer(viewer, "/api/workspaces/workspace");
    const openPdf = vi.spyOn(presenter, "openLibraryPdf").mockResolvedValue(undefined);
    bindTestLibraryPdf(presenter, coordinator);
    presenter.present(sources(undefined));

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

    expect(viewer.setTextSelectionEnabled).toHaveBeenCalledWith(true);
    expect(viewer.setPrivateHighlightSelection).toHaveBeenCalledWith(false, null);
    expect(coordinator.completeMarkup).toHaveBeenCalledWith("Drawing saved privately.");
    await vi.waitFor(() => expect(openPdf).toHaveBeenCalledWith(libraryPdf, highlight.page));
    expect(setStatus).toHaveBeenCalledWith("Showing saved private highlight on page 2.");
    await vi.waitFor(() => expect(routes.refreshLibrary).toHaveBeenCalledOnce());
    expect(viewer.clearDraftSelection).toHaveBeenCalledOnce();
    expect(routes.presentNotice).toHaveBeenCalledWith("Private highlight saved to your library.");
  });

  it("owns existing and collision-safe project-reference preparation before citing a highlight", async () => {
    const { presenter, routes } = setup();
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
      canInsertCitation: vi.fn(() => true),
      completeMarkup: vi.fn(),
      openPdf: vi.fn().mockResolvedValue(undefined),
      projectApiBase: "/api/workspaces/workspace",
    };
    presenter.present({ ...sources(undefined), library: librarySource(), snapshot: project() });
    bindTestLibraryPdf(presenter, coordinator);

    await presenter.citeLibraryHighlight(highlight);

    expect(routes.insertCitation).toHaveBeenCalledWith("doe2026", "p. 2");
    expect(coordinator.acceptProjectMutation).not.toHaveBeenCalled();

    const linked = { ...existingProjectReference, citationAlias: "doe2026a" };
    const snapshot = { ...workspaceSnapshotFixture, projectReferences: [linked] };
    project.mockReturnValue({ ...workspaceSnapshotFixture, projectReferences: [{ ...existingProjectReference, referenceId: "other" }] });
    presenter.present({ ...sources(undefined), library: librarySource(), snapshot: project() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(snapshot)));
    routes.insertCitation.mockClear();

    await presenter.citeLibraryHighlight(highlight);

    expect(fetch).toHaveBeenCalledWith("/api/workspaces/workspace/references", {
      body: JSON.stringify({ referenceId: reference.id, citationAlias: "doe2026a" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(coordinator.acceptProjectMutation).toHaveBeenCalledWith(snapshot);
    expect(routes.insertCitation).toHaveBeenCalledWith("doe2026a", "p. 2");
  });

  it("contains unavailable highlight citation feedback", async () => {
    const { presenter, routes } = setup();
    const librarySource = vi.fn<() => ReferenceLibrarySnapshot | null>(() => ({ ...library, references: [reference] }));
    const coordinator = {
      acceptProjectMutation: vi.fn(async () => undefined),
      canInsertCitation: vi.fn(() => false),
      completeMarkup: vi.fn(),
      openPdf: vi.fn().mockResolvedValue(undefined),
      projectApiBase: "/api/workspaces/workspace",
    };
    presenter.present({ ...sources(undefined), library: librarySource() });
    bindTestLibraryPdf(presenter, coordinator);

    await presenter.citeLibraryHighlight(highlight);
    expect(routes.presentNotice).toHaveBeenLastCalledWith("Place the manuscript caret before citing a highlight.");

    coordinator.canInsertCitation.mockReturnValue(true);
    librarySource.mockReturnValue(library);
    presenter.present({ ...sources(undefined), library: librarySource() });
    await presenter.citeLibraryHighlight(highlight);
    expect(routes.presentNotice).toHaveBeenLastCalledWith("The highlighted source is no longer available in the library.");
    expect(routes.insertCitation).not.toHaveBeenCalled();
  });
});
