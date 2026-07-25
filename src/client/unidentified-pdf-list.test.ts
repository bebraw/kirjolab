import { describe, expect, it } from "vitest";
import type { LibraryPdfArtifact } from "../domain/reference-library";
import { UnidentifiedPdfList, unidentifiedPdfIdentifyEvent, type UnidentifiedPdfSelection } from "./unidentified-pdf-list";

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

  identifyForTest(artifactId: string): void {
    this.identify(artifactId);
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
  id: "ref-1",
  title: "A {Useful} Paper",
};

describe("unidentified PDF list", () => {
  it("owns empty and populated light-DOM presentation", () => {
    const list = new TestUnidentifiedPdfList();
    expect(list.rootForTest()).toBe(list);
    expect(list.renderForTest()).toBeDefined();
    list.setData([artifact], []);
    expect(list.renderForTest()).toBeDefined();
    list.setData([artifact], [reference]);
    expect(list.renderForTest()).toBeDefined();
  });

  it("emits the selected reference for an artifact", () => {
    const list = new TestUnidentifiedPdfList();
    const selections: UnidentifiedPdfSelection[] = [];
    list.addEventListener(unidentifiedPdfIdentifyEvent, (event) => {
      selections.push((event as CustomEvent<UnidentifiedPdfSelection>).detail);
    });
    list.setData([artifact], [reference]);
    list.chooseForTest(artifact.id, reference.id);
    list.identifyForTest(artifact.id);
    expect(selections).toEqual([{ artifactId: "pdf-1", referenceId: "ref-1" }]);
  });

  it("drops selections for artifacts removed by refresh", () => {
    const list = new TestUnidentifiedPdfList();
    const selections: UnidentifiedPdfSelection[] = [];
    list.addEventListener(unidentifiedPdfIdentifyEvent, (event) => {
      selections.push((event as CustomEvent<UnidentifiedPdfSelection>).detail);
    });
    list.setData([artifact], [reference]);
    list.chooseForTest(artifact.id, reference.id);
    list.setData([], [reference]);
    list.identifyForTest(artifact.id);
    expect(selections).toEqual([{ artifactId: "pdf-1", referenceId: "" }]);
  });
});
