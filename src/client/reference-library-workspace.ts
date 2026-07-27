import { LitElement } from "lit";
import type { LibraryPdfArtifact, ReferenceLibrarySnapshot, ResearchShareSnapshot } from "../domain/reference-library";
import type { ReferenceDiscoveryResult } from "../domain/reference-discovery";
import type { ProjectReferenceLink } from "../domain/workspace";
import { citationNetworkOutcomeEvent, CitationNetworkWorkspace, type CitationNetworkOutcome } from "./citation-network-workspace";
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
import {
  libraryToolsActionEvent,
  libraryToolsArchiveRefreshEvent,
  LibraryToolsMenu,
  type LibraryToolsAction,
  type LibraryToolsArchiveRefresh,
} from "./library-tools-menu";
import type { ExistingPdfUpload } from "./pdf-upload-queue";
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
  readonly compareSnapshots: (priorId: string, currentId: string) => void;
  readonly completeRefresh: (message: string, fallback: string, options?: LibraryRefreshOptions) => void;
  readonly openPdf: (artifact: LibraryPdfArtifact) => void;
  readonly presentNotice: (message: string) => void;
  readonly revealExistingPdf: (upload: ExistingPdfUpload) => void;
  readonly refreshLibrary: () => void;
  readonly refreshMetadata: () => Promise<void>;
}

const emptyCallbacks: ReferenceLibraryWorkspaceCallbacks = {
  compareSnapshots: () => undefined,
  completeRefresh: () => undefined,
  openPdf: () => undefined,
  presentNotice: () => undefined,
  revealExistingPdf: () => undefined,
  refreshLibrary: () => undefined,
  refreshMetadata: () => Promise.resolve(),
};

export class ReferenceLibraryWorkspace extends LitElement {
  private data: ReferenceLibraryWorkspaceData | null = null;
  private callbacks = emptyCallbacks;

  constructor() {
    super();
    this.addEventListener(referenceLibraryFilterChangeEvent, () => this.present());
    this.addEventListener(citationNetworkOutcomeEvent, (event) =>
      this.routeCitationOutcome((event as CustomEvent<CitationNetworkOutcome>).detail),
    );
    this.addEventListener(libraryReferenceSummaryActionEvent, (event) => {
      const { artifact } = (event as CustomEvent<LibraryReferenceSummaryAction>).detail;
      this.callbacks.openPdf(artifact);
    });
    this.addEventListener(libraryReferencePersonalRefreshEvent, (event) => {
      this.callbacks.completeRefresh(
        (event as CustomEvent<string>).detail,
        "The private reference was updated, but the refreshed Library could not be loaded.",
      );
    });
    this.addEventListener(libraryReferenceMetadataNoticeEvent, (event) => {
      this.callbacks.presentNotice((event as CustomEvent<string>).detail);
    });
    this.addEventListener(libraryReferenceMetadataRefreshEvent, (event) => {
      this.callbacks.completeRefresh(
        (event as CustomEvent<string>).detail,
        "Metadata was applied, but the refreshed Library could not be loaded.",
        { refresh: this.callbacks.refreshMetadata },
      );
    });
    this.addEventListener(libraryReferencePdfActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferencePdfAction>).detail;
      if (detail.action === "open") this.callbacks.openPdf(detail.artifact);
    });
    this.addEventListener(libraryReferencePdfRefreshEvent, () => this.callbacks.refreshLibrary());
    this.addEventListener(libraryReferenceResearchActionEvent, (event) => {
      this.routeResearchAction((event as CustomEvent<LibraryReferenceResearchAction>).detail);
    });
    this.addEventListener(unidentifiedPdfRefreshEvent, (event) => {
      const detail = (event as CustomEvent<UnidentifiedPdfRefresh>).detail;
      this.callbacks.completeRefresh(detail.message, "The PDF was identified, but the refreshed Library could not be loaded.", {
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
      this.callbacks.completeRefresh(detail.message, "The reference was saved, but the refreshed Library could not be loaded.", {
        complete: () => this.element("library-discovery-results", LibraryDiscoveryResults)?.complete(detail.index, detail.requestId),
      });
    });
    this.addEventListener(libraryReferenceImportRefreshEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferenceImportRefresh>).detail;
      this.callbacks.completeRefresh(detail.message, "References were imported, but the refreshed Library could not be loaded.", {
        complete: () => this.element("library-reference-import-control", LibraryReferenceImportControl)?.complete(detail.requestId),
      });
    });
    this.addEventListener(libraryPdfUploadOutcomeEvent, (event) => {
      this.routeUploadOutcome((event as CustomEvent<LibraryPdfUploadOutcome>).detail);
    });
    this.addEventListener(libraryPdfUploadRevealEvent, (event) => {
      this.callbacks.revealExistingPdf((event as CustomEvent<ExistingPdfUpload>).detail);
    });
    this.addEventListener(webSourceCapturedEvent, (event) => {
      this.callbacks.completeRefresh(
        (event as CustomEvent<string>).detail,
        "The web source was captured, but the refreshed Library could not be loaded.",
      );
    });
    this.addEventListener(libraryToolsActionEvent, (event) => {
      this.routeToolsAction((event as CustomEvent<LibraryToolsAction>).detail);
    });
    this.addEventListener(libraryToolsArchiveRefreshEvent, (event) => {
      const detail = (event as CustomEvent<LibraryToolsArchiveRefresh>).detail;
      this.callbacks.completeRefresh(detail.message, "The archive was restored, but the refreshed Library could not be loaded.", {
        complete: () => this.element("library-tools-menu", LibraryToolsMenu)?.completeArchiveRestore(detail.requestId),
      });
    });
  }

  setData(data: ReferenceLibraryWorkspaceData): void {
    this.data = data;
    this.present();
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

  async settled(): Promise<void> {
    await this.element("library-reference-list", LibraryReferenceList)?.settled();
  }

  openReference(referenceId: string): Promise<boolean> {
    return this.focusReference(referenceId, "", { block: "center", expand: true });
  }

  revealReference(referenceId: string, query: string): Promise<boolean> {
    return this.focusReference(referenceId, query, { block: "nearest" });
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

  protected override shouldUpdate(): boolean {
    return false;
  }

  protected element<T extends Element>(selector: string, constructor: abstract new () => T): T | null {
    const element = this.querySelector(selector);
    return element instanceof constructor ? element : null;
  }

  private routeCitationOutcome(outcome: CitationNetworkOutcome): void {
    if (outcome.action === "notice") this.callbacks.presentNotice(outcome.message);
    else
      this.callbacks.completeRefresh(outcome.message, "The citation candidate was saved, but the refreshed Library could not be loaded.");
  }

  private routeResearchAction(action: LibraryReferenceResearchAction): void {
    if (action.action === "capture") this.captureUrl(action.canonicalUrl);
    else this.callbacks.compareSnapshots(action.priorId, action.currentId);
  }

  private routeUploadOutcome(outcome: LibraryPdfUploadOutcome): void {
    if (outcome.action === "notice") this.callbacks.presentNotice(outcome.message);
    else
      this.callbacks.completeRefresh(outcome.message, "PDF intake completed, but the refreshed Library could not be loaded.", {
        complete: () => this.element("library-pdf-upload-control", LibraryPdfUploadControl)?.complete(outcome.requestId),
      });
  }

  private routeToolsAction(action: LibraryToolsAction): void {
    if (action === "open-citation-network") void this.openCitationNetwork();
    else this.callbacks.refreshLibrary();
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
