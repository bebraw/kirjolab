import { LitElement } from "lit";
import {
  isReferenceLibrarySnapshot,
  type LibraryPdfArtifact,
  type ReferenceLibrarySnapshot,
  type ResearchShareSnapshot,
} from "../domain/reference-library";
import type { ReferenceDiscoveryResult } from "../domain/reference-discovery";
import type { ProjectReferenceLink, WorkspaceSnapshot } from "../domain/workspace";
import { citationNetworkOutcomeEvent, CitationNetworkWorkspace, type CitationNetworkOutcome } from "./citation-network-workspace";
import { expectOk } from "./http";
import { libraryReferenceMetadataNoticeEvent, libraryReferenceMetadataRefreshEvent } from "./library-reference-metadata-editor";
import {
  libraryReferencePdfActionEvent,
  libraryReferencePdfRefreshEvent,
  type LibraryReferencePdfAction,
} from "./library-reference-pdf-rows";
import { libraryReferencePersonalRefreshEvent } from "./library-reference-personal-fields";
import {
  libraryReferenceImportRefreshEvent,
  LibraryReferenceImportControl,
  type LibraryReferenceImportRefresh,
} from "./library-reference-import-control";
import { libraryReferenceResearchActionEvent, type LibraryReferenceResearchAction } from "./library-reference-research-rows";
import { LibraryReferenceList } from "./library-reference-list";
import { libraryReferenceSummaryActionEvent, type LibraryReferenceSummaryAction } from "./library-reference-summary";
import { libraryDiscoveryRefreshEvent, LibraryDiscoveryResults, type LibraryDiscoveryRefresh } from "./library-discovery-results";
import { libraryDiscoveryResultsEvent } from "./library-discovery-search";
import { libraryPdfUploadOutcomeEvent, LibraryPdfUploadControl, type LibraryPdfUploadOutcome } from "./library-pdf-upload-control";
import { libraryPdfUploadRevealEvent, LibraryPdfUploadStatus } from "./library-pdf-upload-status";
import { readLibraryUiRoute, type LibraryUiRoute } from "./library-ui-route";
import {
  libraryToolsActionEvent,
  libraryToolsArchiveRefreshEvent,
  LibraryToolsMenu,
  type LibraryToolsAction,
  type LibraryToolsArchiveRefresh,
} from "./library-tools-menu";
import type { ExistingPdfUpload } from "./pdf-upload-queue";
import { projectReferenceChangedEvent, type ProjectReferenceChanged } from "./project-reference-mutation";
import { projectResearchChangedEvent, type ProjectResearchChanged } from "./project-research-mutation";
import { ReferenceLibraryFilterPanel, referenceLibraryFilterChangeEvent } from "./reference-library-filters";
import { unidentifiedPdfRefreshEvent, UnidentifiedPdfList, type UnidentifiedPdfRefresh } from "./unidentified-pdf-list";
import { webSourceCapturedEvent, WebSourceCapture } from "./web-source-panels";

export interface ReferenceLibraryWorkspaceData {
  readonly library: ReferenceLibrarySnapshot;
  readonly projectApiBase: string | null;
  readonly projectReferences: readonly ProjectReferenceLink[];
  readonly researchShares: readonly ResearchShareSnapshot[];
}

interface LibraryRefreshOptions {
  readonly complete?: () => void;
  readonly refresh?: () => Promise<void>;
}

export interface ReferenceLibraryWorkspaceCallbacks {
  readonly activateLibrary?: () => void;
  readonly applyProjectMutation?: (snapshot: ProjectReferenceChanged["snapshot"]) => Promise<void>;
  readonly compareSnapshots: (priorId: string, currentId: string) => void;
  readonly openPdf: (artifact: LibraryPdfArtifact, page?: number, updateHistory?: boolean) => void;
  readonly presentNotice: (message: string) => void;
  readonly refreshLibrary: () => Promise<void>;
  readonly refreshMetadata: () => Promise<void>;
}

export interface ReferenceLibraryHistory {
  readonly state: unknown;
  pushState(data: unknown, unused: string, url: string): void;
  replaceState(data: unknown, unused: string, url: string): void;
}

const emptyCallbacks: ReferenceLibraryWorkspaceCallbacks = {
  compareSnapshots: () => undefined,
  openPdf: () => undefined,
  presentNotice: () => undefined,
  refreshLibrary: () => Promise.resolve(),
  refreshMetadata: () => Promise.resolve(),
};

export class ReferenceLibraryWorkspace extends LitElement {
  private data: ReferenceLibraryWorkspaceData | null = null;
  private callbacks = emptyCallbacks;
  private librarySnapshot: ReferenceLibrarySnapshot | null = null;
  private browserHistory: ReferenceLibraryHistory | null = null;

  get snapshot(): ReferenceLibrarySnapshot | null {
    return this.librarySnapshot;
  }

  constructor() {
    super();
    this.addEventListener(projectReferenceChangedEvent, (event) => {
      const { message, snapshot } = (event as CustomEvent<ProjectReferenceChanged>).detail;
      void this.applyProjectMutation(snapshot, message);
    });
    this.addEventListener(projectResearchChangedEvent, (event) => {
      const { message, snapshot } = (event as CustomEvent<ProjectResearchChanged>).detail;
      void this.applyProjectMutation(snapshot, message);
    });
    this.addEventListener(referenceLibraryFilterChangeEvent, () => this.present());
    this.addEventListener(citationNetworkOutcomeEvent, (event) =>
      this.routeCitationOutcome((event as CustomEvent<CitationNetworkOutcome>).detail),
    );
    this.addEventListener(libraryReferenceSummaryActionEvent, (event) => {
      const { artifact } = (event as CustomEvent<LibraryReferenceSummaryAction>).detail;
      this.callbacks.openPdf(artifact);
    });
    this.addEventListener(libraryReferencePersonalRefreshEvent, (event) => {
      void this.completeRefresh(
        (event as CustomEvent<string>).detail,
        "The private reference was updated, but the refreshed Library could not be loaded.",
      );
    });
    this.addEventListener(libraryReferenceMetadataNoticeEvent, (event) => {
      this.callbacks.presentNotice((event as CustomEvent<string>).detail);
    });
    this.addEventListener(libraryReferenceMetadataRefreshEvent, (event) => {
      void this.completeRefresh(
        (event as CustomEvent<string>).detail,
        "Metadata was applied, but the refreshed Library could not be loaded.",
        { refresh: this.callbacks.refreshMetadata },
      );
    });
    this.addEventListener(libraryReferencePdfActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferencePdfAction>).detail;
      if (detail.action === "open") this.callbacks.openPdf(detail.artifact);
    });
    this.addEventListener(libraryReferencePdfRefreshEvent, () => void this.callbacks.refreshLibrary());
    this.addEventListener(libraryReferenceResearchActionEvent, (event) => {
      this.routeResearchAction((event as CustomEvent<LibraryReferenceResearchAction>).detail);
    });
    this.addEventListener(unidentifiedPdfRefreshEvent, (event) => {
      const detail = (event as CustomEvent<UnidentifiedPdfRefresh>).detail;
      void this.completeRefresh(detail.message, "The PDF was identified, but the refreshed Library could not be loaded.", {
        complete: () => this.completePdfIdentification(detail.requestId),
      });
    });
    this.addEventListener(libraryDiscoveryResultsEvent, (event) => {
      this.element("library-discovery-results", LibraryDiscoveryResults)?.setResults(
        (event as CustomEvent<readonly ReferenceDiscoveryResult[]>).detail,
      );
    });
    this.addEventListener(libraryDiscoveryRefreshEvent, (event) => {
      const detail = (event as CustomEvent<LibraryDiscoveryRefresh>).detail;
      void this.completeRefresh(detail.message, "The reference was saved, but the refreshed Library could not be loaded.", {
        complete: () => this.element("library-discovery-results", LibraryDiscoveryResults)?.complete(detail.index, detail.requestId),
      });
    });
    this.addEventListener(libraryReferenceImportRefreshEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferenceImportRefresh>).detail;
      void this.completeRefresh(detail.message, "References were imported, but the refreshed Library could not be loaded.", {
        complete: () => this.element("library-reference-import-control", LibraryReferenceImportControl)?.complete(detail.requestId),
      });
    });
    this.addEventListener(libraryPdfUploadOutcomeEvent, (event) => {
      this.routeUploadOutcome((event as CustomEvent<LibraryPdfUploadOutcome>).detail);
    });
    this.addEventListener(libraryPdfUploadRevealEvent, (event) => {
      void this.revealExistingPdf((event as CustomEvent<ExistingPdfUpload>).detail);
    });
    this.addEventListener(webSourceCapturedEvent, (event) => {
      void this.completeRefresh(
        (event as CustomEvent<string>).detail,
        "The web source was captured, but the refreshed Library could not be loaded.",
      );
    });
    this.addEventListener(libraryToolsActionEvent, (event) => {
      this.routeToolsAction((event as CustomEvent<LibraryToolsAction>).detail);
    });
    this.addEventListener(libraryToolsArchiveRefreshEvent, (event) => {
      const detail = (event as CustomEvent<LibraryToolsArchiveRefresh>).detail;
      void this.completeRefresh(detail.message, "The archive was restored, but the refreshed Library could not be loaded.", {
        complete: () => this.element("library-tools-menu", LibraryToolsMenu)?.completeArchiveRestore(detail.requestId),
      });
    });
  }

  setData(data: ReferenceLibraryWorkspaceData): void {
    this.data = data;
    this.librarySnapshot = data.library;
    this.present();
  }

  presentProject(snapshot: WorkspaceSnapshot | null, projectApiBase: string | null): void {
    if (!this.librarySnapshot) return;
    this.setData({
      library: this.librarySnapshot,
      projectApiBase,
      projectReferences: snapshot?.projectReferences ?? [],
      researchShares: snapshot?.researchShares ?? [],
    });
  }

  async applyProjectMutation(snapshot: WorkspaceSnapshot, message?: string): Promise<void> {
    await this.callbacks.applyProjectMutation?.(snapshot);
    this.presentProject(snapshot, this.data?.projectApiBase ?? null);
    if (message) this.callbacks.presentNotice(message);
  }

  async refresh(fetcher: typeof fetch = fetch): Promise<ReferenceLibrarySnapshot> {
    const archived = this.includesArchivedReferences ? "?archived=include" : "";
    const response = await fetcher(`/api/library${archived}`, { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isReferenceLibrarySnapshot(value)) throw new Error("Reference library returned an invalid snapshot");
    this.librarySnapshot = value;
    return value;
  }

  async restoreRoute(route: LibraryUiRoute): Promise<void> {
    if (route.kind === "library") {
      this.callbacks.activateLibrary?.();
      if (route.referenceId && !(await this.openReference(route.referenceId))) this.replaceBrowserRoute();
      return;
    }
    const artifact = this.snapshot?.artifacts.find(({ id }) => id === route.artifactId);
    if (artifact) {
      this.callbacks.openPdf(artifact, route.page, false);
      return;
    }
    this.replaceBrowserRoute();
    this.callbacks.presentNotice("That PDF is no longer in the library.");
  }

  restoreBrowserRoute(url = new URL(location.href)): Promise<void> {
    return this.restoreRoute(readLibraryUiRoute(url));
  }

  bindBrowserRoute(enabled: boolean, browserHistory: ReferenceLibraryHistory = history): void {
    this.browserHistory = enabled ? browserHistory : null;
    this.bindHistory();
  }

  async open(updateHistory = true): Promise<void> {
    this.callbacks.activateLibrary?.();
    if (updateHistory) this.pushBrowserRoute("/library", { view: "library" });
    await this.callbacks.refreshLibrary();
  }

  configure(workspaceId: string, callbacks?: ReferenceLibraryWorkspaceCallbacks): void {
    if (callbacks) this.callbacks = callbacks;
    this.element("citation-network-workspace", CitationNetworkWorkspace)?.configure(workspaceId);
    const upload = this.element("library-pdf-upload-control", LibraryPdfUploadControl);
    const status = this.element("library-pdf-upload-status", LibraryPdfUploadStatus);
    if (upload && status) upload.bindStatus(status);
  }

  openCitationNetwork(): Promise<void> {
    return this.element("citation-network-workspace", CitationNetworkWorkspace)?.open() ?? Promise.resolve();
  }

  captureUrl(url: string): void {
    void this.element("web-source-capture", WebSourceCapture)?.captureUrl(url);
  }

  get includesArchivedReferences(): boolean {
    return this.element("library-tools-menu", LibraryToolsMenu)?.includesArchivedReferences ?? false;
  }

  showArchivedReferences(): boolean {
    return this.element("library-tools-menu", LibraryToolsMenu)?.setShowArchived(true) ?? false;
  }

  completePdfIdentification(requestId: number): void {
    this.element("unidentified-pdf-list", UnidentifiedPdfList)?.complete(requestId);
  }

  async completeRefresh(message: string, fallback: string, options: LibraryRefreshOptions = {}): Promise<void> {
    try {
      await (options.refresh?.() ?? this.callbacks.refreshLibrary());
      this.callbacks.presentNotice(message);
    } catch {
      this.callbacks.presentNotice(fallback);
    } finally {
      options.complete?.();
    }
  }

  async settled(): Promise<void> {
    await this.element("library-reference-list", LibraryReferenceList)?.settled();
  }

  openReference(referenceId: string): Promise<boolean> {
    return this.focusReference(referenceId, "", { block: "center", expand: true });
  }

  async focusAvailableReference(referenceId: string): Promise<boolean> {
    if (!this.snapshot?.references.some(({ id }) => id === referenceId) && this.showArchivedReferences()) {
      await this.callbacks.refreshLibrary();
    }
    if (await this.openReference(referenceId)) return true;
    this.callbacks.presentNotice("That reference is no longer available in the Library.");
    return false;
  }

  async openAvailableReference(referenceId: string): Promise<void> {
    this.callbacks.activateLibrary?.();
    await this.callbacks.refreshLibrary();
    if (await this.focusAvailableReference(referenceId)) {
      this.pushBrowserRoute(`/library?reference=${encodeURIComponent(referenceId)}`, { view: "library-reference", referenceId });
    }
  }

  revealReference(referenceId: string, query: string): Promise<boolean> {
    return this.focusReference(referenceId, query, { block: "nearest" });
  }

  async revealExistingPdf(existing: ExistingPdfUpload): Promise<void> {
    if (existing.archived && this.showArchivedReferences()) await this.callbacks.refreshLibrary();
    if (!(await this.revealReference(existing.referenceId, existing.referenceKey))) {
      this.callbacks.presentNotice(`Library source ${existing.referenceKey} is not available.`);
    }
  }

  private async focusReference(
    referenceId: string,
    query: string,
    options: { block: ScrollLogicalPosition; expand?: boolean },
  ): Promise<boolean> {
    const filters = this.element("reference-library-filters", ReferenceLibraryFilterPanel);
    const list = this.element("library-reference-list", LibraryReferenceList);
    if (!filters || !list || !this.data) return false;
    filters.reset(query);
    this.present();
    return list.focusReference(referenceId, options);
  }

  protected present(): void {
    const data = this.data;
    const network = this.element("citation-network-workspace", CitationNetworkWorkspace);
    const filters = this.element("reference-library-filters", ReferenceLibraryFilterPanel);
    const list = this.element("library-reference-list", LibraryReferenceList);
    const unidentified = this.element("unidentified-pdf-list", UnidentifiedPdfList);
    if (!data || !network || !filters || !list || !unidentified) return;
    network.setReferences(data.library.references);
    list.setData({ ...data, references: filters.filterLibrary(data.library, data.projectReferences) });
    unidentified.setLibrary(data.library);
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.bindHistory();
  }

  override disconnectedCallback(): void {
    this.unbindHistory();
    super.disconnectedCallback();
  }

  protected override shouldUpdate(): boolean {
    return false;
  }

  protected element<T extends Element>(selector: string, constructor: abstract new () => T): T | null {
    const element = this.querySelector(selector);
    return element instanceof constructor ? element : null;
  }

  private routeCitationOutcome(outcome: CitationNetworkOutcome): void {
    if (outcome.action === "notice") this.callbacks.presentNotice(outcome.message);
    else void this.completeRefresh(outcome.message, "The citation candidate was saved, but the refreshed Library could not be loaded.");
  }

  private routeResearchAction(action: LibraryReferenceResearchAction): void {
    if (action.action === "capture") this.captureUrl(action.canonicalUrl);
    else this.callbacks.compareSnapshots(action.priorId, action.currentId);
  }

  private routeUploadOutcome(outcome: LibraryPdfUploadOutcome): void {
    if (outcome.action === "notice") this.callbacks.presentNotice(outcome.message);
    else
      void this.completeRefresh(outcome.message, "PDF intake completed, but the refreshed Library could not be loaded.", {
        complete: () => this.element("library-pdf-upload-control", LibraryPdfUploadControl)?.complete(outcome.requestId),
      });
  }

  private routeToolsAction(action: LibraryToolsAction): void {
    if (action === "open-citation-network") void this.openCitationNetwork();
    else void this.callbacks.refreshLibrary();
  }

  private bindHistory(): void {
    this.unbindHistory();
    if (this.browserHistory && typeof window !== "undefined") window.addEventListener("popstate", this.handlePopState);
  }

  private unbindHistory(): void {
    if (typeof window !== "undefined") window.removeEventListener("popstate", this.handlePopState);
  }

  private readonly handlePopState = (): void => void this.restoreBrowserRoute();

  private pushBrowserRoute(url: string, state: unknown): void {
    this.browserHistory?.pushState(state, "", url);
  }

  private replaceBrowserRoute(): void {
    this.browserHistory?.replaceState({ view: "library" }, "", "/library");
  }
}

if (typeof customElements !== "undefined" && !customElements.get("reference-library-workspace")) {
  customElements.define("reference-library-workspace", ReferenceLibraryWorkspace);
}

declare global {
  interface HTMLElementTagNameMap {
    "reference-library-workspace": ReferenceLibraryWorkspace;
  }
}
