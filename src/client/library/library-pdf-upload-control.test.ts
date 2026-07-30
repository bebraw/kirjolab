import { afterEach, describe, expect, it, vi } from "vitest";
import type { PdfDraftResult } from "../../domain/reference-library";
import { LibraryPdfUploadControl, libraryPdfUploadOutcomeEvent, type LibraryPdfUploadOutcome } from "./library-pdf-upload-control";
import { LibraryPdfUploadStatus, libraryPdfUploadRetryEvent } from "./library-pdf-upload-status";

class TestLibraryPdfUploadControl extends LibraryPdfUploadControl {
  renderForTest() {
    return this.render();
  }
}

describe("library PDF upload control", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("owns busy presentation", () => {
    const control = new TestLibraryPdfUploadControl();
    expect(control.busy).toBe(false);
    control.setBusy(true);
    expect(control.busy).toBe(true);
    expect(control.renderForTest()).toBeDefined();
    control.setBusy(false);
    expect(control.busy).toBe(false);
  });

  it("owns upload requests, validation, progress, and refresh acknowledgment", async () => {
    const control = new TestLibraryPdfUploadControl();
    const status = new LibraryPdfUploadStatus();
    control.bindStatus(status);
    const fetchMock = vi.fn().mockResolvedValue(Response.json(draft(true)));
    vi.stubGlobal("fetch", fetchMock);
    const outcomes: LibraryPdfUploadOutcome[] = [];
    control.addEventListener(libraryPdfUploadOutcomeEvent, (event) => {
      outcomes.push((event as CustomEvent<LibraryPdfUploadOutcome>).detail);
    });
    const file = pdf("paper.pdf");

    await control.uploadFiles([]);
    await control.uploadFiles([file]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/library/pdfs", {
      body: file,
      credentials: "same-origin",
      headers: {
        "content-length": String(file.size),
        "content-type": "application/pdf",
        "x-file-name": "paper.pdf",
      },
      method: "POST",
    });
    expect(outcomes).toEqual([{ action: "refresh", message: "1 PDF added. Add metadata when ready.", requestId: 1 }]);
    expect(control.busy).toBe(true);
    control.complete(0);
    expect(control.busy).toBe(true);
    control.complete(1);
    expect(control.busy).toBe(false);
  });

  it("keeps malformed failures local, reports all-failed batches, and retries status failures", async () => {
    const control = new TestLibraryPdfUploadControl();
    const status = new LibraryPdfUploadStatus();
    control.bindStatus(status);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ invalid: true }))
      .mockResolvedValueOnce(Response.json(draft(false)));
    vi.stubGlobal("fetch", fetchMock);
    const outcomes: LibraryPdfUploadOutcome[] = [];
    control.addEventListener(libraryPdfUploadOutcomeEvent, (event) => {
      outcomes.push((event as CustomEvent<LibraryPdfUploadOutcome>).detail);
    });

    await control.uploadFiles([pdf("repeat.pdf")]);
    expect(control.busy).toBe(false);
    status.dispatchEvent(new CustomEvent(libraryPdfUploadRetryEvent, { detail: [pdf("repeat.pdf")] }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(outcomes).toHaveLength(2));

    expect(outcomes[0]).toEqual({ action: "notice", message: "0 PDFs added; 0 already in library; 1 failed." });
    expect(outcomes[1]).toEqual({ action: "refresh", message: "0 PDFs added; 1 already in library.", requestId: 2 });
    control.complete(2);
  });

  it("ignores submissions while an upload or refresh is pending", async () => {
    const control = new TestLibraryPdfUploadControl();
    control.bindStatus(new LibraryPdfUploadStatus());
    let resolveResponse = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal("fetch", fetchMock);

    const first = control.uploadFiles([pdf("first.pdf")]);
    await control.uploadFiles([pdf("duplicate.pdf")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(Response.json(draft(true)));
    await first;
    await control.uploadFiles([pdf("still-pending.pdf")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function pdf(name: string): File {
  return new File(["%PDF-1.7"], name, { type: "application/pdf" });
}

function draft(created: boolean): PdfDraftResult {
  return {
    created,
    reference: {
      abstract: "",
      archivedAt: created ? null : "2026-07-25T00:00:00.000Z",
      authors: [],
      createdAt: "2026-07-25T00:00:00.000Z",
      deletedAt: null,
      doi: "",
      id: "reference-1",
      provenance: {},
      referenceKey: "source2026",
      title: "Paper",
      type: "misc",
      updatedAt: "2026-07-25T00:00:00.000Z",
      url: "",
      venue: "",
      year: "",
    },
    artifact: {
      contentType: "application/pdf",
      createdAt: "2026-07-25T00:00:00.000Z",
      fingerprint: "fingerprint",
      id: "pdf-1",
      name: "paper.pdf",
      objectKey: "pdfs/paper",
      referenceId: "reference-1",
      rights: "private",
      size: 8,
    },
  };
}
