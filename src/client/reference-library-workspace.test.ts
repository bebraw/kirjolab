import { describe, expect, it, vi } from "vitest";
import type { ReferenceLibrarySnapshot } from "../domain/reference-library";
import { CitationNetworkWorkspace } from "./citation-network-workspace";
import { LibraryReferenceList } from "./library-reference-list";
import { ReferenceLibraryFilterPanel, referenceLibraryFilterChangeEvent } from "./reference-library-filters";
import { ReferenceLibraryWorkspace } from "./reference-library-workspace";
import { UnidentifiedPdfList } from "./unidentified-pdf-list";

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
});
