import { describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import type { CitationAssertion, CitationNetwork } from "../domain/citation-assertions";
import type { BibliographicRecord, ReferenceLibrarySnapshot, WebSnapshot } from "../domain/reference-library";
import type { AuthIdentity } from "../security/auth";
import { handleReferenceLibraryApi } from "./reference-library";

const identity: AuthIdentity = { subject: "owner", email: "owner@example.test", ownerKey: "owner-key", mode: "local" };
const now = "2026-07-11T10:00:00.000Z";
const reference: BibliographicRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  referenceKey: "guide",
  type: "manual",
  title: "Private Guide",
  authors: [],
  year: "",
  venue: "",
  doi: "",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};
const snapshot: ReferenceLibrarySnapshot = {
  references: [reference],
  artifacts: [],
  webSources: [],
  webSnapshots: [],
  notes: [],
  highlights: [],
  tags: {},
  collections: {},
  reading: [],
};
const webSnapshot: WebSnapshot = {
  id: "33333333-3333-4333-8333-333333333333",
  referenceId: reference.id,
  requestedUrl: "https://example.com/article",
  finalUrl: "https://example.com/article",
  accessedAt: now,
  status: 200,
  contentType: "text/html",
  rawObjectKey: null,
  readableObjectKey: null,
  rawSize: 0,
  readableSize: 0,
  contentHash: "sha256:empty",
  title: reference.title,
  authors: [],
  publisher: "",
  publishedAt: "",
  complete: false,
  diagnostics: ["The page could not be retrieved during this capture."],
  redirectChain: [],
  etag: "",
  lastModified: "",
};
const citationAssertion: CitationAssertion = {
  id: "55555555-5555-4555-8555-555555555555",
  citingReferenceId: reference.id,
  citedReferenceId: "66666666-6666-4666-8666-666666666666",
  polarity: "cites",
  evidenceState: "extracted",
  method: "provider",
  assertedBy: "Crossref",
  observedAt: now,
  sourceKind: "provider-response",
  sourceId: "sha256:response",
  sourceLocator: "https://api.crossref.org/works/10.1000%2Fsource",
  confidence: null,
  review: null,
  createdAt: now,
};
const citationNetwork: CitationNetwork = { projectId: null, nodes: [], edges: [], truncated: false };

describe("reference library API", () => {
  it("returns only the selected owner library and supports archived navigation", async () => {
    const fixture = apiFixture();
    const response = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library?archived=include"),
      fixture.env,
      identity,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(snapshot);
    expect(fixture.getByName).toHaveBeenCalledWith("owner-key");
    expect(fixture.library.getSnapshot).toHaveBeenCalledWith(true);
  });

  it("validates and imports bounded BibTeX with the authenticated actor", async () => {
    const fixture = apiFixture();
    const invalid = await handleReferenceLibraryApi(jsonRequest("/api/library/import", { bibtex: "" }), fixture.env, identity);
    expect(invalid.status).toBe(400);
    const imported = await handleReferenceLibraryApi(
      jsonRequest("/api/library/import", { bibtex: "@manual{guide,title={Private Guide}}" }),
      fixture.env,
      identity,
    );
    expect(imported.status).toBe(201);
    expect(fixture.library.importBibTeX).toHaveBeenCalledWith("@manual{guide,title={Private Guide}}", identity.email);
  });

  it("imports Zotero-compatible CSL JSON and round-trips portable library metadata", async () => {
    const fixture = apiFixture();
    const csl = [
      {
        id: "guide",
        type: "article-journal",
        title: "Private Guide",
        author: [{ family: "Writer", given: "Ada" }],
        issued: { "date-parts": [[2026]] },
      },
    ];
    const imported = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library/import/csl-json", {
        method: "POST",
        headers: { origin: "https://example.test", "content-type": "application/json" },
        body: JSON.stringify(csl),
      }),
      fixture.env,
      identity,
    );
    expect(imported.status).toBe(201);
    expect(fixture.library.importBibTeX).toHaveBeenLastCalledWith(expect.stringContaining("@article{guide,"), identity.email);

    const cslExport = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library/export/csl.json"),
      fixture.env,
      identity,
    );
    expect(cslExport.headers.get("content-disposition")).toContain("kirjolab-library.csl.json");
    await expect(cslExport.json()).resolves.toEqual([expect.objectContaining({ id: reference.id, title: reference.title })]);

    const archive = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library/export/library.zip"),
      fixture.env,
      identity,
    );
    const archiveBytes = new Uint8Array(await archive.arrayBuffer());
    expect(Object.keys(unzipSync(archiveBytes)).sort()).toEqual(["manifest.json", "references.csl.json", "research.json"]);
    const secondArchive = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library/export/library.zip"),
      fixture.env,
      identity,
    );
    expect(new Uint8Array(await secondArchive.arrayBuffer())).toEqual(archiveBytes);
    const restored = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library/import/archive", {
        method: "POST",
        headers: { origin: "https://example.test", "content-type": "application/zip" },
        body: archiveBytes,
      }),
      fixture.env,
      identity,
    );
    expect(restored.status).toBe(201);
  });

  it("rejects private web destinations and records a bounded failed capture when metadata identifies the source", async () => {
    const fixture = apiFixture();
    const invalid = await handleReferenceLibraryApi(
      jsonRequest("/api/library/web-sources", {
        url: "http://127.0.0.1/private",
        title: "Private",
        authors: [],
        publisher: "",
        publishedAt: "",
      }),
      fixture.env,
      identity,
    );
    expect(invalid.status).toBe(400);

    const fetchWeb = vi.fn(async (): Promise<never> => {
      throw new Error("offline");
    });
    const captured = await handleReferenceLibraryApi(
      jsonRequest("/api/library/web-sources", {
        url: "https://example.com/article#section",
        title: "Private Guide",
        authors: ["Ada Writer"],
        publisher: "Example",
        publishedAt: "2026-07-12",
      }),
      fixture.env,
      identity,
      fetchWeb,
    );
    expect(captured.status).toBe(201);
    expect(fetchWeb).toHaveBeenCalledOnce();
    expect(fixture.library.registerWebCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalUrl: "https://example.com/article",
        actor: identity.email,
        snapshot: expect.objectContaining({ complete: false, status: 0, title: "Private Guide" }),
      }),
    );
  });

  it("captures redirected HTML into inert R2 representations and compares readable versions", async () => {
    const bucket = new MemoryR2Bucket();
    const fixture = apiFixture(bucket);
    const fetchWeb = vi
      .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://example.com/final" } }))
      .mockResolvedValueOnce(
        new Response(
          `<html><head><meta property="og:title" content="Captured page"><meta name="author" content="Ada Writer"></head>
           <body><main><h1>Evidence</h1><p>First readable version with enough detail to inspect safely.</p></main></body></html>`,
          { headers: { "content-type": "text/html; charset=utf-8", etag: '"page-1"' } },
        ),
      );
    const response = await handleReferenceLibraryApi(
      jsonRequest("/api/library/web-sources", {
        url: "https://example.com/start",
        title: "",
        authors: [],
        publisher: "",
        publishedAt: "",
      }),
      fixture.env,
      identity,
      fetchWeb,
    );
    expect(response.status).toBe(201);
    expect(fetchWeb).toHaveBeenCalledTimes(2);
    const registration = fixture.library.registerWebCapture.mock.calls[0]?.[0];
    expect(registration).toBeDefined();
    expect(registration?.snapshot).toMatchObject({
      finalUrl: "https://example.com/final",
      title: "Captured page",
      authors: ["Ada Writer"],
      complete: true,
      redirectChain: ["https://example.com/final"],
      etag: '"page-1"',
      rawSize: expect.any(Number),
      readableSize: expect.any(Number),
    });
    const captured = { ...registration!.snapshot, referenceId: reference.id };
    fixture.library.getWebSnapshot.mockResolvedValue(captured);
    const raw = await handleReferenceLibraryApi(
      new Request(`https://example.test/api/library/web-snapshots/${captured.id}/raw`),
      fixture.env,
      identity,
    );
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toBe("application/octet-stream");
    expect(raw.headers.get("content-disposition")).toContain("attachment");
    expect(raw.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await raw.text()).toContain("First readable version");

    const older = { ...captured, id: "44444444-4444-4444-8444-444444444444", readableObjectKey: "older-readable" };
    await bucket.put("older-readable", "Evidence\nEarlier idea");
    fixture.library.getWebSnapshot.mockImplementation(async (id: string) => (id === older.id ? older : captured));
    const compared = await handleReferenceLibraryApi(
      new Request(`https://example.test/api/library/web-snapshots/${older.id}/compare/${captured.id}`),
      fixture.env,
      identity,
    );
    expect(compared.status).toBe(200);
    await expect(compared.json()).resolves.toMatchObject({
      comparison: { identical: false, addedLines: expect.any(Number), removedLines: expect.any(Number) },
    });
  });

  it("routes private metadata, annotation, archive, and deletion operations", async () => {
    const fixture = apiFixture();
    const id = reference.id;
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/tags`, { tags: ["methods"] }, "PUT"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/collections`, { collections: ["Dissertation"] }, "PUT"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    const metadata = {
      type: "article",
      title: "Edited",
      authors: ["Doe, Jane"],
      year: "2026",
      venue: "Journal",
      doi: "",
      url: "",
      abstract: "",
    };
    expect(
      (await handleReferenceLibraryApi(jsonRequest(`/api/library/references/${id}`, metadata, "PATCH"), fixture.env, identity)).status,
    ).toBe(200);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/pdf-metadata`, {
            artifactId: "22222222-2222-4222-8222-222222222222",
            fields: { title: "Reviewed PDF", authors: ["Doe, Jane"], year: "2025", doi: "10.5555/reviewed" },
          }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (await handleReferenceLibraryApi(jsonRequest(`/api/library/references/${id}/notes`, { body: "Private note" }), fixture.env, identity))
        .status,
    ).toBe(201);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/highlights`, {
            artifactId: "artifact",
            page: 2,
            quote: "Evidence",
            comment: "Private",
          }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/reading`, { status: "reading", rating: 4, priority: "high" }, "PUT"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (await handleReferenceLibraryApi(jsonRequest(`/api/library/references/${id}`, { archived: true }, "PATCH"), fixture.env, identity))
        .status,
    ).toBe(200);
    expect(
      (
        await handleReferenceLibraryApi(
          new Request(`https://example.test/api/library/references/${id}/deletion-impact`),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}`, { expectedProjectIds: ["project"] }, "DELETE"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(fixture.library.setTags).toHaveBeenCalledWith(id, ["methods"]);
    expect(fixture.library.createNote).toHaveBeenCalledWith(id, "Private note");
    expect(fixture.library.createHighlight).toHaveBeenCalledWith(id, "artifact", 2, "Evidence", "Private");
    expect(fixture.library.setReadingState).toHaveBeenCalledWith(id, "reading", 4, "high");
    expect(fixture.library.setCollections).toHaveBeenCalledWith(id, ["Dissertation"]);
    expect(fixture.library.updateReferenceMetadata).toHaveBeenCalledWith(id, metadata, identity.email);
    expect(fixture.library.applyReviewedPdfMetadata).toHaveBeenCalledWith(
      id,
      "22222222-2222-4222-8222-222222222222",
      { title: "Reviewed PDF", authors: ["Doe, Jane"], year: "2025", doi: "10.5555/reviewed" },
      identity.email,
    );
    expect(fixture.library.archiveReference).toHaveBeenCalledWith(id, true);
    expect(fixture.library.permanentlyDeleteReference).toHaveBeenCalledWith(id, ["project"]);
  });

  it("identifies PDFs, records rights, and maps domain errors without leaking cacheable responses", async () => {
    const fixture = apiFixture();
    const artifactId = "22222222-2222-4222-8222-222222222222";
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/pdfs/${artifactId}/identify`, { referenceId: reference.id }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/pdfs/${artifactId}/rights`, { rights: "shareable" }, "PUT"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    fixture.library.archiveReference.mockRejectedValueOnce(new Error("Reference not found"));
    const missing = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}`, { archived: true }, "PATCH"),
      fixture.env,
      identity,
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects empty, unknown, and over-limit PDF metadata fields", async () => {
    const fixture = apiFixture();
    const route = `/api/library/references/${reference.id}/pdf-metadata`;
    for (const body of [
      { artifactId: "22222222-2222-4222-8222-222222222222", fields: {} },
      { artifactId: "22222222-2222-4222-8222-222222222222", fields: { venue: "Not extracted" } },
      { artifactId: "22222222-2222-4222-8222-222222222222", fields: { title: "x".repeat(2_001) } },
      { artifactId: "not-an-id", fields: { title: "Paper" } },
    ]) {
      expect((await handleReferenceLibraryApi(jsonRequest(route, body), fixture.env, identity)).status).toBe(400);
    }
    expect(fixture.library.applyReviewedPdfMetadata).not.toHaveBeenCalled();
  });

  it("previews Crossref metadata without mutation and applies only a reviewed fingerprint", async () => {
    const fixture = apiFixture();
    const doiReference = { ...reference, doi: "10.5555/current" };
    fixture.library.getReferences.mockResolvedValue([doiReference]);
    const fetchCrossref = vi.fn(async () => crossrefResponse());
    const previewResponse = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/crossref/preview`, {}),
      fixture.env,
      identity,
      fetchCrossref,
    );
    expect(previewResponse.status).toBe(200);
    const preview = (await previewResponse.json()) as { metadataFingerprint: string };
    expect(preview.metadataFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(fixture.library.applyReviewedCrossrefMetadata).not.toHaveBeenCalled();

    const acceptResponse = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/crossref/accept`, {
        metadataFingerprint: preview.metadataFingerprint,
        fields: ["title", "authors"],
      }),
      fixture.env,
      identity,
      fetchCrossref,
    );
    expect(acceptResponse.status).toBe(200);
    expect(fixture.library.applyReviewedCrossrefMetadata).toHaveBeenCalledWith(
      reference.id,
      "10.5555/current",
      expect.objectContaining({ title: "Crossref title", authors: ["Doe, Jane"], doi: "10.5555/current" }),
      ["title", "authors"],
      identity.email,
    );
    expect(fetchCrossref).toHaveBeenCalledTimes(2);
  });

  it("rejects stale Crossref reviews and reports an existing DOI owner before lookup", async () => {
    const fixture = apiFixture();
    const doiReference = { ...reference, doi: "10.5555/current" };
    fixture.library.getReferences.mockResolvedValue([doiReference]);
    const fetchCrossref = vi.fn(async () => crossrefResponse());
    const stale = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/crossref/accept`, {
        metadataFingerprint: "a".repeat(64),
        fields: ["title"],
      }),
      fixture.env,
      identity,
      fetchCrossref,
    );
    expect(stale.status).toBe(409);
    expect(fixture.library.applyReviewedCrossrefMetadata).not.toHaveBeenCalled();

    const duplicate = { ...reference, id: "99999999-9999-4999-8999-999999999999", referenceKey: "doe2026", doi: doiReference.doi };
    fixture.library.findReferencesByDois.mockResolvedValue([duplicate]);
    fetchCrossref.mockClear();
    const conflict = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/crossref/preview`, {}),
      fixture.env,
      identity,
      fetchCrossref,
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ duplicateReference: { id: duplicate.id, referenceKey: "doe2026" } });
    expect(fetchCrossref).not.toHaveBeenCalled();
  });

  it("rejects invalid Crossref acceptance and provider failure without mutation", async () => {
    const fixture = apiFixture();
    fixture.library.getReferences.mockResolvedValue([{ ...reference, doi: "10.5555/current" }]);
    const fetchCrossref = vi.fn(async () => crossrefResponse());
    const route = `/api/library/references/${reference.id}/crossref/accept`;
    for (const body of [
      { metadataFingerprint: "short", fields: ["title"] },
      { metadataFingerprint: "a".repeat(64), fields: [] },
      { metadataFingerprint: "a".repeat(64), fields: ["title", "title"] },
      { metadataFingerprint: "a".repeat(64), fields: ["publisher"] },
    ]) {
      expect((await handleReferenceLibraryApi(jsonRequest(route, body), fixture.env, identity, fetchCrossref)).status).toBe(400);
    }
    expect(fetchCrossref).not.toHaveBeenCalled();
    fetchCrossref.mockRejectedValueOnce(new Error("Crossref unavailable"));
    const unavailable = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/crossref/preview`, {}),
      fixture.env,
      identity,
      fetchCrossref,
    );
    expect(unavailable.status).toBe(400);
    await expect(unavailable.json()).resolves.toEqual({ error: "Crossref unavailable" });
    expect(fixture.library.applyReviewedCrossrefMetadata).not.toHaveBeenCalled();
  });

  it("routes citation assertions, review, project filtering, and explicit Crossref expansion", async () => {
    const fixture = apiFixture();
    const createBody = {
      citingReferenceId: reference.id,
      citedReferenceId: citationAssertion.citedReferenceId,
      polarity: "cites",
      evidenceState: "confirmed",
      method: "manual",
      observedAt: now,
      sourceKind: "researcher",
      sourceId: "manual:1",
      sourceLocator: "researcher review",
      confidence: null,
    };
    expect(
      (await handleReferenceLibraryApi(jsonRequest("/api/library/citation-assertions", createBody), fixture.env, identity)).status,
    ).toBe(201);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/citation-assertions/${citationAssertion.id}/review`, {
            decision: "confirmed",
            note: "Checked source",
          }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleReferenceLibraryApi(
          new Request("https://example.test/api/library/citation-network?projectId=project-a"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (await handleReferenceLibraryApi(new Request("https://example.test/api/library/citation-assertions"), fixture.env, identity)).status,
    ).toBe(200);
    expect(fixture.library.createCitationAssertions).toHaveBeenCalledWith([createBody], identity.email);
    expect(fixture.library.reviewCitationAssertion).toHaveBeenCalledWith(
      citationAssertion.id,
      { decision: "confirmed", note: "Checked source" },
      identity.email,
    );
    expect(fixture.library.getCitationNetwork).toHaveBeenCalledWith("project-a");

    const source = { ...reference, doi: "10.1000/source" };
    const target = { ...reference, id: citationAssertion.citedReferenceId, title: "Target", doi: "10.1000/target" };
    fixture.library.getReferences.mockResolvedValueOnce([source]);
    fixture.library.findReferencesByDois.mockResolvedValueOnce([target]);
    const fetchExternal = vi.fn(async () =>
      Response.json({ message: { reference: [{ DOI: "10.1000/target", "article-title": "Target" }, { DOI: "10.1000/unmatched" }] } }),
    );
    const expanded = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/citation-expansions`, {}),
      fixture.env,
      identity,
      fetchExternal,
    );
    expect(expanded.status).toBe(201);
    await expect(expanded.json()).resolves.toMatchObject({
      provider: "crossref",
      direction: "references",
      assertions: [expect.objectContaining({ citingReferenceId: reference.id, citedReferenceId: target.id })],
      unmatched: [{ doi: "10.1000/unmatched" }],
      requestedBy: identity.email,
    });
    expect(fetchExternal).toHaveBeenCalledOnce();
    expect(fixture.library.createCitationAssertions).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          citingReferenceId: reference.id,
          citedReferenceId: target.id,
          evidenceState: "extracted",
          method: "provider",
          sourceKind: "provider-response",
        }),
      ],
      "Crossref",
    );

    expect(
      (
        await handleReferenceLibraryApi(
          new Request("https://example.test/api/library/citation-network?projectId=../bad"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest("/api/library/citation-assertions", { ...createBody, evidenceState: "conflicting" }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(400);
  });
});

function apiFixture(bucket = new MemoryR2Bucket()) {
  const artifact = {
    id: "22222222-2222-4222-8222-222222222222",
    referenceId: reference.id,
    name: "guide.pdf",
    contentType: "application/pdf",
    size: 100,
    objectKey: "libraries/owner/guide.pdf",
    fingerprint: "r2-etag:guide",
    rights: "private",
    createdAt: now,
  } as const;
  const library = {
    getSnapshot: vi.fn(async () => snapshot),
    importBibTeX: vi.fn(async () => [{ reference, suggestedAlias: "guide", created: true }]),
    registerPdf: vi.fn(async () => artifact),
    createPdfDraft: vi.fn(async () => ({ reference, artifact })),
    identifyPdf: vi.fn(async () => artifact),
    setArtifactRights: vi.fn(async () => ({ ...artifact, rights: "shareable" as const })),
    archiveReference: vi.fn(async () => ({ ...reference, archivedAt: now })),
    updateReferenceMetadata: vi.fn(async () => ({ ...reference, updatedAt: now })),
    applyReviewedPdfMetadata: vi.fn(async () => ({ ...reference, title: "Reviewed PDF", updatedAt: now })),
    applyReviewedCrossrefMetadata: vi.fn(async () => ({ ...reference, title: "Crossref title", updatedAt: now })),
    setTags: vi.fn(async (_referenceId: string, tags: readonly string[]) => tags),
    setCollections: vi.fn(async (_referenceId: string, collections: readonly string[]) => collections),
    createNote: vi.fn(async (referenceId: string, body: string) => ({ id: "note", referenceId, body, createdAt: now, updatedAt: now })),
    createHighlight: vi.fn(async (referenceId: string, artifactId: string, page: number, quote: string, comment: string) => ({
      id: "highlight",
      referenceId,
      artifactId,
      page,
      quote,
      comment,
      createdAt: now,
      updatedAt: now,
    })),
    setReadingState: vi.fn(
      async (referenceId: string, status: "unread" | "reading" | "read", rating: number | null, priority: "low" | "normal" | "high") => ({
        referenceId,
        status,
        rating,
        priority,
        updatedAt: now,
      }),
    ),
    getDeletionImpact: vi.fn(async () => ({
      referenceId: reference.id,
      projectIds: ["project"],
      artifactCount: 0,
      noteCount: 0,
      highlightCount: 0,
      webSnapshotCount: 0,
    })),
    permanentlyDeleteReference: vi.fn(async () => ({ ...reference, deletedAt: now })),
    registerWebCapture: vi.fn(async (registration: import("../domain/reference-library").WebCaptureRegistration) => ({
      reference,
      source: { referenceId: reference.id, canonicalUrl: registration.canonicalUrl, createdAt: now, updatedAt: now },
      snapshot: { ...registration.snapshot, referenceId: reference.id },
      created: true,
    })),
    getWebSnapshot: vi.fn(async (_snapshotId: string) => webSnapshot),
    getWebSnapshots: vi.fn(async () => [webSnapshot]),
    getReferences: vi.fn(async () => [reference]),
    findReferencesByDois: vi.fn(async () => [] as BibliographicRecord[]),
    createCitationAssertions: vi.fn(async (inputs: readonly import("../domain/citation-assertions").CreateCitationAssertionInput[]) =>
      inputs.map((input) => ({ ...citationAssertion, ...input })),
    ),
    getCitationAssertions: vi.fn(async () => [citationAssertion]),
    reviewCitationAssertion: vi.fn(async (_id: string, input: import("../domain/citation-assertions").ReviewCitationAssertionInput) => ({
      ...citationAssertion,
      review: { decision: input.decision, note: input.note, reviewer: identity.email, reviewedAt: now },
    })),
    getCitationNetwork: vi.fn(async () => citationNetwork),
  };
  const getByName = vi.fn(() => library);
  return {
    library,
    getByName,
    env: {
      REFERENCE_LIBRARIES: { getByName },
      PAPERS: bucket,
      CROSSREF_MAILTO: "",
    },
  };
}

function crossrefResponse(): Response {
  return Response.json({
    message: {
      type: "journal-article",
      title: ["Crossref title"],
      author: [{ family: "Doe", given: "Jane" }],
      issued: { "date-parts": [[2026]] },
      "container-title": ["Open Research"],
      DOI: "10.5555/current",
      URL: "https://doi.org/10.5555/current",
      abstract: "<jats:p>Crossref abstract</jats:p>",
    },
  });
}

class MemoryR2Bucket implements Pick<R2Bucket, "put" | "get" | "delete"> {
  readonly #objects = new Map<
    string,
    { bytes: Uint8Array; httpMetadata: R2HTTPMetadata | undefined; customMetadata: Record<string, string> | undefined }
  >();

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: R2PutOptions,
  ): Promise<R2Object> {
    const bytes = await r2ValueBytes(value);
    const httpMetadata = normalizeR2HttpMetadata(options?.httpMetadata);
    this.#objects.set(key, { bytes, httpMetadata, customMetadata: options?.customMetadata });
    return memoryR2Object(key, bytes, httpMetadata, options?.customMetadata);
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const value = this.#objects.get(key);
    return value ? memoryR2Object(key, value.bytes, value.httpMetadata, value.customMetadata) : null;
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of typeof keys === "string" ? [keys] : keys) this.#objects.delete(key);
  }
}

function normalizeR2HttpMetadata(value: R2HTTPMetadata | Headers | undefined): R2HTTPMetadata | undefined {
  if (!(value instanceof Headers)) return value;
  const contentType = value.get("content-type") ?? undefined;
  return contentType ? { contentType } : undefined;
}

async function r2ValueBytes(value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob): Promise<Uint8Array> {
  if (value === null) return new Uint8Array();
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  return new Uint8Array(await new Response(value).arrayBuffer());
}

function memoryR2Object(
  key: string,
  storedBytes: Uint8Array,
  httpMetadata?: R2HTTPMetadata,
  customMetadata?: Record<string, string>,
): R2ObjectBody {
  const bytes = storedBytes.slice();
  return {
    key,
    version: "test-version",
    size: bytes.length,
    etag: "test-etag",
    httpEtag: '"test-etag"',
    checksums: { toJSON: () => ({}) },
    uploaded: new Date(now),
    ...(httpMetadata ? { httpMetadata } : {}),
    ...(customMetadata ? { customMetadata } : {}),
    storageClass: "Standard",
    writeHttpMetadata(headers: Headers): void {
      if (httpMetadata?.contentType) headers.set("content-type", httpMetadata.contentType);
    },
    get body(): ReadableStream {
      return new Blob([bytes]).stream();
    },
    get bodyUsed(): boolean {
      return false;
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      return bytes.slice().buffer;
    },
    async bytes(): Promise<Uint8Array> {
      return bytes.slice();
    },
    async text(): Promise<string> {
      return new TextDecoder().decode(bytes);
    },
    async json<T>(): Promise<T> {
      return JSON.parse(new TextDecoder().decode(bytes));
    },
    async blob(): Promise<Blob> {
      return new Blob([bytes]);
    },
  };
}

function jsonRequest(path: string, body: object, method = "POST"): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
