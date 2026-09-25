import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectReferencePdf } from "../../domain/reference-library";
import type { PdfResource, ProjectReferenceLink, PublicationResource } from "../../domain/workspace/workspace";
import { PublicationListPanel } from "./publication-list-panel";

const publication: PublicationResource = {
  abstract: "",
  authors: ["Ada Author"],
  citationKey: "Author2026",
  createdAt: "2026-07-25T00:00:00.000Z",
  doi: "10.5555/study",
  id: "publication:1",
  metadataSource: "crossref",
  title: "A {Study}",
  type: "article",
  updatedAt: "2026-07-25T00:00:00.000Z",
  url: "",
  venue: "{Journal}",
  year: "2026",
};
const projectReference: ProjectReferenceLink = {
  citationAlias: "Author2026",
  createdAt: publication.createdAt,
  id: "project-reference:1",
  referenceId: publication.id,
  snapshot: {
    authors: publication.authors,
    capturedAt: publication.createdAt,
    doi: publication.doi,
    referenceId: publication.id,
    title: publication.title,
    tombstone: false,
    type: publication.type,
    url: publication.url,
    venue: publication.venue,
    webSnapshot: null,
    year: publication.year,
  },
  updatedAt: publication.updatedAt,
};
const referencePdf: ProjectReferencePdf = {
  id: "library-pdf:1",
  referenceId: publication.id,
  name: "Library paper.pdf",
  size: 1024,
  fingerprint: "fingerprint-1",
};
const projectPdf: PdfResource = {
  id: "project-pdf:1",
  name: "Project paper.pdf",
  contentType: "application/pdf",
  size: 2048,
  objectKey: "project/paper.pdf",
  fingerprint: "fingerprint-2",
  createdAt: publication.createdAt,
};

class TestPublicationListPanel extends PublicationListPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  actForTest(action?: string, publicationId = publication.id): void {
    const event = new Event("test");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { publicationAction: action, publicationId } } });
    this.actOnPublication(event);
  }

  enrichForTest(publicationId = publication.id): Promise<void> {
    return this.enrichPublication(publicationId);
  }
}

afterEach(() => vi.restoreAllMocks());

describe("publication list panel", () => {
  it("renders empty, enrichable, and connected publication states", () => {
    const panel = new TestPublicationListPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setWorkspace(
      {
        pdfs: [],
        projectReferences: [],
        publicationPdfLinks: [],
        publications: [publication, { ...publication, doi: "", id: "publication:2" }],
      },
      [],
    );
    expect(panel.renderForTest()).toBeDefined();
    panel.setWorkspace({ pdfs: [], projectReferences: [projectReference], publicationPdfLinks: [], publications: [publication] }, []);
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("routes bounded publication intents", () => {
    const panel = new TestPublicationListPanel();
    const manage = vi.fn();
    const open = vi.fn();
    panel.bind({ enriched: vi.fn(), manage, open, openPaper: vi.fn() });
    panel.setWorkspace({ pdfs: [], projectReferences: [], publicationPdfLinks: [], publications: [publication] }, []);

    panel.actForTest();
    panel.actForTest("open", "missing");
    panel.actForTest("open");
    panel.actForTest("manage");

    expect(open).toHaveBeenCalledWith(publication);
    expect(manage).toHaveBeenCalledWith(publication.id);
  });

  it("opens the sole related PDF and uses publication context to choose among several", () => {
    const panel = new TestPublicationListPanel();
    const open = vi.fn();
    const openPaper = vi.fn();
    panel.bind({ enriched: vi.fn(), manage: vi.fn(), open, openPaper });
    panel.setWorkspace({ projectReferences: [projectReference], publications: [publication], pdfs: [], publicationPdfLinks: [] }, [
      referencePdf,
    ]);

    panel.actForTest("paper");
    expect(openPaper).toHaveBeenCalledWith({ kind: "reference", pdf: referencePdf });
    expect(open).not.toHaveBeenCalled();

    panel.setWorkspace(
      {
        projectReferences: [projectReference],
        publications: [publication],
        pdfs: [projectPdf],
        publicationPdfLinks: [{ id: "pdf-link:1", publicationId: publication.id, pdfId: projectPdf.id, createdAt: publication.createdAt }],
      },
      [referencePdf],
    );
    panel.actForTest("paper");
    expect(open).toHaveBeenCalledWith(publication);
    expect(openPaper).toHaveBeenCalledTimes(1);
  });

  it("ignores PDF opening when a reference has no connected PDF", () => {
    const panel = new TestPublicationListPanel();
    const open = vi.fn();
    const openPaper = vi.fn();
    panel.bind({ enriched: vi.fn(), manage: vi.fn(), open, openPaper });
    panel.setWorkspace({ projectReferences: [projectReference], publications: [publication], pdfs: [], publicationPdfLinks: [] }, []);

    panel.actForTest("paper");

    expect(openPaper).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("owns enrichment persistence and emits the completed outcome", async () => {
    const panel = new TestPublicationListPanel();
    const enriched = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.bind({ enriched, manage: vi.fn(), open: vi.fn(), openPaper: vi.fn() });

    await panel.enrichForTest("publication/1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/publications/publication%2F1/enrich",
      expect.objectContaining({ method: "POST" }),
    );
    expect(enriched).toHaveBeenCalledWith("Reference enriched from Crossref.");
  });

  it("reports provider failures and permits retry", async () => {
    const panel = new TestPublicationListPanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");

    await panel.enrichForTest();
    expect(panel.renderForTest()).toBeDefined();
    await panel.enrichForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate enrichment while a request is pending", async () => {
    const panel = new TestPublicationListPanel();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    panel.configure("/api/workspaces/workspace");

    const first = panel.enrichForTest();
    await panel.enrichForTest();
    respond(new Response(null, { status: 200 }));
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
