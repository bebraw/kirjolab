import { describe, expect, it } from "vitest";
import type { ProjectReferenceLink, PublicationResource } from "../domain/workspace";
import { PublicationListPanel, publicationListActionEvent, type PublicationListAction } from "./publication-list-panel";

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
}

describe("publication list panel", () => {
  it("renders empty, enrichable, and connected publication states", () => {
    const panel = new TestPublicationListPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setPublications({ projectReferences: [], publications: [publication, { ...publication, doi: "", id: "publication:2" }] });
    expect(panel.renderForTest()).toBeDefined();
    panel.setPublications({ projectReferences: [projectReference], publications: [publication] });
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits bounded publication intents", () => {
    const panel = new TestPublicationListPanel();
    const actions: PublicationListAction[] = [];
    panel.addEventListener(publicationListActionEvent, (event) => actions.push((event as CustomEvent<PublicationListAction>).detail));
    panel.setPublications({ projectReferences: [], publications: [publication] });

    panel.actForTest();
    panel.actForTest("open", "missing");
    panel.actForTest("open");
    panel.actForTest("manage");
    panel.actForTest("enrich");

    expect(actions).toEqual([
      { action: "open", publication },
      { action: "manage", publicationId: publication.id },
      { action: "enrich", publicationId: publication.id },
    ]);
  });
});
