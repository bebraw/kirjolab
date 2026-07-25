import { describe, expect, it } from "vitest";
import type { PublicationIntakePreview, PublicationResource } from "../domain/workspace";
import { PublicationIntakePanel, publicationIntakeActionEvent, type PublicationIntakeAction } from "./publication-intake-panel";

const timestamp = "2026-07-25T00:00:00.000Z";
const preview: PublicationIntakePreview = {
  citationKey: "author2026",
  doi: "10.5555/intake",
  existingPublicationId: null,
  metadata: {
    abstract: "Abstract",
    authors: ["Ada Author"],
    doi: "10.5555/intake",
    title: "Reviewed intake",
    type: "article",
    url: "https://doi.org/10.5555/intake",
    venue: "Journal",
    year: "2026",
  },
  metadataFingerprint: "a".repeat(64),
  pdfId: "pdf:1",
};
const publication: PublicationResource = {
  abstract: "",
  authors: ["Ada Author"],
  citationKey: "author2026",
  createdAt: timestamp,
  doi: "10.5555/intake",
  id: "publication:1",
  metadataSource: "crossref",
  title: "{Reviewed} intake",
  type: "article",
  updatedAt: timestamp,
  url: "https://doi.org/10.5555/intake",
  venue: "Journal",
  year: "2026",
};

class TestPublicationIntakePanel extends PublicationIntakePanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  previewForTest(): void {
    this.preview(new Event("submit") as SubmitEvent);
  }

  acceptForTest(): void {
    this.accept();
  }

  cancelForTest(): void {
    this.cancel();
  }

  openForTest(publicationId?: string): void {
    this.openReference(eventWithTarget({ dataset: { publicationId } }));
  }

  doiForTest(value: string): void {
    this.updateDoi(eventWithTarget({ value }));
  }

  keyForTest(value: string): void {
    this.updateCitationKey(eventWithTarget({ value }));
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("publication intake panel", () => {
  it("renders lookup, review, busy, existing, and linked states", () => {
    const panel = new TestPublicationIntakePanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setStatus("Looking up DOI metadata…");
    panel.setView({ busy: true, preview, publications: [] });
    expect(panel.renderForTest()).toBeDefined();
    panel.setView({
      busy: false,
      preview: { ...preview, existingPublicationId: publication.id },
      publications: [],
    });
    expect(panel.renderForTest()).toBeDefined();
    panel.setView({ busy: false, preview: null, publications: [publication] });
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits only available actions with current local values", () => {
    const panel = new TestPublicationIntakePanel();
    const actions: PublicationIntakeAction[] = [];
    panel.addEventListener(publicationIntakeActionEvent, (event) => actions.push((event as CustomEvent<PublicationIntakeAction>).detail));

    panel.previewForTest();
    panel.doiForTest("10.5555/intake");
    panel.previewForTest();
    panel.setView({ busy: false, preview, publications: [] });
    panel.keyForTest("custom2026");
    panel.acceptForTest();
    panel.cancelForTest();
    panel.openForTest(publication.id);
    panel.openForTest();
    panel.setView({ busy: true, preview, publications: [] });
    panel.acceptForTest();
    panel.cancelForTest();

    expect(actions).toEqual([
      { action: "preview", doi: "10.5555/intake" },
      { action: "accept", citationKey: "custom2026" },
      { action: "cancel" },
      { action: "open-reference", publicationId: publication.id },
    ]);
  });
});
