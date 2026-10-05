import { afterEach, describe, expect, it, vi } from "vitest";
import { isTemplateResult } from "lit/directive-helpers.js";
import type { BibliographicRecord } from "../../domain/reference-library";
import { OpenAccessPdfDialog, openAccessPdfImportedEvent } from "./open-access-pdf-dialog";

const reference: BibliographicRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  referenceKey: "open2026",
  type: "article",
  title: "Open paper",
  authors: [],
  year: "2026",
  venue: "",
  doi: "10.1000/open",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: "created",
  updatedAt: "updated",
};

const candidate = {
  provider: "openalex" as const,
  providerRecordId: "https://openalex.org/W1",
  landingUrl: "https://repository.example/paper",
  pdfUrl: "https://repository.example/paper.pdf",
  license: "cc-by",
  version: "acceptedVersion",
  fingerprint: `sha256:${"a".repeat(64)}`,
};

const artifact = {
  id: "22222222-2222-4222-8222-222222222222",
  referenceId: reference.id,
  name: "open2026.pdf",
  contentType: "application/pdf",
  size: 100,
  objectKey: "libraries/owner/open.pdf",
  fingerprint: "sha256:content",
  rights: "unknown",
  createdAt: "created",
} as const;

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function templateText(value: unknown): string {
  if (!isTemplateResult(value, 1)) return typeof value === "string" ? value : "";
  return value.strings.reduce((output, part, index) => `${output}${part}${templateText(value.values[index])}`, "");
}

class TestOpenAccessPdfDialog extends OpenAccessPdfDialog {
  readonly nativeDialog = { close: vi.fn(), showModal: vi.fn() } as unknown as HTMLDialogElement;

  renderForTest() {
    return this.render();
  }

  importForTest(): Promise<void> {
    return this.importCandidate();
  }

  protected override dialog(): HTMLDialogElement {
    return this.nativeDialog;
  }
}

describe("open access PDF dialog", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reviews provider evidence before importing the selected fingerprint", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ candidate }))
      .mockResolvedValueOnce(Response.json({ reference, artifact, created: true }));
    vi.stubGlobal("fetch", fetcher);
    const element = new TestOpenAccessPdfDialog();

    await element.open(reference);
    expect(element.nativeDialog.showModal).toHaveBeenCalledOnce();
    const rendered = templateText(element.renderForTest());
    for (const text of [
      reference.title,
      "OpenAlex",
      "cc-by",
      "acceptedVersion",
      candidate.pdfUrl,
      candidate.landingUrl,
      "Import private PDF",
    ]) {
      expect(rendered).toContain(text);
    }
    expect(rendered).not.toContain("download the PDF, then attach it here");
    expect(rendered).not.toContain("Attach PDF");
    expect(fetcher).toHaveBeenNthCalledWith(1, `/api/library/references/${reference.id}/open-pdf/discover`, {
      method: "POST",
      credentials: "same-origin",
    });
    const imported = vi.fn();
    element.addEventListener(openAccessPdfImportedEvent, imported);
    await element.importForTest();

    expect(imported).toHaveBeenCalledOnce();
    expect(imported.mock.calls[0]?.[0]).toMatchObject({ bubbles: true, detail: "Open PDF imported; analysis is queued." });
    expect(element.nativeDialog.close).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenLastCalledWith(`/api/library/references/${reference.id}/open-pdf/import`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openalex", fingerprint: candidate.fingerprint }),
    });
  });

  it("keeps an empty provider result reviewable", async () => {
    const fetcher = vi.fn(async () => Response.json({ candidate: null }));
    vi.stubGlobal("fetch", fetcher);
    const element = new TestOpenAccessPdfDialog();
    await element.open(reference);
    const rendered = templateText(element.renderForTest());
    expect(rendered).toContain("No provider supplied a directly downloadable open PDF for this DOI.");
    expect(rendered).not.toContain("Import private PDF");
    expect(rendered).not.toContain("download the PDF, then attach it here");
    await element.importForTest();
    expect(element.nativeDialog.close).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("keeps reviewed download links and manual recovery visible after an import fails", async () => {
    const message = "PDF host repository.example requires browser verification (HTTP 403).";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ candidate }))
        .mockResolvedValueOnce(Response.json({ error: message }, { status: 502 })),
    );
    const element = new TestOpenAccessPdfDialog();
    await element.open(reference);

    await element.importForTest();

    const rendered = templateText(element.renderForTest());
    expect(rendered).toContain(message);
    expect(rendered).toContain(candidate.pdfUrl);
    expect(rendered).toContain(candidate.landingUrl);
    expect(rendered).toContain("download the PDF, then attach it here");
    expect(rendered).toContain("Attach PDF");
    expect(rendered).toContain('type="file"');
    expect(element.nativeDialog.close).not.toHaveBeenCalled();
  });

  it("uploads a manual PDF directly onto the reviewed reference after a download failure", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ candidate }))
      .mockResolvedValueOnce(Response.json({ error: "Download refused" }, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ reference, artifact: { ...artifact, rights: "private" }, created: true }));
    vi.stubGlobal("fetch", fetcher);
    const element = new TestOpenAccessPdfDialog();
    const imported = vi.fn();
    element.addEventListener(openAccessPdfImportedEvent, imported);
    await element.open(reference);
    await element.importForTest();
    const file = new File(["%PDF-test"], "downloaded paper.pdf", { type: "application/pdf" });

    await element.uploadPdf(file);

    expect(fetcher).toHaveBeenLastCalledWith(`/api/library/references/${reference.id}/pdfs`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/pdf", "x-file-name": "downloaded%20paper.pdf" },
      body: file,
    });
    expect(imported).toHaveBeenCalledOnce();
    expect(imported.mock.calls[0]?.[0]).toMatchObject({ bubbles: true, detail: "PDF attached; analysis is queued." });
    expect(element.nativeDialog.close).toHaveBeenCalledOnce();
  });

  it.each([
    ["server failure", () => Response.json({ error: "Upload unavailable" }, { status: 503 }), "Upload unavailable"],
    ["invalid response", () => Response.json({ invalid: true }), "PDF attachment returned an invalid response"],
    [
      "non-Error rejection",
      () => {
        throw "offline";
      },
      "PDF attachment failed",
    ],
  ] as const)("retains the review and permits the same PDF to be retried after an attachment %s", async (_label, response, message) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ candidate }))
      .mockResolvedValueOnce(Response.json({ error: "Download refused" }, { status: 502 }))
      .mockImplementationOnce(response)
      .mockResolvedValueOnce(Response.json({ reference, artifact, created: false }));
    vi.stubGlobal("fetch", fetcher);
    const element = new TestOpenAccessPdfDialog();
    const imported = vi.fn();
    element.addEventListener(openAccessPdfImportedEvent, imported);
    await element.open(reference);
    await element.importForTest();
    const file = new File(["%PDF-test"], "downloaded.pdf");

    await element.uploadPdf(file);

    const rendered = templateText(element.renderForTest());
    for (const text of [message, candidate.pdfUrl, candidate.landingUrl, "Attach PDF"]) expect(rendered).toContain(text);
    expect(element.nativeDialog.close).not.toHaveBeenCalled();
    expect(imported).not.toHaveBeenCalled();

    await element.uploadPdf(file);

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(imported.mock.calls[0]?.[0]).toMatchObject({ detail: "This PDF was already attached to this reference." });
    expect(element.nativeDialog.close).toHaveBeenCalledOnce();
  });

  it("rejects invalid attachments locally and prevents uploads before failure or during another operation", async () => {
    const upload = deferredResponse();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ candidate }))
      .mockResolvedValueOnce(Response.json({ error: "Download refused" }, { status: 502 }))
      .mockReturnValueOnce(upload.promise)
      .mockResolvedValueOnce(Response.json({ candidate: null }));
    vi.stubGlobal("fetch", fetcher);
    const element = new TestOpenAccessPdfDialog();
    const file = new File(["%PDF-test"], "downloaded.pdf", { type: "application/pdf" });
    await element.uploadPdf(file);
    await element.open(reference);
    await element.uploadPdf(file);
    expect(fetcher).toHaveBeenCalledOnce();
    await element.importForTest();
    await element.uploadPdf(null);
    for (const [invalid, message] of [
      [new File(["text"], "notes.txt", { type: "text/plain" }), "Choose a PDF file."],
      [new File([], "empty.pdf", { type: "application/pdf" }), "Choose a non-empty PDF file."],
      [new File([new Uint8Array(25 * 1024 * 1024 + 1)], "oversize.pdf", { type: "application/pdf" }), "PDF exceeds the 25 MB limit"],
    ] as const) {
      await element.uploadPdf(invalid);
      expect(templateText(element.renderForTest())).toContain(message);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);

    const uploading = element.uploadPdf(file);
    const pending = templateText(element.renderForTest());
    expect(pending).toContain("Attaching the selected PDF…");
    expect(pending).toContain("Attaching…");
    expect(pending).toContain(candidate.pdfUrl);
    await element.uploadPdf(file);
    await element.importForTest();
    expect(fetcher).toHaveBeenCalledTimes(3);
    upload.resolve(Response.json({ error: "Upload unavailable" }, { status: 503 }));
    await uploading;

    await element.open({ ...reference, title: "Another paper" });
    expect(templateText(element.renderForTest())).not.toContain("Attach PDF");
    await element.uploadPdf(file);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("shows Unpaywall evidence and unknown rights without inventing a landing link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ candidate: { ...candidate, provider: "unpaywall", license: "", version: "", landingUrl: "" } })),
    );
    const element = new TestOpenAccessPdfDialog();
    await element.open(reference);
    const rendered = templateText(element.renderForTest());
    expect(rendered).toContain("Unpaywall");
    expect(rendered).toContain("Not reported — sharing rights remain unknown");
    expect(rendered).toContain("<dd>Not reported</dd>");
    expect(rendered).not.toContain("Provider landing page");
  });

  it("prevents imports before discovery completes and clears stale review state on reopening", async () => {
    const discovery = deferredResponse();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ candidate })).mockReturnValueOnce(discovery.promise);
    vi.stubGlobal("fetch", fetcher);
    const element = new TestOpenAccessPdfDialog();
    expect(templateText(element.renderForTest())).toContain("Library reference");
    await element.importForTest();
    expect(fetcher).not.toHaveBeenCalled();
    await element.open(reference);
    const opening = element.open({ ...reference, title: "Another paper" });
    const pending = templateText(element.renderForTest());
    expect(pending).toContain("Another paper");
    expect(pending).toContain("Checking trusted scholarly providers…");
    expect(pending).not.toContain(candidate.pdfUrl);
    expect(pending).not.toContain("Import private PDF");
    await element.importForTest();
    expect(fetcher).toHaveBeenCalledTimes(2);
    discovery.resolve(Response.json({ candidate: null }));
    await opening;
    expect(templateText(element.renderForTest())).not.toContain("Checking trusted scholarly providers…");
  });

  it("allows retry after an error and prevents duplicate pending downloads", async () => {
    const download = deferredResponse();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ candidate }))
      .mockResolvedValueOnce(Response.json({ error: "Host unavailable" }, { status: 502 }))
      .mockReturnValueOnce(download.promise);
    vi.stubGlobal("fetch", fetcher);
    const element = new TestOpenAccessPdfDialog();
    const imported = vi.fn();
    element.addEventListener(openAccessPdfImportedEvent, imported);
    await element.open(reference);
    await element.importForTest();
    expect(imported).not.toHaveBeenCalled();
    const importing = element.importForTest();
    const pending = templateText(element.renderForTest());
    expect(pending).toContain("Downloading the reviewed PDF…");
    expect(pending).toContain("Importing…");
    expect(pending).not.toContain("Host unavailable");
    await element.importForTest();
    expect(fetcher).toHaveBeenCalledTimes(3);
    download.resolve(Response.json({ reference, artifact, created: false }));
    await importing;
    expect(imported).toHaveBeenCalledOnce();
    expect(imported.mock.calls[0]?.[0]).toMatchObject({ bubbles: true, detail: "This PDF was already in the Library." });
    expect(templateText(element.renderForTest())).not.toContain("Importing…");
    expect(element.nativeDialog.close).toHaveBeenCalledOnce();
  });

  it.each([
    ["invalid response", async () => Response.json({ invalid: true }), "Open PDF discovery returned an invalid response"],
    [
      "network error",
      async () => {
        throw new Error("Network unavailable");
      },
      "Network unavailable",
    ],
    [
      "non-Error rejection",
      async () => {
        throw "offline";
      },
      "Open PDF discovery failed",
    ],
  ] as const)("shows discovery failures for %s without offering an import", async (_label, fetcher, message) => {
    vi.stubGlobal("fetch", vi.fn(fetcher));
    const element = new TestOpenAccessPdfDialog();
    await element.open(reference);
    const rendered = templateText(element.renderForTest());
    expect(rendered).toContain(message);
    expect(rendered).toContain('role="alert"');
    expect(rendered).not.toContain("Checking trusted scholarly providers…");
    expect(rendered).not.toContain("No provider supplied");
    expect(rendered).not.toContain("Import private PDF");
    expect(rendered).not.toContain("download the PDF, then attach it here");
  });

  it.each([
    ["invalid response", async () => Response.json({ invalid: true }), "Open PDF import returned an invalid response"],
    [
      "non-Error rejection",
      async () => {
        throw "offline";
      },
      "Open PDF import failed",
    ],
  ] as const)("retains recovery links for an import %s", async (_label, response, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ candidate })).mockImplementationOnce(response));
    const element = new TestOpenAccessPdfDialog();
    const imported = vi.fn();
    element.addEventListener(openAccessPdfImportedEvent, imported);
    await element.open(reference);
    await element.importForTest();
    const rendered = templateText(element.renderForTest());
    expect(rendered).toContain(message);
    expect(rendered).toContain(candidate.pdfUrl);
    expect(rendered).toContain("Import private PDF");
    expect(rendered).not.toContain("Importing…");
    expect(element.nativeDialog.close).not.toHaveBeenCalled();
    expect(imported).not.toHaveBeenCalled();
  });
});
