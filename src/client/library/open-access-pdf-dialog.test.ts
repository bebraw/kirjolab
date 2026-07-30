import { afterEach, describe, expect, it, vi } from "vitest";
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
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ candidate }))
      .mockResolvedValueOnce(Response.json({ reference, artifact, created: true }));
    vi.stubGlobal("fetch", fetcher);
    const element = new TestOpenAccessPdfDialog();

    await element.open(reference);
    expect(element.nativeDialog.showModal).toHaveBeenCalledOnce();
    expect(element.renderForTest()).toBeDefined();
    const imported = vi.fn();
    element.addEventListener(openAccessPdfImportedEvent, imported);
    await element.importForTest();

    expect(imported).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenLastCalledWith(
      `/api/library/references/${reference.id}/open-pdf/import`,
      expect.objectContaining({ body: JSON.stringify({ provider: "openalex", fingerprint: candidate.fingerprint }) }),
    );
  });

  it("keeps an empty provider result reviewable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ candidate: null })),
    );
    const element = new TestOpenAccessPdfDialog();
    await element.open(reference);
    expect(element.renderForTest()).toBeDefined();
    await element.importForTest();
    expect(element.nativeDialog.close).not.toHaveBeenCalled();
  });
});
