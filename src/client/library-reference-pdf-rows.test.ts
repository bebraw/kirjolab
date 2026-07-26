import { afterEach, describe, expect, it, vi } from "vitest";
import type { BibliographicRecord, LibraryPdfArtifact } from "../domain/reference-library";
import {
  LibraryReferencePdfRows,
  libraryReferencePdfActionEvent,
  libraryReferencePdfRefreshEvent,
  type LibraryReferencePdfAction,
} from "./library-reference-pdf-rows";

class TestLibraryReferencePdfRows extends LibraryReferencePdfRows {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: LibraryReferencePdfAction): void {
    this.emitAction(action);
  }

  refineForTest(artifact: LibraryPdfArtifact): void {
    this.refine(artifact);
  }

  setRightsForTest(artifactId: string, value: string): Promise<void> {
    const event = new Event("change");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    return this.setRights(artifactId, event);
  }
}

const reference = {
  id: "ref-1",
  referenceKey: "doe2026",
  type: "article",
  title: "Paper",
  authors: ["Jane Doe"],
  year: "2026",
  venue: "Journal",
  doi: "",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
} satisfies BibliographicRecord;

const artifact = (id: string, rights: LibraryPdfArtifact["rights"]): LibraryPdfArtifact => ({
  id,
  referenceId: reference.id,
  name: `${id}.pdf`,
  contentType: "application/pdf",
  size: 2048,
  objectKey: `pdfs/${id}`,
  fingerprint: id,
  rights,
  createdAt: "2026-07-25T00:00:00.000Z",
});

describe("library reference PDF rows", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns empty, linked, and multi-artifact light-DOM presentation", () => {
    const rows = new TestLibraryReferencePdfRows();
    expect(rows.rootForTest()).toBe(rows);
    expect(rows.renderForTest()).toBeDefined();
    rows.setData(reference, [artifact("pdf-1", "private"), artifact("pdf-2", "unknown")], true);
    expect(rows.renderForTest()).toBeDefined();
  });

  it("owns rights persistence and emits open, refresh, and secondary refinement outcomes", async () => {
    const rows = new TestLibraryReferencePdfRows();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const actions: LibraryReferencePdfAction[] = [];
    let refreshes = 0;
    rows.addEventListener(libraryReferencePdfActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryReferencePdfAction>).detail);
    });
    rows.addEventListener(libraryReferencePdfRefreshEvent, () => {
      refreshes += 1;
    });
    const primary = artifact("pdf-1", "private");
    const secondary = artifact("pdf-2", "unknown");
    rows.setData(reference, [primary, secondary], false);
    rows.emitForTest({ action: "open", artifact: primary });
    await rows.setRightsForTest(primary.id, "shareable");
    await rows.setRightsForTest(primary.id, "invalid");
    rows.refineForTest(secondary);
    expect(actions).toEqual([
      { action: "open", artifact: primary },
      { action: "refine", artifact: secondary, reference },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/library/pdfs/pdf-1/rights", {
      body: JSON.stringify({ rights: "shareable" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(refreshes).toBe(1);
  });

  it("keeps rights failures local and ignores duplicate submissions", async () => {
    const rows = new TestLibraryReferencePdfRows();
    rows.setData(reference, [artifact("pdf-1", "private")], false);
    let resolveResponse = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal("fetch", fetchMock);

    const first = rows.setRightsForTest("pdf-1", "shareable");
    await rows.setRightsForTest("pdf-1", "unknown");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(new Response(JSON.stringify({ error: "Rights unavailable" }), { status: 503 }));
    await first;
    expect(rows.renderForTest()).toBeDefined();
  });
});
