import { LitElement } from "lit";
import type { LibraryPdfArtifact, ReferenceLibrarySnapshot, ResearchShareSnapshot } from "../domain/reference-library";
import type { ProjectReferenceLink } from "../domain/workspace";
import { citationNetworkOutcomeEvent, CitationNetworkWorkspace, type CitationNetworkOutcome } from "./citation-network-workspace";
import { libraryReferenceMetadataNoticeEvent, libraryReferenceMetadataRefreshEvent } from "./library-reference-metadata-editor";
import {
  libraryReferencePdfActionEvent,
  libraryReferencePdfRefreshEvent,
  type LibraryReferencePdfAction,
} from "./library-reference-pdf-rows";
import { libraryReferencePersonalRefreshEvent } from "./library-reference-personal-fields";
import { libraryReferenceResearchActionEvent, type LibraryReferenceResearchAction } from "./library-reference-research-rows";
import { LibraryReferenceList } from "./library-reference-list";
import { libraryReferenceSummaryActionEvent, type LibraryReferenceSummaryAction } from "./library-reference-summary";
import { ReferenceLibraryFilterPanel, referenceLibraryFilterChangeEvent } from "./reference-library-filters";
import { unidentifiedPdfRefreshEvent, UnidentifiedPdfList, type UnidentifiedPdfRefresh } from "./unidentified-pdf-list";

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
  readonly captureUrl: (url: string) => void;
  readonly compareSnapshots: (priorId: string, currentId: string) => void;
  readonly completeRefresh: (message: string, fallback: string, options?: LibraryRefreshOptions) => void;
  readonly openPdf: (artifact: LibraryPdfArtifact) => void;
  readonly presentNotice: (message: string) => void;
  readonly refreshLibrary: () => void;
  readonly refreshMetadata: () => Promise<void>;
}

const emptyCallbacks: ReferenceLibraryWorkspaceCallbacks = {
  captureUrl: () => undefined,
  compareSnapshots: () => undefined,
  completeRefresh: () => undefined,
  openPdf: () => undefined,
  presentNotice: () => undefined,
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
  }

  setData(data: ReferenceLibraryWorkspaceData): void {
    this.data = data;
    this.present();
  }

  configure(workspaceId: string, callbacks?: ReferenceLibraryWorkspaceCallbacks): void {
    if (callbacks) this.callbacks = callbacks;
    this.element("citation-network-workspace", CitationNetworkWorkspace)?.configure(workspaceId);
  }

  openCitationNetwork(): Promise<void> {
    return this.element("citation-network-workspace", CitationNetworkWorkspace)?.open() ?? Promise.resolve();
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
    if (action.action === "capture") this.callbacks.captureUrl(action.canonicalUrl);
    else this.callbacks.compareSnapshots(action.priorId, action.currentId);
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
