import { afterEach, describe, expect, it, vi } from "vitest";
import type { BibliographicRecord, LibraryPdfArtifact, MetadataRefinementPreview } from "../../domain/reference-library";
import { extractPdfMetadata } from "../pdf/pdf-metadata";
import {
  LibraryReferenceMetadataEditor,
  libraryReferenceMetadataNoticeEvent,
  libraryReferenceMetadataRefreshEvent,
} from "./library-reference-metadata-editor";

vi.mock("../pdf/pdf-metadata", async () => {
  const actual = await vi.importActual<typeof import("../pdf/pdf-metadata")>("../pdf/pdf-metadata");
  return { ...actual, extractPdfMetadata: vi.fn() };
});

class TestLibraryReferenceMetadataEditor extends LibraryReferenceMetadataEditor {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  saveForTest(): Promise<void> {
    return this.save();
  }

  refineForTest(): Promise<void> {
    return this.refine();
  }

  applyPdfForTest(): Promise<void> {
    return this.applyPdf();
  }

  applyProviderForTest(): Promise<void> {
    return this.applyProvider();
  }
}

const reference = {
  id: "ref-1",
  referenceKey: "doe2026",
  type: "article",
  title: "Current title",
  authors: ["Jane Doe"],
  year: "2025",
  venue: "Journal",
  doi: "10.1000/current",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
} satisfies BibliographicRecord;

const artifact = {
  id: "pdf-1",
  referenceId: reference.id,
  name: "paper.pdf",
  contentType: "application/pdf" as const,
  size: 2048,
  objectKey: "pdfs/paper",
  fingerprint: "fingerprint",
  rights: "private" as const,
  createdAt: "2026-07-25T00:00:00.000Z",
} satisfies LibraryPdfArtifact;

const local = {
  title: "Suggested title",
  authors: ["Jane Doe", "John Roe"],
  year: "2026",
  doi: "10.1000/suggested",
  diagnostics: ["Two pages inspected."],
  pagesScanned: 2,
};

const preview = {
  referenceId: reference.id,
  artifactId: artifact.id,
  candidates: [
    {
      provider: "crossref",
      match: "doi",
      score: 1,
      metadata: {
        type: "article",
        title: "Provider title",
        authors: ["Jane Doe"],
        year: "2026",
        venue: "Provider Journal",
        doi: "10.1000/suggested",
        url: "https://example.test/paper",
        abstract: "Provider abstract",
      },
      metadataFingerprint: "a".repeat(64),
    },
  ],
} satisfies MetadataRefinementPreview;

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json", ...headers }, status });
}

function configuredEditor(): TestLibraryReferenceMetadataEditor {
  const editor = new TestLibraryReferenceMetadataEditor();
  editor.setData(reference, "Current title", artifact);
  return editor;
}

async function openReview(editor: TestLibraryReferenceMetadataEditor, fetchMock = vi.fn().mockResolvedValue(json(preview))): Promise<void> {
  vi.mocked(extractPdfMetadata).mockResolvedValue(local);
  vi.stubGlobal("fetch", fetchMock);
  await editor.refineForTest();
}

describe("library reference metadata editor", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("owns manual, progress, and review presentation in light DOM", () => {
    const editor = new TestLibraryReferenceMetadataEditor();
    expect(editor.rootForTest()).toBe(editor);
    expect(editor.renderForTest()).toBeDefined();
    editor.setData(reference, "Current title", artifact);
    expect(editor.renderForTest()).toBeDefined();
    editor.showStatus("Refine metadata", "Reading PDF…");
    expect(editor.renderForTest()).toBeDefined();
    editor.showReview(artifact, local, preview, "", true);
    expect(editor.renderForTest()).toBeDefined();
  });

  it("owns manual metadata persistence and emits a refresh outcome", async () => {
    const editor = configuredEditor();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const outcomes: string[] = [];
    editor.addEventListener(libraryReferenceMetadataRefreshEvent, (event) => outcomes.push((event as CustomEvent<string>).detail));

    await editor.saveForTest();

    expect(fetchMock).toHaveBeenCalledWith("/api/library/references/ref-1", {
      body: JSON.stringify({
        type: "article",
        title: "Current title",
        authors: ["Jane Doe"],
        year: "2025",
        venue: "Journal",
        doi: "10.1000/current",
        url: "",
        abstract: "",
      }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    expect(outcomes).toEqual(["Bibliographic details saved with manual provenance."]);
  });

  it("keeps manual-save failures local and ignores duplicate submissions", async () => {
    const editor = configuredEditor();
    let resolveResponse = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal("fetch", fetchMock);
    const notices: string[] = [];
    editor.addEventListener(libraryReferenceMetadataNoticeEvent, (event) => notices.push((event as CustomEvent<string>).detail));

    const first = editor.saveForTest();
    await editor.saveForTest();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(json({ error: "Metadata unavailable" }, 503));
    await first;

    expect(notices).toEqual(["Metadata unavailable"]);
    expect(editor.renderForTest()).toBeDefined();
  });

  it("owns local extraction, provider preview, validation, and cache presentation", async () => {
    const editor = configuredEditor();
    const fetchMock = vi.fn().mockResolvedValue(json(preview, 200, { "x-kirjolab-metadata-cache": "hit" }));

    await openReview(editor, fetchMock);

    expect(extractPdfMetadata).toHaveBeenCalledWith("/api/library/pdfs/pdf-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/library/references/ref-1/metadata-refinement/preview", {
      body: JSON.stringify({
        artifactId: "pdf-1",
        candidates: { title: local.title, authors: local.authors, year: local.year, doi: local.doi },
      }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(editor.renderForTest()).toBeDefined();
  });

  it("retains local suggestions after provider or malformed preview failures", async () => {
    const editor = configuredEditor();
    vi.mocked(extractPdfMetadata).mockResolvedValue(local);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "Provider unavailable" }, 503))
      .mockResolvedValueOnce(json({ invalid: true }));
    vi.stubGlobal("fetch", fetchMock);

    await editor.refineForTest();
    expect(editor.renderForTest()).toBeDefined();
    await editor.refineForTest();
    expect(editor.renderForTest()).toBeDefined();
  });

  it("owns PDF and provider acceptance payloads and emits refresh outcomes", async () => {
    const editor = configuredEditor();
    await openReview(editor);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const refreshes: string[] = [];
    editor.addEventListener(libraryReferenceMetadataRefreshEvent, (event) => refreshes.push((event as CustomEvent<string>).detail));

    await editor.applyPdfForTest();
    await editor.applyProviderForTest();

    expect(refreshes).toEqual([
      "Selected PDF metadata applied with provenance.",
      "Scholarly metadata applied with field-level provenance.",
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/library/references/ref-1/pdf-metadata", {
      body: JSON.stringify({
        artifactId: "pdf-1",
        fields: { title: "Suggested title", authors: ["Jane Doe", "John Roe"], year: "2026", doi: "10.1000/suggested" },
      }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/library/references/ref-1/metadata-refinement/accept", {
      body: JSON.stringify({
        selections: [
          {
            provider: "crossref",
            doi: "10.1000/suggested",
            metadataFingerprint: "a".repeat(64),
            fields: ["title", "year", "venue", "doi", "url", "abstract"],
          },
        ],
      }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("reports acceptance failures and keeps the active provider review retryable", async () => {
    const editor = configuredEditor();
    await openReview(editor);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "Fingerprint changed" }, 409))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const notices: string[] = [];
    const refreshes: string[] = [];
    editor.addEventListener(libraryReferenceMetadataNoticeEvent, (event) => notices.push((event as CustomEvent<string>).detail));
    editor.addEventListener(libraryReferenceMetadataRefreshEvent, (event) => refreshes.push((event as CustomEvent<string>).detail));

    await editor.applyProviderForTest();
    await editor.applyProviderForTest();

    expect(notices).toEqual(["Fingerprint changed"]);
    expect(refreshes).toEqual(["Scholarly metadata applied with field-level provenance."]);
  });

  it("rejects a delayed extraction after the editor switches references", async () => {
    const editor = configuredEditor();
    let resolveCandidates = (_value: typeof local): void => undefined;
    vi.mocked(extractPdfMetadata).mockReturnValue(
      new Promise((resolve) => {
        resolveCandidates = resolve;
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const refinement = editor.refineForTest();
    editor.setData({ ...reference, id: "ref-2" }, "Another paper", { ...artifact, id: "pdf-2", referenceId: "ref-2" });
    resolveCandidates(local);
    await refinement;

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
