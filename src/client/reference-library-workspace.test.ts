import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryPdfArtifact, ReferenceLibrarySnapshot } from "../domain/reference-library";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import { citationNetworkOutcomeEvent, CitationNetworkWorkspace } from "./citation-network-workspace";
import { libraryReferenceMetadataNoticeEvent, libraryReferenceMetadataRefreshEvent } from "./library-reference-metadata-editor";
import { libraryReferencePdfActionEvent, libraryReferencePdfRefreshEvent } from "./library-reference-pdf-rows";
import { libraryReferencePersonalRefreshEvent } from "./library-reference-personal-fields";
import { libraryReferenceImportRefreshEvent, LibraryReferenceImportControl } from "./library-reference-import-control";
import { libraryReferenceResearchActionEvent } from "./library-reference-research-rows";
import { LibraryReferenceList } from "./library-reference-list";
import { libraryReferenceSummaryActionEvent } from "./library-reference-summary";
import { libraryDiscoveryRefreshEvent, LibraryDiscoveryResults } from "./library-discovery-results";
import { libraryDiscoveryResultsEvent } from "./library-discovery-search";
import { libraryPdfUploadOutcomeEvent, LibraryPdfUploadControl } from "./library-pdf-upload-control";
import { libraryPdfUploadRevealEvent, LibraryPdfUploadStatus } from "./library-pdf-upload-status";
import { libraryToolsActionEvent, libraryToolsArchiveRefreshEvent, LibraryToolsMenu } from "./library-tools-menu";
import { ReferenceLibraryFilterPanel, referenceLibraryFilterChangeEvent } from "./reference-library-filters";
import { ReferenceLibraryWorkspace } from "./reference-library-workspace";
import { referenceReconciliationOutcomeEvent, ReferenceReconciliationPanel } from "./reference-reconciliation-panel";
import { projectReferenceChangedEvent } from "./project-reference-mutation";
import { projectResearchChangedEvent } from "./project-research-mutation";
import { unidentifiedPdfRefreshEvent, UnidentifiedPdfList } from "./unidentified-pdf-list";
import { webSourceCapturedEvent, WebSourceCapture } from "./web-source-panels";

class TestReferenceLibraryWorkspace extends ReferenceLibraryWorkspace {
  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  updatesForTest(): boolean {
    return this.shouldUpdate();
  }
}

function setup() {
  const workspace = new TestReferenceLibraryWorkspace();
  const owners = {
    "citation-network-workspace": new CitationNetworkWorkspace(),
    "library-discovery-results": new LibraryDiscoveryResults(),
    "library-pdf-upload-control": new LibraryPdfUploadControl(),
    "library-pdf-upload-status": new LibraryPdfUploadStatus(),
    "library-reference-list": new LibraryReferenceList(),
    "library-reference-import-control": new LibraryReferenceImportControl(),
    "library-tools-menu": new LibraryToolsMenu(),
    "reference-library-filters": new ReferenceLibraryFilterPanel(),
    "reference-reconciliation-panel": new ReferenceReconciliationPanel(),
    "unidentified-pdf-list": new UnidentifiedPdfList(),
    "web-source-capture": new WebSourceCapture(),
  };
  Object.defineProperty(workspace, "querySelector", {
    value: (selector: string) => owners[selector as keyof typeof owners] ?? null,
  });
  return { owners, workspace };
}

function historyHarness() {
  const pushState = vi.fn();
  const replaceState = vi.fn();
  return { history: { pushState, replaceState, state: null }, pushState, replaceState };
}

function bindOwnerHarness(
  workspace: ReferenceLibraryWorkspace,
  overrides: Partial<{
    activateLibrary: () => void;
    applyProjectMutation: (snapshot: typeof workspaceSnapshotFixture) => Promise<void>;
    compareSnapshots: (priorId: string, currentId: string) => void;
    openPdf: (artifact: LibraryPdfArtifact, page?: number, updateHistory?: boolean) => void;
    presentNotice: (message: string) => void;
    refreshLibrary: () => Promise<void>;
    refreshProject: () => Promise<void>;
  }> = {},
  workspaceId = "workspace",
  projectApiBase: string | null = null,
) {
  const callbacks = {
    activateLibrary: vi.fn(),
    applyProjectMutation: vi.fn().mockResolvedValue(undefined),
    compareSnapshots: vi.fn(),
    openPdf: vi.fn(),
    presentNotice: vi.fn(),
    refreshLibrary: vi.fn().mockResolvedValue(undefined),
    refreshProject: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  workspace.bindWorkspace(workspaceId, projectApiBase, {
    contextResourcePresenter: {
      activeKey: "preview",
      navigateContext: callbacks.activateLibrary,
      openLibraryPdf: async (...args) => callbacks.openPdf(...args),
      presentBoundContext: vi.fn(),
      refreshLibraryContext: vi.fn().mockResolvedValue(undefined),
    },
    projectFileDialog: {
      project: workspaceSnapshotFixture,
      acceptProjectMutation: callbacks.applyProjectMutation,
      refreshProject: callbacks.refreshProject,
    },
    toast: { show: callbacks.presentNotice },
    webSnapshotComparison: { compare: async (...args) => callbacks.compareSnapshots(...args) },
    workspaceSurfaceSwitcher: { syncRoute: vi.fn() },
  });
  vi.spyOn(workspace, "refreshBoundProject").mockImplementation(callbacks.refreshLibrary);
  return callbacks;
}

const library: ReferenceLibrarySnapshot = {
  artifacts: [],
  collections: {},
  highlights: [],
  notes: [],
  reading: [],
  referenceKeyStates: {},
  references: [
    {
      abstract: "",
      archivedAt: null,
      authors: [],
      createdAt: "created",
      deletedAt: null,
      doi: "",
      id: "reference-1",
      provenance: {},
      referenceKey: "source2026",
      title: "Source {2026}",
      type: "article",
      updatedAt: "updated",
      url: "",
      venue: "",
      year: "2026",
    },
  ],
  tags: {},
  webSnapshots: [],
  webSources: [],
};

const artifact: LibraryPdfArtifact = {
  contentType: "application/pdf",
  createdAt: "created",
  fingerprint: "fingerprint",
  id: "artifact-1",
  name: "paper.pdf",
  objectKey: "library/paper.pdf",
  referenceId: "reference-1",
  rights: "private",
  size: 1024,
};

describe("reference Library workspace", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("composes canonical Library presentation and filter changes", () => {
    const { owners, workspace } = setup();
    const setReferences = vi.spyOn(owners["citation-network-workspace"], "setReferences");
    const setArtifacts = vi.spyOn(owners["citation-network-workspace"], "setArtifacts");
    const filterLibrary = vi.spyOn(owners["reference-library-filters"], "filterLibrary").mockReturnValue(library.references);
    const setData = vi.spyOn(owners["library-reference-list"], "setData");
    const setLibrary = vi.spyOn(owners["unidentified-pdf-list"], "setLibrary");
    const data = { library, projectApiBase: "/api/workspaces/project-1", projectReferences: [], researchShares: [] };

    workspace.setData(data);

    expect(workspace.snapshot).toBe(library);
    expect(setReferences).toHaveBeenCalledWith(library.references);
    expect(setArtifacts).toHaveBeenCalledWith(library.artifacts);
    expect(filterLibrary).toHaveBeenCalledWith(library, []);
    expect(setData).toHaveBeenCalledWith({ ...data, references: library.references });
    expect(setLibrary).toHaveBeenCalledWith(library);
    workspace.dispatchEvent(new CustomEvent(referenceLibraryFilterChangeEvent));
    expect(setData).toHaveBeenCalledTimes(2);
    expect(workspace.rootForTest()).toBe(workspace);
    expect(workspace.updatesForTest()).toBe(false);
  });

  it("loads and validates its canonical Library snapshot", async () => {
    const { workspace } = setup();
    const fetcher = vi.fn(async () => Response.json(library));

    await expect(workspace.refresh(fetcher)).resolves.toEqual(library);
    expect(fetcher).toHaveBeenCalledWith("/api/library", { credentials: "same-origin" });
    expect(workspace.snapshot).toEqual(library);

    vi.spyOn(workspace, "includesArchivedReferences", "get").mockReturnValue(true);
    await workspace.refresh(fetcher);
    expect(fetcher).toHaveBeenLastCalledWith("/api/library?archived=include", { credentials: "same-origin" });
    await expect(workspace.refresh(async () => Response.json({ references: [] }))).rejects.toThrow(
      "Reference library returned an invalid snapshot",
    );
  });

  it("owns canonical project mutation application and Library projection", async () => {
    const { owners, workspace } = setup();
    const applyProjectMutation = vi.fn().mockResolvedValue(undefined);
    const setData = vi.spyOn(owners["library-reference-list"], "setData");
    bindOwnerHarness(workspace, { applyProjectMutation });

    workspace.presentProject(workspaceSnapshotFixture, "/api/workspaces/workspace");
    expect(setData).not.toHaveBeenCalled();

    workspace.setData({ library, projectApiBase: "/api/workspaces/workspace", projectReferences: [], researchShares: [] });
    await workspace.applyProjectMutation(workspaceSnapshotFixture);

    expect(applyProjectMutation).toHaveBeenCalledWith(workspaceSnapshotFixture);
    expect(setData).toHaveBeenLastCalledWith({
      library,
      projectApiBase: "/api/workspaces/workspace",
      projectReferences: [],
      references: library.references,
      researchShares: [],
    });
  });

  it("owns bound Library refresh and cross-feature reconciliation sequencing", async () => {
    const { workspace } = setup();
    const refresh = vi.spyOn(workspace, "refresh").mockResolvedValue(library);
    const presentProject = vi.spyOn(workspace, "presentProject").mockImplementation(() => undefined);
    const settled = vi.spyOn(workspace, "settled").mockResolvedValue();
    const refreshLibraryContext = vi.fn().mockResolvedValue(undefined);
    const presentBoundContext = vi.fn();
    const syncRoute = vi.fn();
    workspace.bindWorkspace("workspace", "/api/workspaces/workspace", {
      contextResourcePresenter: {
        activeKey: "library",
        navigateContext: vi.fn(),
        openLibraryPdf: vi.fn().mockResolvedValue(undefined),
        presentBoundContext,
        refreshLibraryContext,
      },
      projectFileDialog: {
        project: workspaceSnapshotFixture,
        acceptProjectMutation: vi.fn().mockResolvedValue(undefined),
        refreshProject: vi.fn().mockResolvedValue(undefined),
      },
      toast: { show: vi.fn() },
      webSnapshotComparison: { compare: vi.fn().mockResolvedValue(undefined) },
      workspaceSurfaceSwitcher: { syncRoute },
    });

    await workspace.refreshBoundProject();

    expect(refresh).toHaveBeenCalledOnce();
    expect(refreshLibraryContext).toHaveBeenCalledWith(workspaceSnapshotFixture, library);
    expect(presentProject).toHaveBeenCalledWith(workspaceSnapshotFixture, "/api/workspaces/workspace");
    expect(settled).toHaveBeenCalledOnce();
    expect(presentBoundContext).toHaveBeenCalledOnce();
    expect(syncRoute).toHaveBeenCalledWith("replace");
    expect(refreshLibraryContext.mock.invocationCallOrder[0]).toBeLessThan(presentProject.mock.invocationCallOrder[0] ?? 0);
    expect(presentProject.mock.invocationCallOrder[0]).toBeLessThan(presentBoundContext.mock.invocationCallOrder[0] ?? 0);
  });

  it("owns Library activation, optional route entry, and refresh sequencing", async () => {
    const { workspace } = setup();
    const activateLibrary = vi.fn();
    const browser = historyHarness();
    const refreshLibrary = vi.fn().mockResolvedValue(undefined);
    bindOwnerHarness(workspace, { activateLibrary, refreshLibrary });
    workspace.bindBrowserRoute(true, browser.history);

    await workspace.open(false);
    await workspace.open();

    expect(activateLibrary).toHaveBeenCalledTimes(2);
    expect(browser.pushState).toHaveBeenCalledWith({ view: "library" }, "", "/library");
    expect(refreshLibrary).toHaveBeenCalledTimes(2);
  });

  it("owns standalone Library shell startup and route restoration", async () => {
    const { workspace } = setup();
    const browser = historyHarness();
    const connection = { setConnection: vi.fn() };
    const surfaces = { dataset: {} } as HTMLElement;
    const open = vi.spyOn(workspace, "open").mockResolvedValue(undefined);
    const restoreBrowserRoute = vi.spyOn(workspace, "restoreBrowserRoute").mockResolvedValue(undefined);

    const owners = {
      connectionStatus: connection,
      contextResourcePresenter: {
        activeKey: "preview",
        navigateContext: vi.fn(),
        openLibraryPdf: vi.fn().mockResolvedValue(undefined),
        presentBoundContext: vi.fn(),
        refreshLibraryContext: vi.fn().mockResolvedValue(undefined),
      },
      projectFileDialog: {
        project: workspaceSnapshotFixture,
        acceptProjectMutation: vi.fn().mockResolvedValue(undefined),
        refreshProject: vi.fn().mockResolvedValue(undefined),
      },
      toast: { show: vi.fn() },
      webSnapshotComparison: { compare: vi.fn().mockResolvedValue(undefined) },
      workspaceSurfaceSwitcher: { syncRoute: vi.fn() },
      workspaceSurfaces: surfaces,
    };
    await expect(workspace.start("workspace", "/api/workspaces/workspace", owners, browser.history)).resolves.toBe(false);
    await expect(workspace.start("workspace", null, owners, browser.history)).resolves.toBe(true);

    expect(surfaces.dataset).toMatchObject({ activeSurface: "context", layout: "context" });
    expect(connection.setConnection).toHaveBeenCalledWith("Private library", true);
    expect(open).toHaveBeenCalledWith(false);
    expect(restoreBrowserRoute).toHaveBeenCalledOnce();
  });

  it("restores Library reference and PDF routes through typed effects", async () => {
    const { workspace } = setup();
    const activateLibrary = vi.fn();
    const browser = historyHarness();
    const openPdf = vi.fn();
    const presentNotice = vi.fn();
    bindOwnerHarness(workspace, { activateLibrary, openPdf, presentNotice });
    workspace.bindBrowserRoute(true, browser.history);
    workspace.setData({
      library: { ...library, artifacts: [artifact] },
      projectApiBase: null,
      projectReferences: [],
      researchShares: [],
    });
    vi.spyOn(workspace, "openReference").mockResolvedValue(false);

    await workspace.restoreRoute({ kind: "library", referenceId: "missing" });
    await workspace.restoreRoute({ artifactId: artifact.id, kind: "pdf", page: 4 });
    await workspace.restoreRoute({ artifactId: "missing", kind: "pdf", page: 1 });

    expect(activateLibrary).toHaveBeenCalledOnce();
    expect(browser.replaceState).toHaveBeenCalledTimes(2);
    expect(browser.replaceState).toHaveBeenLastCalledWith({ view: "library" }, "", "/library");
    expect(openPdf).toHaveBeenCalledWith(artifact, 4, false);
    expect(presentNotice).toHaveBeenCalledWith("That PDF is no longer in the library.");
  });

  it("owns browser route parsing, restoration, and listener teardown", async () => {
    const { workspace } = setup();
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    vi.stubGlobal("location", { href: "https://example.test/library?reference=reference-1" });
    const restoreRoute = vi.spyOn(workspace, "restoreRoute").mockResolvedValue();
    const routeHistory = historyHarness();
    workspace.bindBrowserRoute(true, routeHistory.history);

    await workspace.restoreBrowserRoute();
    browser.dispatchEvent(new Event("popstate"));
    expect(restoreRoute).toHaveBeenCalledTimes(2);
    expect(restoreRoute).toHaveBeenLastCalledWith({ kind: "library", referenceId: "reference-1" });

    workspace.pushPdfRoute("artifact/id", 3);
    workspace.replacePdfRoute("artifact/id", 4, "/library/pdfs/artifact%2Fid");
    workspace.replacePdfRoute(undefined, 5, "/library/pdfs/artifact%2Fid");
    workspace.replacePdfRoute("artifact/id", 5, "/library");
    workspace.replaceLibraryRoute();
    expect(routeHistory.pushState).toHaveBeenCalledWith(
      { view: "library-pdf", artifactId: "artifact/id" },
      "",
      "/library/pdfs/artifact%2Fid?page=3",
    );
    expect(routeHistory.replaceState).toHaveBeenNthCalledWith(1, null, "", "/library/pdfs/artifact%2Fid?page=4");
    expect(routeHistory.replaceState).toHaveBeenNthCalledWith(2, { view: "library" }, "", "/library");

    workspace.disconnectedCallback();
    browser.dispatchEvent(new Event("popstate"));
    expect(restoreRoute).toHaveBeenCalledTimes(2);
  });

  it("focuses an available archived reference and owns missing feedback", async () => {
    const { workspace } = setup();
    const presentNotice = vi.fn();
    const refreshLibrary = vi.fn(async () => undefined);
    bindOwnerHarness(workspace, { presentNotice, refreshLibrary });
    workspace.setData({ library: { ...library, references: [] }, projectApiBase: null, projectReferences: [], researchShares: [] });
    vi.spyOn(workspace, "showArchivedReferences").mockReturnValue(true);
    vi.spyOn(workspace, "openReference").mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(workspace.focusAvailableReference("reference-1")).resolves.toBe(true);
    await expect(workspace.focusAvailableReference("missing")).resolves.toBe(false);

    expect(refreshLibrary).toHaveBeenCalledTimes(2);
    expect(presentNotice).toHaveBeenCalledWith("That reference is no longer available in the Library.");
  });

  it("owns activate, refresh, focus, and route sequencing for available references", async () => {
    const { workspace } = setup();
    const activateLibrary = vi.fn();
    const browser = historyHarness();
    const refreshLibrary = vi.fn().mockResolvedValue(undefined);
    bindOwnerHarness(workspace, { activateLibrary, refreshLibrary });
    workspace.bindBrowserRoute(true, browser.history);
    vi.spyOn(workspace, "focusAvailableReference").mockResolvedValue(true);

    await workspace.openAvailableReference("reference-1");

    expect(activateLibrary).toHaveBeenCalledOnce();
    expect(refreshLibrary).toHaveBeenCalledOnce();
    expect(browser.pushState).toHaveBeenCalledWith(
      { view: "library-reference", referenceId: "reference-1" },
      "",
      "/library?reference=reference-1",
    );
  });

  it("owns filter reset, result settlement, and focused-reference reveal", async () => {
    const { owners, workspace } = setup();
    const filters = owners["reference-library-filters"];
    const list = owners["library-reference-list"];
    const reset = vi.spyOn(filters, "reset");
    const focusReference = vi.spyOn(list, "focusReference").mockResolvedValue(true);
    const settled = vi.spyOn(list, "settled").mockResolvedValue();
    workspace.setData({ library, projectApiBase: null, projectReferences: [], researchShares: [] });

    await expect(workspace.openReference("reference-1")).resolves.toBe(true);
    expect(reset).toHaveBeenCalledWith("");
    expect(focusReference).toHaveBeenCalledWith("reference-1", { block: "center", expand: true });
    await expect(workspace.revealReference("reference-1", "source2026")).resolves.toBe(true);
    expect(reset).toHaveBeenLastCalledWith("source2026");
    expect(focusReference).toHaveBeenLastCalledWith("reference-1", { block: "nearest" });
    await workspace.settled();
    expect(settled).toHaveBeenCalledOnce();
  });

  it("delegates citation-network lifecycle and PDF-identification completion", async () => {
    const { owners, workspace } = setup();
    const network = owners["citation-network-workspace"];
    const configure = vi.spyOn(network, "configure");
    const open = vi.spyOn(network, "open").mockResolvedValue();
    const complete = vi.spyOn(owners["unidentified-pdf-list"], "complete");

    bindOwnerHarness(workspace, {}, "project-1");
    await workspace.openCitationNetwork("reference-1");
    workspace.completePdfIdentification(3);

    expect(configure).toHaveBeenCalledWith("project-1");
    expect(open).toHaveBeenCalledWith("reference-1");
    expect(complete).toHaveBeenCalledWith(3);
  });

  it("keeps reference-trail refocus in browser history", () => {
    const { workspace } = setup();
    const { history, pushState } = historyHarness();
    workspace.bindBrowserRoute(true, history);

    workspace.dispatchEvent(new CustomEvent(citationNetworkOutcomeEvent, { detail: { action: "route", referenceId: "reference:next" } }));

    expect(pushState).toHaveBeenCalledWith(
      { view: "citation-network", referenceId: "reference:next" },
      "",
      "/library?trail=reference%3Anext",
    );
  });

  it("refreshes an open citation network after accepting a parsed PDF reference", async () => {
    const { owners, workspace } = setup();
    const refreshLibrary = vi.spyOn(workspace, "refreshBoundProject").mockResolvedValue();
    const refreshNetwork = vi.spyOn(owners["citation-network-workspace"], "refresh").mockResolvedValue();
    owners["citation-network-workspace"].hidden = false;

    await workspace.completePdfReferenceReview("Parsed reference added");

    expect(refreshLibrary).toHaveBeenCalledOnce();
    expect(refreshNetwork).toHaveBeenCalledOnce();
  });

  it("routes child Library outcomes through its refresh boundary", async () => {
    const { owners, workspace } = setup();
    const callbacks = bindOwnerHarness(workspace, {}, "project-1");
    const completeIdentification = vi.spyOn(owners["unidentified-pdf-list"], "complete");
    const captureUrl = vi.spyOn(owners["web-source-capture"], "captureUrl").mockResolvedValue();

    workspace.dispatchEvent(
      new CustomEvent(projectReferenceChangedEvent, { detail: { message: "Reference linked", snapshot: workspaceSnapshotFixture } }),
    );
    workspace.dispatchEvent(
      new CustomEvent(projectResearchChangedEvent, { detail: { message: "Research shared", snapshot: workspaceSnapshotFixture } }),
    );

    workspace.dispatchEvent(new CustomEvent(citationNetworkOutcomeEvent, { detail: { action: "notice", message: "Network notice" } }));
    workspace.dispatchEvent(
      new CustomEvent(citationNetworkOutcomeEvent, { detail: { action: "library-refresh", message: "Candidate saved" } }),
    );
    workspace.dispatchEvent(
      new CustomEvent(referenceReconciliationOutcomeEvent, { detail: { action: "library-refresh", message: "Duplicates merged" } }),
    );
    workspace.dispatchEvent(new CustomEvent(libraryReferenceSummaryActionEvent, { detail: { action: "open-pdf", artifact } }));
    workspace.dispatchEvent(
      new CustomEvent(libraryReferenceSummaryActionEvent, {
        detail: { action: "open-citation-network", referenceId: "reference-1" },
      }),
    );
    workspace.dispatchEvent(new CustomEvent(libraryReferencePersonalRefreshEvent, { detail: "Personal fields saved" }));
    workspace.dispatchEvent(new CustomEvent(libraryReferenceMetadataNoticeEvent, { detail: "Metadata notice" }));
    workspace.dispatchEvent(new CustomEvent(libraryReferenceMetadataRefreshEvent, { detail: "Metadata saved" }));
    workspace.dispatchEvent(new CustomEvent(libraryReferencePdfActionEvent, { detail: { action: "open", artifact } }));
    workspace.dispatchEvent(
      new CustomEvent(libraryReferencePdfActionEvent, { detail: { action: "refine", artifact, reference: library.references[0] } }),
    );
    workspace.dispatchEvent(new CustomEvent(libraryReferencePdfRefreshEvent));
    workspace.dispatchEvent(
      new CustomEvent(libraryReferenceResearchActionEvent, { detail: { action: "capture", canonicalUrl: "https://example.test" } }),
    );
    workspace.dispatchEvent(
      new CustomEvent(libraryReferenceResearchActionEvent, { detail: { action: "compare", priorId: "prior", currentId: "current" } }),
    );
    workspace.dispatchEvent(new CustomEvent(unidentifiedPdfRefreshEvent, { detail: { message: "PDF identified", requestId: 7 } }));

    expect(callbacks.presentNotice).toHaveBeenCalledWith("Network notice");
    await vi.waitFor(() => expect(callbacks.applyProjectMutation).toHaveBeenCalledTimes(2));
    expect(callbacks.applyProjectMutation).toHaveBeenNthCalledWith(1, workspaceSnapshotFixture);
    expect(callbacks.applyProjectMutation).toHaveBeenNthCalledWith(2, workspaceSnapshotFixture);
    await vi.waitFor(() => {
      expect(callbacks.presentNotice).toHaveBeenCalledWith("Reference linked");
      expect(callbacks.presentNotice).toHaveBeenCalledWith("Research shared");
    });
    expect(callbacks.presentNotice).toHaveBeenCalledWith("Metadata notice");
    expect(callbacks.openPdf).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(callbacks.refreshLibrary).toHaveBeenCalledTimes(6));
    expect(callbacks.refreshProject).toHaveBeenCalledOnce();
    expect(captureUrl).toHaveBeenCalledWith("https://example.test");
    expect(callbacks.compareSnapshots).toHaveBeenCalledWith("prior", "current");
    await vi.waitFor(() => expect(completeIdentification).toHaveBeenCalledWith(7));
    expect(callbacks.presentNotice).toHaveBeenCalledWith("Candidate saved");
    expect(callbacks.presentNotice).toHaveBeenCalledWith("Personal fields saved");
    expect(callbacks.presentNotice).toHaveBeenCalledWith("Metadata saved");
    expect(callbacks.presentNotice).toHaveBeenCalledWith("PDF identified");
  });

  it("routes full-surface Library discovery and intake outcomes", async () => {
    const { owners, workspace } = setup();
    const callbacks = bindOwnerHarness(workspace, {}, "project-1");
    const setResults = vi.spyOn(owners["library-discovery-results"], "setResults");
    const openNetwork = vi.spyOn(owners["citation-network-workspace"], "open").mockResolvedValue();
    const openReconciliation = vi.spyOn(owners["reference-reconciliation-panel"], "open").mockResolvedValue();
    vi.spyOn(workspace, "showArchivedReferences").mockReturnValue(true);
    vi.spyOn(workspace, "revealReference").mockResolvedValue(false);
    const existing = { archived: true, referenceId: "reference-1", referenceKey: "source2026" };

    workspace.dispatchEvent(new CustomEvent(libraryDiscoveryResultsEvent, { detail: [] }));
    workspace.dispatchEvent(
      new CustomEvent(libraryDiscoveryRefreshEvent, { detail: { index: 2, message: "Reference saved", requestId: 3 } }),
    );
    workspace.dispatchEvent(
      new CustomEvent(libraryReferenceImportRefreshEvent, { detail: { message: "References imported", requestId: 4 } }),
    );
    workspace.dispatchEvent(new CustomEvent(libraryPdfUploadOutcomeEvent, { detail: { action: "notice", message: "Upload notice" } }));
    workspace.dispatchEvent(
      new CustomEvent(libraryPdfUploadOutcomeEvent, { detail: { action: "refresh", message: "PDF uploaded", requestId: 5 } }),
    );
    workspace.dispatchEvent(new CustomEvent(libraryPdfUploadRevealEvent, { detail: existing }));
    workspace.dispatchEvent(new CustomEvent(webSourceCapturedEvent, { detail: "Website captured" }));
    workspace.dispatchEvent(new CustomEvent(libraryToolsActionEvent, { detail: "open-citation-network" }));
    workspace.dispatchEvent(new CustomEvent(libraryToolsActionEvent, { detail: "open-reconciliation" }));
    workspace.dispatchEvent(new CustomEvent(libraryToolsActionEvent, { detail: "archive-visibility-change" }));
    workspace.dispatchEvent(new CustomEvent(libraryToolsArchiveRefreshEvent, { detail: { message: "Archive restored", requestId: 6 } }));

    expect(setResults).toHaveBeenCalledWith([]);
    await vi.waitFor(() => expect(callbacks.refreshLibrary).toHaveBeenCalledTimes(7));
    expect(callbacks.presentNotice).toHaveBeenCalledWith("Upload notice");
    await vi.waitFor(() => expect(callbacks.presentNotice).toHaveBeenCalledWith("Library source source2026 is not available."));
    expect(openNetwork).toHaveBeenCalledOnce();
    expect(openReconciliation).toHaveBeenCalledOnce();
    expect(callbacks.presentNotice).toHaveBeenCalledWith("Reference saved");
    expect(callbacks.presentNotice).toHaveBeenCalledWith("References imported");
    expect(callbacks.presentNotice).toHaveBeenCalledWith("PDF uploaded");
    expect(callbacks.presentNotice).toHaveBeenCalledWith("Website captured");
    expect(callbacks.presentNotice).toHaveBeenCalledWith("Archive restored");
  });

  it("contains refresh failures and always completes local request state", async () => {
    const { workspace } = setup();
    const complete = vi.fn();
    const presentNotice = vi.fn();
    bindOwnerHarness(workspace, {
      presentNotice,
      refreshLibrary: vi.fn().mockRejectedValue(new Error("offline")),
    });

    await workspace.completeRefresh("Saved", "Refresh failed", { complete });

    expect(presentNotice).toHaveBeenCalledWith("Refresh failed");
    expect(complete).toHaveBeenCalledOnce();
  });
});
