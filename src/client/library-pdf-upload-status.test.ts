import { describe, expect, it } from "vitest";
import type { ExistingPdfUpload, PdfUploadQueueSnapshot } from "./pdf-upload-queue";
import { LibraryPdfUploadStatus, libraryPdfUploadRetryEvent, libraryPdfUploadRevealEvent } from "./library-pdf-upload-status";

class TestLibraryPdfUploadStatus extends LibraryPdfUploadStatus {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  retryForTest(): void {
    this.retry();
  }

  revealForTest(existing: ExistingPdfUpload): void {
    this.reveal(existing);
  }
}

const existing = {
  archived: true,
  referenceId: "reference-1",
  referenceKey: "source2026",
} satisfies ExistingPdfUpload;

describe("library PDF upload status", () => {
  it("renders progress, failures, duplicates, retry, and error states", () => {
    const panel = new TestLibraryPdfUploadStatus();
    expect(panel.rootForTest()).toBe(panel);
    expect(panel.renderForTest()).toBeDefined();
    panel.showProgress(
      {
        completed: 6,
        items: [
          item("queued.pdf", "queued"),
          item("uploading.pdf", "uploading"),
          item("added.pdf", "added"),
          item("failed.pdf", "failed", "Too large"),
          item("existing-unknown.pdf", "existing"),
          item("existing.pdf", "existing", undefined, existing),
        ],
        total: 6,
      },
      true,
    );
    panel.setBusy(true);
    expect(panel.renderForTest()).toBeDefined();
    panel.setBusy(false);
    panel.showError("PDF intake failed");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("emits retry and duplicate reveal intents", () => {
    const panel = new TestLibraryPdfUploadStatus();
    let retries = 0;
    let revealed: ExistingPdfUpload | undefined;
    panel.addEventListener(libraryPdfUploadRetryEvent, () => {
      retries += 1;
    });
    panel.addEventListener(libraryPdfUploadRevealEvent, (event) => {
      revealed = (event as CustomEvent<ExistingPdfUpload>).detail;
    });
    panel.retryForTest();
    panel.revealForTest(existing);
    expect(retries).toBe(1);
    expect(revealed).toEqual(existing);
  });
});

function item(
  name: string,
  state: PdfUploadQueueSnapshot["items"][number]["state"],
  error?: string,
  duplicate?: ExistingPdfUpload,
): PdfUploadQueueSnapshot["items"][number] {
  return {
    ...(duplicate ? { existing: duplicate } : {}),
    ...(error ? { error } : {}),
    file: new File(["pdf"], name, { type: "application/pdf" }),
    state,
  };
}
