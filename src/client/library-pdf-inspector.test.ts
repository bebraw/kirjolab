import { describe, expect, it } from "vitest";
import { LibraryPdfInspector, libraryPdfInspectorCloseEvent } from "./library-pdf-inspector";

class TestLibraryPdfInspector extends LibraryPdfInspector {
  renderForTest() {
    return this.render();
  }

  closeForTest(): void {
    this.close();
  }
}

describe("library PDF inspector", () => {
  it("owns artifact, visibility, status, and inspector presentation", () => {
    const inspector = new TestLibraryPdfInspector();
    inspector.setArtifact("pdf-1");
    inspector.setVisible(true);
    inspector.setStatus("Selection ready.");
    inspector.setInspectorOpen(true);

    expect(inspector.showsArtifact("pdf-1")).toBe(true);
    expect(inspector.showsArtifact("pdf-2")).toBe(false);
    expect(inspector.renderForTest()).toBeDefined();
  });

  it("emits a close intent", () => {
    const inspector = new TestLibraryPdfInspector();
    let closed = false;
    inspector.addEventListener(libraryPdfInspectorCloseEvent, () => {
      closed = true;
    });

    inspector.closeForTest();

    expect(closed).toBe(true);
  });
});
