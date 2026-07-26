import { describe, expect, it } from "vitest";
import { LibraryPdfUploadControl, libraryPdfUploadActionEvent, type LibraryPdfUploadAction } from "./library-pdf-upload-control";

class TestLibraryPdfUploadControl extends LibraryPdfUploadControl {
  renderForTest() {
    return this.render();
  }

  emitFilesForTest(files: readonly File[]): void {
    this.emitFiles(files);
  }
}

describe("library PDF upload control", () => {
  it("owns busy presentation", () => {
    const control = new TestLibraryPdfUploadControl();
    expect(control.busy).toBe(false);
    control.setBusy(true);
    expect(control.busy).toBe(true);
    expect(control.renderForTest()).toBeDefined();
    control.setBusy(false);
    expect(control.busy).toBe(false);
  });

  it("emits non-empty file selections", () => {
    const control = new TestLibraryPdfUploadControl();
    const actions: LibraryPdfUploadAction[] = [];
    control.addEventListener(libraryPdfUploadActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfUploadAction>).detail);
    });
    const file = new File(["pdf"], "paper.pdf", { type: "application/pdf" });

    control.emitFilesForTest([]);
    control.emitFilesForTest([file]);

    expect(actions).toEqual([{ action: "files", files: [file] }]);
  });
});
