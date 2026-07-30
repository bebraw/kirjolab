import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryPdfArtifact, ProjectReferencePdf } from "../../domain/reference-library";
import type { PdfResource, PublicationPdfLink, PublicationResource } from "../../domain/workspace/workspace";
import { PublicationContextPanel, type PublicationPaperOption } from "./publication-context-panel";

const publication: PublicationResource = {
  abstract: "",
  authors: ["Ada Author"],
  citationKey: "Author2026",
  createdAt: "2026-07-25T00:00:00.000Z",
  doi: "",
  id: "publication:1",
  metadataSource: "crossref",
  title: "A study",
  type: "article",
  updatedAt: "2026-07-25T00:00:00.000Z",
  url: "",
  venue: "Journal",
  year: "2026",
};

const projectPaper: Extract<PublicationPaperOption, { kind: "project" }> = {
  kind: "project",
  linkId: "link:1",
  pdf: {
    contentType: "application/pdf",
    createdAt: publication.createdAt,
    fingerprint: "fingerprint",
    id: "pdf:1",
    name: "paper.pdf",
    objectKey: "pdfs/paper.pdf",
    size: 1024,
  },
};

function setPublication(
  panel: PublicationContextPanel,
  options: {
    libraryArtifacts?: readonly LibraryPdfArtifact[];
    pdfs?: readonly PdfResource[];
    publicationPdfLinks?: readonly PublicationPdfLink[];
    referencePdfs?: readonly ProjectReferencePdf[];
  } = {},
): void {
  panel.setPublication({
    libraryArtifacts: options.libraryArtifacts ?? [],
    publicationId: publication.id,
    referencePdfs: options.referencePdfs ?? [],
    snapshot: {
      pdfs: options.pdfs ?? [],
      publicationPdfLinks: options.publicationPdfLinks ?? [],
      publications: [publication],
    },
  });
}

class TestPublicationContextPanel extends PublicationContextPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  papersForTest(): readonly PublicationPaperOption[] {
    return this.data?.papers ?? [];
  }

  insertForTest(): void {
    this.insertCitation();
  }

  openOnlyForTest(): void {
    this.openOnlyPaper();
  }

  openForTest(index?: string): void {
    this.openPaper(eventWithDataset(index ? { paperIndex: index } : {}));
  }

  linkForTest(): Promise<void> {
    return this.linkPdf(new Event("submit"));
  }

  disconnectForTest(linkId = projectPaper.linkId): Promise<void> {
    return this.unlinkPdf(linkId);
  }
}

function eventWithDataset(dataset: Record<string, string>): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: { dataset } });
  return event;
}

type RecordedAction =
  | { readonly action: "insert-citation" }
  | { readonly action: "open-paper"; readonly paper: PublicationPaperOption }
  | { readonly action: "papers-changed"; readonly message: string };

function recordActions(panel: PublicationContextPanel): RecordedAction[] {
  const actions: RecordedAction[] = [];
  panel.bind({
    insertCitation: () => actions.push({ action: "insert-citation" }),
    openPaper: (paper) => actions.push({ action: "open-paper", paper }),
    papersChanged: (message) => actions.push({ action: "papers-changed", message }),
  });
  return actions;
}

afterEach(() => vi.restoreAllMocks());

describe("publication context panel", () => {
  it("renders fallback, publication, paper, and citation states", () => {
    const panel = new TestPublicationContextPanel();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.setPublication({ libraryArtifacts: [], publicationId: publication.id, referencePdfs: [], snapshot: null })).toBe(false);
    setPublication(panel);
    expect(panel.renderForTest()).toBeDefined();
    setPublication(panel, {
      pdfs: [projectPaper.pdf],
      publicationPdfLinks: [
        { id: projectPaper.linkId, publicationId: publication.id, pdfId: projectPaper.pdf.id, createdAt: publication.createdAt },
      ],
    });
    panel.setCitationAvailable(true);
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("renders library and shared-reference paper variants", () => {
    const artifact: LibraryPdfArtifact = {
      contentType: "application/pdf",
      createdAt: publication.createdAt,
      fingerprint: "library-fingerprint",
      id: "library-pdf:1",
      name: "library.pdf",
      objectKey: "library/library.pdf",
      referenceId: publication.id,
      rights: "private",
      size: 2048,
    };
    const reference: ProjectReferencePdf = {
      fingerprint: "reference-fingerprint",
      id: "reference-pdf:1",
      name: "reference.pdf",
      referenceId: publication.id,
      size: 4096,
    };
    const duplicateReference = { ...reference, id: artifact.id };
    const panel = new TestPublicationContextPanel();
    setPublication(panel, { libraryArtifacts: [artifact], referencePdfs: [reference, duplicateReference] });
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.papersForTest().map((paper) => paper.kind)).toEqual(["library", "reference"]);
    panel.openOnlyForTest();
  });

  it("emits citation and paper navigation intents", () => {
    const panel = new TestPublicationContextPanel();
    const actions = recordActions(panel);
    setPublication(panel, {
      pdfs: [projectPaper.pdf],
      publicationPdfLinks: [
        { id: projectPaper.linkId, publicationId: publication.id, pdfId: projectPaper.pdf.id, createdAt: publication.createdAt },
      ],
    });

    panel.insertForTest();
    panel.openOnlyForTest();
    panel.openForTest();
    panel.openForTest("2");
    panel.openForTest("0");

    expect(actions).toEqual([
      { action: "insert-citation" },
      { action: "open-paper", paper: projectPaper },
      { action: "open-paper", paper: projectPaper },
    ]);
  });

  it("owns its nested scroll position", () => {
    const panel = new TestPublicationContextPanel();
    const body = { scrollTop: 10 };
    Object.defineProperty(panel, "querySelector", { value: () => body });
    expect(panel.scrollPosition).toBe(10);
    panel.scrollPosition = 20;
    expect(body.scrollTop).toBe(20);
  });

  it("owns link and unlink persistence with typed completed outcomes", async () => {
    const panel = new TestPublicationContextPanel();
    const actions = recordActions(panel);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    setPublication(panel, {
      pdfs: [projectPaper.pdf],
      publicationPdfLinks: [
        { id: projectPaper.linkId, publicationId: publication.id, pdfId: projectPaper.pdf.id, createdAt: publication.createdAt },
      ],
    });
    Object.defineProperty(panel, "querySelector", { value: () => ({ value: "pdf:1" }) });

    await panel.linkForTest();
    await panel.disconnectForTest("link/1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace/publication-pdf-links",
      expect.objectContaining({ body: JSON.stringify({ publicationId: publication.id, pdfId: "pdf:1" }), method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/workspace/publication-pdf-links/link%2F1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(actions).toEqual([
      { action: "papers-changed", message: "Project PDF added to this reference." },
      { action: "papers-changed", message: "Paper disconnected; both resources remain available." },
    ]);
  });

  it("reports provider failures and permits retry", async () => {
    const panel = new TestPublicationContextPanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");

    await panel.disconnectForTest();
    expect(panel.renderForTest()).toBeDefined();
    await panel.disconnectForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate relationship updates while a request is pending", async () => {
    const panel = new TestPublicationContextPanel();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    panel.configure("/api/workspaces/workspace");

    const first = panel.disconnectForTest();
    await panel.disconnectForTest();
    respond(new Response(null, { status: 200 }));
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
