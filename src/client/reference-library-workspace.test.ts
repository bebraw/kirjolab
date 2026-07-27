import { describe, expect, it, vi } from "vitest";
import type { LibraryPdfArtifact, ReferenceLibrarySnapshot } from "../domain/reference-library";
import { citationNetworkOutcomeEvent, CitationNetworkWorkspace } from "./citation-network-workspace";
import { libraryReferenceMetadataNoticeEvent, libraryReferenceMetadataRefreshEvent } from "./library-reference-metadata-editor";
import { libraryReferencePdfActionEvent, libraryReferencePdfRefreshEvent } from "./library-reference-pdf-rows";
import { libraryReferencePersonalRefreshEvent } from "./library-reference-personal-fields";
import { libraryReferenceResearchActionEvent } from "./library-reference-research-rows";
import { LibraryReferenceList } from "./library-reference-list";
import { libraryReferenceSummaryActionEvent } from "./library-reference-summary";
import { ReferenceLibraryFilterPanel, referenceLibraryFilterChangeEvent } from "./reference-library-filters";
import { ReferenceLibraryWorkspace } from "./reference-library-workspace";
import { unidentifiedPdfRefreshEvent, UnidentifiedPdfList } from "./unidentified-pdf-list";

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
    "library-reference-list": new LibraryReferenceList(),
    "reference-library-filters": new ReferenceLibraryFilterPanel(),
    "unidentified-pdf-list": new UnidentifiedPdfList(),
  };
  Object.defineProperty(workspace, "querySelector", {
    value: (selector: string) => owners[selector as keyof typeof owners] ?? null,
  });
  return { owners, workspace };
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
  it("composes canonical Library presentation and filter changes", () => {
    const { owners, workspace } = setup();
    const setReferences = vi.spyOn(owners["citation-network-workspace"], "setReferences");
    const filterLibrary = vi.spyOn(owners["reference-library-filters"], "filterLibrary").mockReturnValue(library.references);
    const setData = vi.spyOn(owners["library-reference-list"], "setData");
    const setLibrary = vi.spyOn(owners["unidentified-pdf-list"], "setLibrary");
    const data = { library, projectApiBase: "/api/workspaces/project-1", projectReferences: [], researchShares: [] };

    workspace.setData(data);

    expect(setReferences).toHaveBeenCalledWith(library.references);
    expect(filterLibrary).toHaveBeenCalledWith(library, []);
    expect(setData).toHaveBeenCalledWith({ ...data, references: library.references });
    expect(setLibrary).toHaveBeenCalledWith(library);
    workspace.dispatchEvent(new CustomEvent(referenceLibraryFilterChangeEvent));
    expect(setData).toHaveBeenCalledTimes(2);
    expect(workspace.rootForTest()).toBe(workspace);
    expect(workspace.updatesForTest()).toBe(false);
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

    workspace.configure("project-1");
    await workspace.openCitationNetwork();
    workspace.completePdfIdentification(3);

    expect(configure).toHaveBeenCalledWith("project-1");
    expect(open).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(3);
  });

  it("routes child Library outcomes through the coordinator boundary", () => {
    const { owners, workspace } = setup();
    const callbacks = {
      captureUrl: vi.fn(),
      compareSnapshots: vi.fn(),
      completeRefresh: vi.fn(),
      openPdf: vi.fn(),
      presentNotice: vi.fn(),
      refreshLibrary: vi.fn(),
      refreshMetadata: vi.fn().mockResolvedValue(undefined),
    };
    const completeIdentification = vi.spyOn(owners["unidentified-pdf-list"], "complete");
    workspace.configure("project-1", callbacks);

    workspace.dispatchEvent(new CustomEvent(citationNetworkOutcomeEvent, { detail: { action: "notice", message: "Network notice" } }));
    workspace.dispatchEvent(
      new CustomEvent(citationNetworkOutcomeEvent, { detail: { action: "library-refresh", message: "Candidate saved" } }),
    );
    workspace.dispatchEvent(new CustomEvent(libraryReferenceSummaryActionEvent, { detail: { action: "open-pdf", artifact } }));
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
    expect(callbacks.presentNotice).toHaveBeenCalledWith("Metadata notice");
    expect(callbacks.openPdf).toHaveBeenCalledTimes(2);
    expect(callbacks.completeRefresh).toHaveBeenCalledTimes(4);
    expect(callbacks.refreshLibrary).toHaveBeenCalledOnce();
    expect(callbacks.captureUrl).toHaveBeenCalledWith("https://example.test");
    expect(callbacks.compareSnapshots).toHaveBeenCalledWith("prior", "current");
    const metadataOptions = callbacks.completeRefresh.mock.calls[2]?.[2];
    expect(metadataOptions?.refresh).toBe(callbacks.refreshMetadata);
    const identificationOptions = callbacks.completeRefresh.mock.calls[3]?.[2];
    identificationOptions?.complete?.();
    expect(completeIdentification).toHaveBeenCalledWith(7);
  });
});
