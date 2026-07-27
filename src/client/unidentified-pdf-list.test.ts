import { afterEach, describe, expect, it, vi } from "vitest";
import type { BibliographicRecord, LibraryPdfArtifact } from "../domain/reference-library";
import { UnidentifiedPdfList, unidentifiedPdfRefreshEvent, type UnidentifiedPdfRefresh } from "./unidentified-pdf-list";

class TestUnidentifiedPdfList extends UnidentifiedPdfList {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  chooseForTest(artifactId: string, referenceId: string): void {
    const event = new Event("change");
    Object.defineProperty(event, "currentTarget", { value: { value: referenceId } });
    this.chooseReference(artifactId, event);
  }

  identifyForTest(artifactId: string): Promise<void> {
    return this.identify(artifactId);
  }
}

const artifact = {
  id: "pdf-1",
  referenceId: null,
  name: "paper.pdf",
  contentType: "application/pdf" as const,
  size: 2048,
  objectKey: "pdfs/paper",
  fingerprint: "fingerprint",
  rights: "private" as const,
  createdAt: "2026-07-25T00:00:00.000Z",
} satisfies LibraryPdfArtifact;

const reference = {
  abstract: "",
  archivedAt: null,
  authors: [],
  createdAt: artifact.createdAt,
  deletedAt: null,
  doi: "",
  id: "ref-1",
  provenance: {},
  referenceKey: "useful2026",
  title: "A {Useful} Paper",
  type: "article",
  updatedAt: artifact.createdAt,
  url: "",
  venue: "",
  year: "2026",
} satisfies BibliographicRecord;

afterEach(() => vi.restoreAllMocks());

describe("unidentified PDF list", () => {
  it("owns empty and populated light-DOM presentation", () => {
    const list = new TestUnidentifiedPdfList();
    expect(list.rootForTest()).toBe(list);
    expect(list.renderForTest()).toBeDefined();
    list.setLibrary({ artifacts: [artifact], references: [] });
    expect(list.renderForTest()).toBeDefined();
    list.setLibrary({ artifacts: [artifact], references: [reference] });
    expect(list.renderForTest()).toBeDefined();
  });

  it("identifies the selected reference and requests a refresh", async () => {
    const list = new TestUnidentifiedPdfList();
    const requests: UnidentifiedPdfRefresh[] = [];
    list.addEventListener(unidentifiedPdfRefreshEvent, (event) => {
      requests.push((event as CustomEvent<UnidentifiedPdfRefresh>).detail);
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    list.setLibrary({ artifacts: [artifact], references: [reference] });
    list.chooseForTest(artifact.id, reference.id);
    await list.identifyForTest(artifact.id);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/pdfs/pdf-1/identify",
      expect.objectContaining({ body: JSON.stringify({ referenceId: "ref-1" }), method: "POST" }),
    );
    expect(requests).toEqual([{ message: "PDF identified and attached to the private source record.", requestId: 1 }]);
    list.complete(0);
    list.complete(1);
  });

  it("drops selections for artifacts removed by refresh", async () => {
    const list = new TestUnidentifiedPdfList();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    list.setLibrary({ artifacts: [artifact], references: [reference] });
    list.chooseForTest(artifact.id, reference.id);
    list.setLibrary({ artifacts: [], references: [reference] });
    await list.identifyForTest(artifact.id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports request failures and allows a retry", async () => {
    const list = new TestUnidentifiedPdfList();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    list.setLibrary({ artifacts: [artifact], references: [reference] });
    list.chooseForTest(artifact.id, reference.id);

    await list.identifyForTest(artifact.id);
    expect(list.renderForTest()).toBeDefined();
    await list.identifyForTest(artifact.id);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
