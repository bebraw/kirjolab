import { describe, expect, it } from "vitest";
import type { LibraryPdfArtifact, ProjectReferencePdf } from "../domain/reference-library";
import type { PublicationResource } from "../domain/workspace";
import {
  PublicationContextPanel,
  publicationContextActionEvent,
  type PublicationContextAction,
  type PublicationPaperOption,
} from "./publication-context-panel";

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

class TestPublicationContextPanel extends PublicationContextPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
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

  unlinkForTest(linkId?: string): void {
    this.unlinkPaper(eventWithDataset(linkId ? { linkId } : {}));
  }

  linkForTest(): void {
    this.linkPdf(new Event("submit"));
  }
}

function eventWithDataset(dataset: Record<string, string>): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: { dataset } });
  return event;
}

describe("publication context panel", () => {
  it("renders fallback, publication, paper, and citation states", () => {
    const panel = new TestPublicationContextPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setContext({ availablePdfs: [], papers: [], publication });
    expect(panel.renderForTest()).toBeDefined();
    panel.setContext({ availablePdfs: [projectPaper.pdf], papers: [projectPaper], publication });
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
    const panel = new TestPublicationContextPanel();
    panel.setContext({
      availablePdfs: [],
      papers: [
        { artifact, kind: "library" },
        { kind: "reference", pdf: reference },
      ],
      publication,
    });
    expect(panel.renderForTest()).toBeDefined();
    panel.openOnlyForTest();
  });

  it("emits citation, paper, and unlink intents", () => {
    const panel = new TestPublicationContextPanel();
    const actions: PublicationContextAction[] = [];
    panel.addEventListener(publicationContextActionEvent, (event) => actions.push((event as CustomEvent<PublicationContextAction>).detail));
    panel.setContext({ availablePdfs: [], papers: [projectPaper], publication });

    panel.insertForTest();
    panel.openOnlyForTest();
    panel.openForTest();
    panel.openForTest("2");
    panel.openForTest("0");
    panel.unlinkForTest();
    panel.unlinkForTest("link:1");

    expect(actions).toEqual([
      { action: "insert-citation" },
      { action: "open-paper", paper: projectPaper },
      { action: "open-paper", paper: projectPaper },
      { action: "unlink-pdf", linkId: "link:1" },
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

  it("emits a selected project-PDF link intent", () => {
    const panel = new TestPublicationContextPanel();
    const actions: PublicationContextAction[] = [];
    panel.addEventListener(publicationContextActionEvent, (event) => actions.push((event as CustomEvent<PublicationContextAction>).detail));
    Object.defineProperty(panel, "querySelector", { value: () => ({ value: "pdf:1" }) });
    panel.linkForTest();
    expect(actions).toEqual([{ action: "link-pdf", pdfId: "pdf:1" }]);
  });
});
