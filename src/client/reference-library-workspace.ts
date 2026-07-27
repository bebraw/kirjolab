import { LitElement } from "lit";
import type { ReferenceLibrarySnapshot, ResearchShareSnapshot } from "../domain/reference-library";
import type { ProjectReferenceLink } from "../domain/workspace";
import { CitationNetworkWorkspace } from "./citation-network-workspace";
import { LibraryReferenceList } from "./library-reference-list";
import { ReferenceLibraryFilterPanel, referenceLibraryFilterChangeEvent } from "./reference-library-filters";
import { UnidentifiedPdfList } from "./unidentified-pdf-list";

export interface ReferenceLibraryWorkspaceData {
  readonly library: ReferenceLibrarySnapshot;
  readonly projectApiBase: string | null;
  readonly projectReferences: readonly ProjectReferenceLink[];
  readonly researchShares: readonly ResearchShareSnapshot[];
}

export class ReferenceLibraryWorkspace extends LitElement {
  private data: ReferenceLibraryWorkspaceData | null = null;

  constructor() {
    super();
    this.addEventListener(referenceLibraryFilterChangeEvent, () => this.present());
  }

  setData(data: ReferenceLibraryWorkspaceData): void {
    this.data = data;
    this.present();
  }

  configure(workspaceId: string): void {
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
}

if (typeof customElements !== "undefined" && !customElements.get("reference-library-workspace")) {
  customElements.define("reference-library-workspace", ReferenceLibraryWorkspace);
}

declare global {
  interface HTMLElementTagNameMap {
    "reference-library-workspace": ReferenceLibraryWorkspace;
  }
}
