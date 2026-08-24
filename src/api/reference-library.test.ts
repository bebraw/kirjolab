import { afterEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import type { CitationAssertion, CitationNetwork } from "../domain/citation/citation-assertions";
import type {
  ArtifactAnalysis,
  ArtifactAnalysisKind,
  BibliographicRecord,
  LibraryHighlight,
  LibraryPdfMarkup,
  MetadataRefinementPreview,
  PdfReferenceReviewQueue,
  ReferenceLibrarySnapshot,
  WebSnapshot,
} from "../domain/reference-library";
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
  referenceKeyStates: { [reference.id]: "final" },
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

afterEach(() => vi.unstubAllGlobals());

describe("reference library API", () => {
  it("discovers, fingerprint-verifies, stores, attaches, and queues an open PDF", async () => {
    const bucket = new MemoryR2Bucket();
    const fixture = apiFixture(bucket);
    const doiReference = { ...reference, doi: "10.1000/open" };
    fixture.library.getReferences.mockResolvedValue([doiReference]);
    const provider = {
      id: "https://openalex.org/W123",
      best_oa_location: {
        is_oa: true,
        landing_page_url: "https://repository.example/paper",
        pdf_url: "https://repository.example/paper.pdf",
        license: "cc-by",
        version: "acceptedVersion",
      },
    };
    const fetchExternal = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      return url.startsWith("https://api.openalex.org/")
        ? Response.json(provider)
        : new Response(new TextEncoder().encode("%PDF-test"), { headers: { "content-type": "application/pdf" } });
    });
    const env = { ...fixture.env, OPENALEX_API_KEY: "openalex-key" };

    const discovery = await handleReferenceLibraryApi(
      new Request(`https://example.test/api/library/references/${reference.id}/open-pdf/discover`, { method: "POST" }),
      env,
      identity,
      fetchExternal,
    );
    expect(discovery.status).toBe(200);
    const discovered = (await discovery.json()) as { candidate: { provider: "openalex"; fingerprint: string } };

    const imported = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/open-pdf/import`, discovered.candidate),
      env,
      identity,
      fetchExternal,
    );

    expect(imported.status).toBe(201);
    expect(fixture.library.attachPdf).toHaveBeenCalledWith(
      reference.id,
      expect.objectContaining({ referenceId: reference.id, rights: "unknown", fingerprint: expect.stringMatching(/^sha256:/u) }),
    );
    expect(bucket.size).toBe(1);
    expect(fixture.library.reserveArtifactAnalysisQueuePublication).toHaveBeenCalledTimes(3);
    expect(fixture.sendArtifactAnalysis).toHaveBeenCalledTimes(3);
    await expect(imported.json()).resolves.toMatchObject({
      provenance: { provider: "openalex", license: "cc-by", version: "acceptedVersion" },
    });
  });

  it("rejects an open-PDF import when provider metadata changed after review", async () => {
    const fixture = apiFixture();
    fixture.library.getReferences.mockResolvedValue([{ ...reference, doi: "10.1000/open" }]);
    const response = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/open-pdf/import`, {
        provider: "openalex",
        fingerprint: `sha256:${"a".repeat(64)}`,
      }),
      { ...fixture.env, OPENALEX_API_KEY: "key" },
      identity,
      async () =>
        Response.json({
          id: "https://openalex.org/W1",
          best_oa_location: { is_oa: true, pdf_url: "https://repository.example/current.pdf" },
        }),
    );

    expect(response.status).toBe(409);
    expect(fixture.library.attachPdf).not.toHaveBeenCalled();
  });

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

  it("reports and commits explicit reference reconciliation", async () => {
    const fixture = apiFixture();
    const report = await handleReferenceLibraryApi(new Request("https://example.test/api/library/reconciliation"), fixture.env, identity);
    expect(report.status).toBe(200);
    await expect(report.json()).resolves.toEqual({ candidates: [], truncated: false });

    const input = {
      canonicalReferenceId: reference.id,
      duplicateReferenceId: "22222222-2222-4222-8222-222222222222",
      expectedCanonicalUpdatedAt: now,
      expectedDuplicateUpdatedAt: now,
    };
    const merged = await handleReferenceLibraryApi(jsonRequest("/api/library/reconciliation/merge", input), fixture.env, identity);
    expect(merged.status).toBe(200);
    expect(fixture.library.mergeReferences).toHaveBeenCalledWith(input, identity.email);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest("/api/library/reconciliation/merge", { ...input, duplicateReferenceId: reference.id }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(400);
  });

  it("validates and imports bounded BibTeX with the authenticated actor", async () => {
    const fixture = apiFixture();
    const invalid = await handleReferenceLibraryApi(jsonRequest("/api/library/import", { bibtex: "" }), fixture.env, identity);
    expect(invalid.status).toBe(400);
    const malformed = await handleReferenceLibraryApi(
      jsonRequest("/api/library/import", { bibtex: "not bibtex at all" }),
      fixture.env,
      identity,
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "No valid BibTeX entries found" });
    expect(fixture.library.importBibTeX).not.toHaveBeenCalled();
    const imported = await handleReferenceLibraryApi(
      jsonRequest("/api/library/import", { bibtex: "@manual{guide,title={Private Guide}}" }),
      fixture.env,
      identity,
    );
    expect(imported.status).toBe(201);
    expect(fixture.library.importBibTeX).toHaveBeenCalledWith("@manual{guide,title={Private Guide}}", identity.email);
  });

  it("discovers only provider-backed references for a bounded query", async () => {
    const fixture = apiFixture();
    const fetchExternal = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      expect(new URL(input instanceof Request ? input.url : input.toString()).searchParams.get("query.bibliographic")).toBe(
        "visible evidence review time",
      );
      return crossrefSearchResponse();
    });
    const response = await handleReferenceLibraryApi(
      jsonRequest("/api/library/discovery", { query: "visible evidence review time" }),
      fixture.env,
      identity,
      fetchExternal,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        providers: [{ provider: "crossref", score: 42 }],
        identifiers: [{ scheme: "doi", value: "10.5555/discovery" }],
        metadata: expect.objectContaining({ title: "Verified discovery", doi: "10.5555/discovery" }),
      }),
    ]);
    expect((await handleReferenceLibraryApi(jsonRequest("/api/library/discovery", { query: "" }), fixture.env, identity)).status).toBe(400);
  });

  it("passes manual author and year facets to providers and filters result type", async () => {
    const fixture = apiFixture();
    const fetchExternal = vi.fn(async (input: string | URL | Request) => {
      expect(new URL(String(input)).searchParams.get("query.bibliographic")).toBe("evidence synthesis Doe 2026");
      return crossrefSearchResponse();
    });
    const response = await handleReferenceLibraryApi(
      jsonRequest("/api/library/discovery", { query: "evidence synthesis", author: "Doe", year: "2026", type: "article" }),
      fixture.env,
      identity,
      fetchExternal,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toHaveLength(1);
    const excluded = await handleReferenceLibraryApi(
      jsonRequest("/api/library/discovery", { query: "evidence synthesis", author: "Doe", year: "2026", type: "book" }),
      fixture.env,
      identity,
      fetchExternal,
    );
    await expect(excluded.json()).resolves.toEqual([]);
  });

  it("keeps discovery usable through OpenAlex and public Semantic Scholar when Crossref fails", async () => {
    const fixture = apiFixture();
    const env = { ...fixture.env, OPENALEX_API_KEY: "openalex-key" };
    const fetchExternal = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "api.openalex.org") return Response.json({ results: [openAlexWork()] });
      if (url.hostname === "api.crossref.org") return new Response(null, { status: 503 });
      if (url.hostname === "api.semanticscholar.org") return Response.json({ data: [semanticScholarPaper()] });
      throw new Error(`Unexpected metadata provider: ${url.hostname}`);
    });

    const response = await handleReferenceLibraryApi(
      jsonRequest("/api/library/discovery", { query: "resilient scholarly discovery" }),
      env,
      identity,
      fetchExternal,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        providers: [expect.objectContaining({ provider: "openalex" })],
        metadata: expect.objectContaining({ doi: "10.5555/openalex" }),
      }),
      expect.objectContaining({
        providers: [expect.objectContaining({ provider: "semantic-scholar" })],
        metadata: expect.objectContaining({ doi: "10.5555/semantic" }),
      }),
    ]);
    expect(fetchExternal.mock.calls.map(([input]) => new URL(String(input)).hostname)).toEqual([
      "api.openalex.org",
      "api.crossref.org",
      "api.semanticscholar.org",
    ]);
    expect(fetchExternal.mock.calls[2]?.[1]).toMatchObject({
      headers: expect.not.objectContaining({ "x-api-key": expect.anything() }),
    });
  });

  it("merges discovery records that share a scholarly identifier", async () => {
    const fixture = apiFixture();
    const env = { ...fixture.env, OPENALEX_API_KEY: "openalex-key" };
    const fetchExternal = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "api.openalex.org") {
        return Response.json({
          results: [openAlexWork({ id: "https://openalex.org/W123", doi: "https://doi.org/10.5555/shared" })],
        });
      }
      if (url.hostname === "api.crossref.org") {
        return Response.json({ message: { items: [{ DOI: "10.5555/shared", title: ["Crossref shared"], score: 70 }] } });
      }
      return Response.json({ data: [] });
    });

    const response = await handleReferenceLibraryApi(
      jsonRequest("/api/library/discovery", { query: "shared scholarly identity" }),
      env,
      identity,
      fetchExternal,
    );
    const results = (await response.json()) as Array<{ providers: Array<{ provider: string }>; identifiers: unknown[] }>;
    expect(results).toHaveLength(1);
    expect(results[0]?.providers.map(({ provider }) => provider)).toEqual(["openalex", "crossref"]);
    expect(results[0]?.identifiers).toEqual([
      { scheme: "doi", value: "10.5555/shared" },
      { scheme: "openalex", value: "W123" },
    ]);
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

  it("rejects private web destinations and keeps failed URL-only captures refinable", async () => {
    const fixture = apiFixture();
    const override = await handleReferenceLibraryApi(
      jsonRequest("/api/library/web-sources", { url: "https://example.com/article", title: "Intake override" }),
      fixture.env,
      identity,
    );
    expect(override.status).toBe(400);
    const invalid = await handleReferenceLibraryApi(
      jsonRequest("/api/library/web-sources", { url: "http://127.0.0.1/private" }),
      fixture.env,
      identity,
    );
    expect(invalid.status).toBe(400);

    const fetchWeb = vi.fn(async (): Promise<never> => {
      throw new Error("offline");
    });
    const captured = await handleReferenceLibraryApi(
      jsonRequest("/api/library/web-sources", { url: "https://example.com/article#section" }),
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
        snapshot: expect.objectContaining({
          complete: false,
          status: 0,
          title: "https://example.com/article",
          authors: [],
          diagnostics: expect.arrayContaining(["Page title unavailable; using its URL until metadata is refined."]),
        }),
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
      jsonRequest("/api/library/web-sources", { url: "https://example.com/start" }),
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
            rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
          }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/highlight-imports`, {
            artifactId: "artifact",
            candidates: [
              {
                page: 3,
                quote: "Imported evidence",
                comment: "Recovered from PDF",
                rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
              },
            ],
          }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(201);
    expect(fixture.library.importHighlights).toHaveBeenCalledWith(id, "artifact", [
      {
        page: 3,
        quote: "Imported evidence",
        comment: "Recovered from PDF",
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
      },
    ]);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/highlight-imports`, { artifactId: "artifact", candidates: [] }),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(400);
    const drawingPoints = [
      { x: 0.1, y: 0.2 },
      { x: 0.6, y: 0.25 },
    ];
    const drawingMutationId = "55555555-5555-4555-8555-555555555555";
    const createdDrawing = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${id}/pdf-markups`, {
        kind: "drawing",
        mutationId: drawingMutationId,
        artifactId: "artifact",
        page: 2,
        color: "#116655",
        width: 7,
        points: drawingPoints,
      }),
      fixture.env,
      identity,
    );
    expect(createdDrawing.status).toBe(201);
    await expect(createdDrawing.json()).resolves.toMatchObject({
      artifactId: "artifact",
      color: "#116655",
      id: drawingMutationId,
      kind: "drawing",
      page: 2,
      points: drawingPoints,
      referenceId: id,
      width: 7,
    });
    expect(fixture.library.createPdfDrawing).toHaveBeenCalledWith(id, "artifact", 2, "#116655", 7, drawingPoints, drawingMutationId);
    const highlightId = "44444444-4444-4444-8444-444444444444";
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/highlights/${highlightId}`, { comment: "Revised private note" }, "PATCH"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    const markupId = "33333333-3333-4333-8333-333333333333";
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/pdf-markups/${markupId}`, { x: 0.4, y: 0.6, body: "Revised page note" }, "PATCH"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handleReferenceLibraryApi(
          jsonRequest(`/api/library/references/${id}/pdf-markups/${markupId}`, { color: "#116655", width: 7 }, "PATCH"),
          fixture.env,
          identity,
        )
      ).status,
    ).toBe(200);
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
    expect(fixture.library.createHighlight).toHaveBeenCalledWith(id, "artifact", 2, "Evidence", "Private", [
      { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
    ]);
    expect(fixture.library.updateHighlightComment).toHaveBeenCalledWith(id, highlightId, "Revised private note");
    expect(fixture.library.updatePdfNote).toHaveBeenCalledWith(id, markupId, 0.4, 0.6, "Revised page note");
    expect(fixture.library.updatePdfDrawing).toHaveBeenCalledWith(id, markupId, "#116655", 7);
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

  it("rejects malformed private-PDF and reading-state mutations at the schema boundary", async () => {
    const fixture = apiFixture();
    const id = reference.id;
    const markupId = "33333333-3333-4333-8333-333333333333";
    const highlightId = "44444444-4444-4444-8444-444444444444";
    for (const [path, body, method] of [
      [`${id}/highlights`, { artifactId: "artifact", page: "2", quote: "Evidence", comment: "", rects: [] }, "POST"],
      [
        `${id}/highlight-imports`,
        { artifactId: "artifact", candidates: [{ page: "3", quote: "Evidence", comment: "", rects: [] }] },
        "POST",
      ],
      [`${id}/pdf-markups`, { kind: "note", artifactId: "artifact", page: 2, x: "0.2", y: 0.3, body: "Note" }, "POST"],
      [
        `${id}/pdf-markups`,
        { kind: "drawing", artifactId: "artifact", page: 2, color: "#000", width: 2, points: [{ x: "0.2", y: 0.3 }] },
        "POST",
      ],
      [
        `${id}/pdf-markups`,
        {
          kind: "drawing",
          mutationId: "not-a-uuid",
          artifactId: "artifact",
          page: 2,
          color: "#116655",
          width: 2,
          points: [
            { x: 0.2, y: 0.3 },
            { x: 0.4, y: 0.5 },
          ],
        },
        "POST",
      ],
      [`${id}/pdf-markups/${markupId}`, { x: "0.2", y: 0.3 }, "PATCH"],
      [`${id}/pdf-markups/${markupId}`, { color: "#000", width: "2" }, "PATCH"],
      [`${id}/highlights/${highlightId}`, { comment: 4 }, "PATCH"],
      [`${id}/reading`, { status: "started", rating: null, priority: "normal" }, "PUT"],
      [id, { type: "article", title: "x".repeat(2_001), authors: [], year: "", venue: "", doi: "", url: "", abstract: "" }, "PATCH"],
    ] as const) {
      const response = await handleReferenceLibraryApi(jsonRequest(`/api/library/references/${path}`, body, method), fixture.env, identity);
      expect(response.status).toBe(400);
    }
  });

  it("treats repeated and arbitrary absent private-PDF markup deletes as converged", async () => {
    const fixture = apiFixture();
    const markupId = "33333333-3333-4333-8333-333333333333";
    const deleteMarkup = () =>
      handleReferenceLibraryApi(
        new Request(`https://example.test/api/library/references/${reference.id}/pdf-markups/${markupId}`, { method: "DELETE" }),
        fixture.env,
        identity,
      );

    const deleted = await deleteMarkup();
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toMatchObject({ id: markupId, referenceId: reference.id });
    const retried = await deleteMarkup();
    expect(retried.status).toBe(200);
    await expect(retried.json()).resolves.toBeNull();

    const absentId = "77777777-7777-4777-8777-777777777777";
    const absent = await handleReferenceLibraryApi(
      new Request(`https://example.test/api/library/references/${reference.id}/pdf-markups/${absentId}`, { method: "DELETE" }),
      fixture.env,
      identity,
    );
    expect(absent.status).toBe(200);
    await expect(absent.json()).resolves.toBeNull();
    expect(fixture.library.deletePdfMarkup).toHaveBeenNthCalledWith(1, reference.id, markupId);
    expect(fixture.library.deletePdfMarkup).toHaveBeenNthCalledWith(2, reference.id, markupId);
    expect(fixture.library.deletePdfMarkup).toHaveBeenNthCalledWith(3, reference.id, absentId);
  });

  it("maps a conflicting PDF drawing mutation to HTTP conflict", async () => {
    const fixture = apiFixture();
    fixture.library.createPdfDrawing.mockRejectedValueOnce(new Error("Private PDF drawing mutation conflict"));
    const response = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/pdf-markups`, {
        kind: "drawing",
        mutationId: "55555555-5555-4555-8555-555555555555",
        artifactId: "artifact",
        page: 2,
        color: "#116655",
        width: 7,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.6, y: 0.25 },
        ],
      }),
      fixture.env,
      identity,
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Private PDF drawing mutation conflict" });
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

  it("propagates a refined generated key to matching project aliases", async () => {
    const fixture = apiFixture();
    fixture.library.updateReferenceMetadata.mockResolvedValueOnce({ ...reference, referenceKey: "doe2026", updatedAt: now });
    const response = await handleReferenceLibraryApi(
      jsonRequest(
        `/api/library/references/${reference.id}`,
        {
          type: "article",
          title: "Edited",
          authors: ["Doe, Jane"],
          year: "2026",
          venue: "Journal",
          doi: "",
          url: "",
          abstract: "",
        },
        "PATCH",
      ),
      fixture.env,
      identity,
    );

    expect(response.status).toBe(200);
    expect(fixture.getDocumentRoomByName).toHaveBeenCalledWith("project");
    expect(fixture.refineGeneratedProjectReferenceAlias).toHaveBeenCalledWith("project", reference.id, "guide", "doe2026");
  });

  it("streams only an owner-library PDF inline without cacheable access", async () => {
    const bucket = new MemoryR2Bucket();
    await bucket.put("libraries/owner/guide.pdf", new Uint8Array([37, 80, 68, 70]), {
      httpMetadata: { contentType: "application/pdf" },
    });
    const fixture = apiFixture(bucket);
    fixture.library.getSnapshot.mockResolvedValue({
      ...snapshot,
      artifacts: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          referenceId: reference.id,
          name: "guide.pdf",
          contentType: "application/pdf",
          size: 4,
          objectKey: "libraries/owner/guide.pdf",
          fingerprint: "r2-etag:guide",
          rights: "private",
          createdAt: now,
        },
      ],
    });
    const response = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library/pdfs/22222222-2222-4222-8222-222222222222"),
      fixture.env,
      identity,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("4");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));

    const foreign = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library/pdfs/99999999-9999-4999-8999-999999999999"),
      fixture.env,
      identity,
    );
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: "PDF artifact not found" });
  });

  it("downloads an owner-only derived PDF with private annotations", async () => {
    const source = await PDFDocument.create({ updateMetadata: false });
    source.addPage([600, 800]);
    const sourceBytes = await source.save({ useObjectStreams: false });
    const bucket = new MemoryR2Bucket();
    await bucket.put("libraries/owner/guide.pdf", sourceBytes, { httpMetadata: { contentType: "application/pdf" } });
    const fixture = apiFixture(bucket);
    fixture.library.getSnapshot.mockResolvedValue({
      ...snapshot,
      artifacts: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          referenceId: reference.id,
          name: 'guide\r\n".pdf',
          contentType: "application/pdf",
          size: sourceBytes.byteLength,
          objectKey: "libraries/owner/guide.pdf",
          fingerprint: "r2-etag:guide",
          rights: "private",
          createdAt: now,
        },
      ],
      pdfMarkups: [
        {
          id: "pdf-note",
          kind: "note",
          referenceId: reference.id,
          artifactId: "22222222-2222-4222-8222-222222222222",
          page: 1,
          x: 0.5,
          y: 0.5,
          body: "Private note",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const response = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library/pdfs/22222222-2222-4222-8222-222222222222/annotated"),
      fixture.env,
      identity,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="guide-annotated.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const exported = await PDFDocument.load(await response.arrayBuffer(), { updateMetadata: false });
    expect(exported.getPage(0).node.Annots()?.size()).toBe(2);
  });

  it("returns an existing PDF draft and deletes the redundant R2 object", async () => {
    vi.stubGlobal("FixedLengthStream", TestFixedLengthStream);
    const bucket = new MemoryR2Bucket();
    const fixture = apiFixture(bucket);
    fixture.library.createPdfDraft.mockResolvedValueOnce({
      reference,
      artifact: {
        id: "22222222-2222-4222-8222-222222222222",
        referenceId: reference.id,
        name: "guide.pdf",
        contentType: "application/pdf",
        size: 100,
        objectKey: "libraries/owner/guide.pdf",
        fingerprint: "r2-etag:guide",
        rights: "private",
        createdAt: now,
      },
      created: false,
    });
    const response = await handleReferenceLibraryApi(pdfUploadRequest("repeat.pdf"), fixture.env, identity);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ created: false, reference: { referenceKey: "guide" } });
    expect(bucket.size).toBe(0);
    expect(fixture.library.createPdfDraft).toHaveBeenCalledWith(
      expect.objectContaining({ name: "repeat.pdf", fingerprint: "r2-etag:test-etag" }),
      identity.email,
    );
  });

  it("keeps the canonical R2 object for a newly created PDF draft", async () => {
    vi.stubGlobal("FixedLengthStream", TestFixedLengthStream);
    const bucket = new MemoryR2Bucket();
    const fixture = apiFixture(bucket);
    const response = await handleReferenceLibraryApi(pdfUploadRequest("new.pdf"), fixture.env, identity);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ created: true });
    expect(bucket.size).toBe(1);
    expect(fixture.sendArtifactAnalysis).toHaveBeenCalledTimes(3);
    expect(fixture.sendArtifactAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        ownerKey: identity.ownerKey,
        artifactId: "22222222-2222-4222-8222-222222222222",
        kind: "pdf-highlights",
        fingerprint: "r2-etag:guide",
      }),
      { contentType: "json" },
    );
    expect(fixture.sendArtifactAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        ownerKey: identity.ownerKey,
        artifactId: "22222222-2222-4222-8222-222222222222",
        kind: "pdf-references",
        fingerprint: "r2-etag:guide",
      }),
      { contentType: "json" },
    );
  });

  it("returns automatic PDF analysis status and explicitly requeues failures", async () => {
    const fixture = apiFixture();
    const route = "/api/library/pdfs/22222222-2222-4222-8222-222222222222/analyses/pdf-highlights";
    const status = await handleReferenceLibraryApi(new Request(`https://example.test${route}`), fixture.env, identity);
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({ kind: "pdf-highlights", status: "queued" });

    const retry = await handleReferenceLibraryApi(new Request(`https://example.test${route}`, { method: "POST" }), fixture.env, identity);
    expect(retry.status).toBe(202);
    expect(fixture.library.reserveArtifactAnalysisQueuePublication).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      "pdf-highlights",
      expect.any(String),
      true,
    );
    expect(fixture.sendArtifactAnalysis).toHaveBeenCalledOnce();

    const referencesRoute = "/api/library/pdfs/22222222-2222-4222-8222-222222222222/analyses/pdf-references";
    const references = await handleReferenceLibraryApi(new Request(`https://example.test${referencesRoute}`), fixture.env, identity);
    expect(references.status).toBe(200);
    await expect(references.json()).resolves.toMatchObject({ kind: "pdf-references", status: "queued" });

    const textRoute = "/api/library/pdfs/22222222-2222-4222-8222-222222222222/analyses/pdf-text";
    const text = await handleReferenceLibraryApi(new Request(`https://example.test${textRoute}`), fixture.env, identity);
    expect(text.status).toBe(200);
    await expect(text.json()).resolves.toMatchObject({ kind: "pdf-text", status: "queued" });
  });

  it("queues missing analysis state when an existing PDF is opened", async () => {
    const fixture = apiFixture();
    fixture.library.getArtifactAnalysis.mockResolvedValueOnce(null);
    const route = "/api/library/pdfs/22222222-2222-4222-8222-222222222222/analyses/pdf-references";
    const response = await handleReferenceLibraryApi(new Request(`https://example.test${route}`), fixture.env, identity);

    expect(response.status).toBe(202);
    expect(fixture.library.reserveArtifactAnalysisQueuePublication).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      "pdf-references",
      expect.any(String),
      false,
    );
    expect(fixture.sendArtifactAnalysis).toHaveBeenCalledOnce();
  });

  it("reports and queues bounded reference-analysis backfill progress", async () => {
    const fixture = apiFixture();
    const artifact = (await fixture.library.createPdfDraft()).artifact;
    fixture.library.getSnapshot.mockResolvedValue({ ...snapshot, artifacts: [artifact] });
    fixture.library.getArtifactAnalysis.mockResolvedValueOnce(null);
    const route = "/api/library/analyses/pdf-references/backfill";

    const queued = await handleReferenceLibraryApi(new Request(`https://example.test${route}`, { method: "POST" }), fixture.env, identity);

    expect(queued.status).toBe(200);
    await expect(queued.json()).resolves.toEqual({
      failed: 0,
      missing: 0,
      queued: 1,
      queuedNow: 1,
      ready: 0,
      running: 0,
      total: 1,
      truncated: false,
    });
    expect(fixture.library.reserveArtifactAnalysisQueuePublication).toHaveBeenCalledWith(
      artifact.id,
      "pdf-references",
      expect.any(String),
      false,
    );
    expect(fixture.sendArtifactAnalysis).toHaveBeenCalledOnce();

    fixture.library.getArtifactAnalysis.mockResolvedValueOnce({
      artifactId: artifact.id,
      fingerprint: artifact.fingerprint,
      kind: "pdf-references",
      status: "ready",
      result: { candidates: [], pagesScanned: 1, pagesTotal: 1, referencesStartPage: null, truncated: false },
      error: "",
      requestedAt: now,
      startedAt: now,
      completedAt: now,
    });
    const progress = await handleReferenceLibraryApi(new Request(`https://example.test${route}`), fixture.env, identity);
    await expect(progress.json()).resolves.toMatchObject({ ready: 1, total: 1, queuedNow: 0 });
  });

  it("serves and records server-validated PDF reference reviews", async () => {
    const fixture = apiFixture();
    const route = "/api/library/pdfs/22222222-2222-4222-8222-222222222222/reference-review";
    const queue = await handleReferenceLibraryApi(new Request(`https://example.test${route}`), fixture.env, identity);
    expect(queue.status).toBe(200);
    await expect(queue.json()).resolves.toMatchObject({
      artifactId: "22222222-2222-4222-8222-222222222222",
      fingerprint: "r2-etag:guide",
    });

    const accepted = await handleReferenceLibraryApi(
      jsonRequest(route, {
        fingerprint: "r2-etag:guide",
        candidateId: "doi:10.1000/target",
        decision: "accepted",
        referenceId: reference.id,
      }),
      fixture.env,
      identity,
    );
    expect(accepted.status).toBe(201);
    expect(fixture.library.reviewPdfReferenceCandidate).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      "r2-etag:guide",
      "doi:10.1000/target",
      "accepted",
      reference.id,
      identity.email,
    );

    const batch = await handleReferenceLibraryApi(
      jsonRequest(route, {
        fingerprint: "r2-etag:guide",
        candidates: [{ candidateId: "doi:10.1000/target", referenceId: reference.id }, { candidateId: "entry:second" }],
      }),
      fixture.env,
      identity,
    );
    expect(batch.status).toBe(201);
    expect(fixture.library.reviewPdfReferenceCandidates).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      "r2-etag:guide",
      [{ candidateId: "doi:10.1000/target", referenceId: reference.id }, { candidateId: "entry:second" }],
      identity.email,
    );

    const invalid = await handleReferenceLibraryApi(
      jsonRequest(route, {
        fingerprint: "r2-etag:guide",
        candidateId: "doi:10.1000/target",
        decision: "rejected",
        referenceId: reference.id,
      }),
      fixture.env,
      identity,
    );
    expect(invalid.status).toBe(400);
    expect(fixture.library.reviewPdfReferenceCandidate).toHaveBeenCalledOnce();

    fixture.library.getPdfReferenceReviewQueue.mockResolvedValueOnce(null);
    const transitioning = await handleReferenceLibraryApi(new Request(`https://example.test${route}`), fixture.env, identity);
    expect(transitioning.status).toBe(409);
    await expect(transitioning.json()).resolves.toEqual({ error: "PDF reference analysis is not ready" });
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

  it("previews bounded Crossref title matches and refetches the selected candidate before applying fields", async () => {
    const fixture = apiFixture();
    const fetchExternal = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return url.searchParams.has("query.bibliographic")
        ? Response.json({
            message: {
              items: [
                {
                  type: "journal-article",
                  title: ["Matched paper"],
                  author: [{ family: "Doe", given: "Jane" }],
                  issued: { "date-parts": [[2026]] },
                  "container-title": ["Open Research"],
                  DOI: "10.5555/match",
                  URL: "https://doi.org/10.5555/match",
                  abstract: "<jats:p>Crossref abstract</jats:p>",
                  score: 88,
                },
              ],
            },
          })
        : crossrefResponse("10.5555/match", "Matched paper");
    });
    const route = `/api/library/references/${reference.id}/metadata-refinement`;
    const previewResponse = await handleReferenceLibraryApi(
      jsonRequest(`${route}/preview`, {
        artifactId: "22222222-2222-4222-8222-222222222222",
        candidates: { title: "Matched paper", authors: ["Doe, Jane"], year: "2026" },
      }),
      fixture.env,
      identity,
      fetchExternal,
    );
    expect(previewResponse.status).toBe(200);
    const preview = (await previewResponse.json()) as {
      candidates: Array<{ provider: string; match: string; score: number; metadataFingerprint: string }>;
    };
    expect(preview.candidates).toEqual([
      expect.objectContaining({
        provider: "crossref",
        match: "bibliographic",
        score: 88,
        metadataFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    ]);
    expect(fixture.library.getPdfMetadataContext).toHaveBeenCalledWith(reference.id, "22222222-2222-4222-8222-222222222222");
    expect(fixture.library.applyReviewedProviderMetadata).not.toHaveBeenCalled();

    const accepted = await handleReferenceLibraryApi(
      jsonRequest(`${route}/accept`, {
        provider: "crossref",
        doi: "10.5555/match",
        metadataFingerprint: preview.candidates[0]!.metadataFingerprint,
        fields: ["title", "authors", "doi"],
      }),
      fixture.env,
      identity,
      fetchExternal,
    );
    expect(accepted.status).toBe(200);
    expect(fixture.library.applyReviewedProviderMetadata).toHaveBeenCalledWith(
      reference.id,
      expect.objectContaining({ title: "Matched paper", doi: "10.5555/match" }),
      ["title", "authors", "doi"],
      "crossref",
      identity.email,
    );
    expect(fetchExternal).toHaveBeenCalledTimes(2);
  });

  it("falls back to DataCite for a DOI and rejects stale provider acceptance", async () => {
    const fixture = apiFixture();
    const previewFetch = vi
      .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(dataCiteResponse());
    const route = `/api/library/references/${reference.id}/metadata-refinement`;
    const previewResponse = await handleReferenceLibraryApi(
      jsonRequest(`${route}/preview`, {
        artifactId: "22222222-2222-4222-8222-222222222222",
        candidates: { doi: "10.5438/data" },
      }),
      fixture.env,
      identity,
      previewFetch,
    );
    expect(previewResponse.status).toBe(200);
    await expect(previewResponse.json()).resolves.toMatchObject({
      candidates: [
        {
          provider: "datacite",
          match: "doi",
          metadata: { title: "DataCite record", doi: "10.5438/data" },
        },
      ],
    });
    expect(previewFetch).toHaveBeenCalledTimes(2);

    const stale = await handleReferenceLibraryApi(
      jsonRequest(`${route}/accept`, {
        provider: "datacite",
        doi: "10.5438/data",
        metadataFingerprint: "a".repeat(64),
        fields: ["title"],
      }),
      fixture.env,
      identity,
      async () => dataCiteResponse(),
    );
    expect(stale.status).toBe(409);
    expect(fixture.library.applyReviewedProviderMetadata).not.toHaveBeenCalled();
  });

  it("tries configured OpenAlex first and refetches an accepted OpenAlex candidate", async () => {
    const fixture = apiFixture();
    const env = { ...fixture.env, OPENALEX_API_KEY: "openalex-key" };
    const fetchExternal = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => openAlexResponse());
    const route = `/api/library/references/${reference.id}/metadata-refinement`;
    const previewResponse = await handleReferenceLibraryApi(
      jsonRequest(`${route}/preview`, {
        artifactId: "22222222-2222-4222-8222-222222222222",
        candidates: { doi: "10.5555/openalex" },
      }),
      env,
      identity,
      fetchExternal,
    );
    const preview = (await previewResponse.json()) as { candidates: Array<{ provider: string; metadataFingerprint: string }> };
    expect(previewResponse.status).toBe(200);
    expect(preview.candidates).toEqual([
      expect.objectContaining({ provider: "openalex", metadataFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u) }),
    ]);
    expect(String(fetchExternal.mock.calls[0]?.[0])).toContain("api.openalex.org/works/doi:");

    const accepted = await handleReferenceLibraryApi(
      jsonRequest(`${route}/accept`, {
        provider: "openalex",
        doi: "10.5555/openalex",
        metadataFingerprint: preview.candidates[0]!.metadataFingerprint,
        fields: ["title", "authors"],
      }),
      env,
      identity,
      fetchExternal,
    );
    expect(accepted.status).toBe(200);
    expect(fixture.library.applyReviewedProviderMetadata).toHaveBeenCalledWith(
      reference.id,
      expect.objectContaining({ title: "OpenAlex record", doi: "10.5555/openalex" }),
      ["title", "authors"],
      "openalex",
      identity.email,
    );
  });

  it("combines configured discovery providers while retaining provider variants for one DOI", async () => {
    const fixture = apiFixture();
    const env = { ...fixture.env, OPENALEX_API_KEY: "openalex-key", SEMANTIC_SCHOLAR_API_KEY: "semantic-key" };
    const fetchExternal = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "api.openalex.org") {
        return Response.json({
          results: [openAlexWork(), openAlexWork({ doi: "https://doi.org/10.5555/shared", title: "OpenAlex shared" })],
        });
      }
      if (url.hostname === "api.crossref.org") {
        return Response.json({
          message: {
            items: [
              { DOI: "10.5555/shared", title: ["Crossref duplicate"] },
              { DOI: "10.5555/crossref", title: ["Crossref record"] },
            ],
          },
        });
      }
      return Response.json({ data: [semanticScholarPaper()] });
    });
    const response = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/metadata-refinement/preview`, {
        artifactId: "22222222-2222-4222-8222-222222222222",
        candidates: { title: "Evidence", authors: ["Doe, Jane"], year: "2026" },
      }),
      env,
      identity,
      fetchExternal,
    );
    const body = (await response.json()) as { candidates: Array<{ provider: string; metadata: { doi: string } }> };
    expect(response.status).toBe(200);
    expect(body.candidates.map((candidate) => [candidate.provider, candidate.metadata.doi])).toEqual([
      ["openalex", "10.5555/openalex"],
      ["openalex", "10.5555/shared"],
      ["crossref", "10.5555/shared"],
      ["crossref", "10.5555/crossref"],
      ["semantic-scholar", "10.5555/semantic"],
    ]);
    expect(fetchExternal).toHaveBeenCalledTimes(3);

    const cachedResponse = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/metadata-refinement/preview`, {
        artifactId: "22222222-2222-4222-8222-222222222222",
        candidates: { title: "Evidence", authors: ["Doe, Jane"], year: "2026" },
      }),
      env,
      identity,
      fetchExternal,
    );
    expect(cachedResponse.headers.get("x-kirjolab-metadata-cache")).toBe("hit");
    expect(fetchExternal).toHaveBeenCalledTimes(3);
    expect(fixture.library.cacheMetadataRefinementPreview).toHaveBeenCalledTimes(1);
  });

  it("refetches and atomically applies fields selected from several providers", async () => {
    const fixture = apiFixture();
    const env = { ...fixture.env, OPENALEX_API_KEY: "openalex-key" };
    const fetchExternal = vi.fn(async (input: string | URL | Request) => {
      const hostname = new URL(String(input)).hostname;
      if (hostname === "api.openalex.org") return openAlexResponse("10.5555/shared", "OpenAlex title");
      if (hostname === "api.crossref.org") return crossrefResponse("10.5555/shared", "Crossref title");
      return dataCiteResponse("10.5555/shared", "DataCite title");
    });
    const route = `/api/library/references/${reference.id}/metadata-refinement`;
    const previewResponse = await handleReferenceLibraryApi(
      jsonRequest(`${route}/preview`, {
        artifactId: "22222222-2222-4222-8222-222222222222",
        candidates: { doi: "10.5555/shared" },
      }),
      env,
      identity,
      fetchExternal,
    );
    const preview = (await previewResponse.json()) as {
      candidates: Array<{ provider: "openalex" | "crossref" | "datacite"; metadataFingerprint: string }>;
    };
    expect(preview.candidates.map(({ provider }) => provider)).toEqual(["openalex", "crossref", "datacite"]);

    fetchExternal.mockClear();
    const accepted = await handleReferenceLibraryApi(
      jsonRequest(`${route}/accept`, {
        selections: [
          { ...preview.candidates[0], doi: "10.5555/shared", fields: ["title", "abstract"] },
          { ...preview.candidates[1], doi: "10.5555/shared", fields: ["authors", "venue", "doi"] },
        ],
      }),
      env,
      identity,
      fetchExternal,
    );

    expect(accepted.status).toBe(200);
    expect(fixture.library.applyReviewedProviderMetadataBatch).toHaveBeenCalledWith(
      reference.id,
      [
        expect.objectContaining({ provider: "openalex", fields: ["title", "abstract"] }),
        expect.objectContaining({ provider: "crossref", fields: ["authors", "venue", "doi"] }),
      ],
      identity.email,
    );
    expect(fetchExternal).toHaveBeenCalledTimes(2);
  });

  it("rejects mixed-work, duplicate-source, and overlapping-field provider batches before refetch", async () => {
    const fixture = apiFixture();
    const route = `/api/library/references/${reference.id}/metadata-refinement/accept`;
    const base = {
      provider: "crossref",
      doi: "10.5555/shared",
      metadataFingerprint: "a".repeat(64),
      fields: ["title"],
    };
    const fetchExternal = vi.fn(async () => crossrefResponse("10.5555/shared"));
    for (const selections of [
      [base, { ...base, provider: "openalex", doi: "10.5555/other", fields: ["authors"] }],
      [base, { ...base, fields: ["authors"] }],
      [base, { ...base, provider: "openalex" }],
    ]) {
      const response = await handleReferenceLibraryApi(jsonRequest(route, { selections }), fixture.env, identity, fetchExternal);
      expect(response.status).toBe(400);
    }
    expect(fetchExternal).not.toHaveBeenCalled();
    expect(fixture.library.applyReviewedProviderMetadataBatch).not.toHaveBeenCalled();
  });

  it("uses Semantic Scholar after both DOI registries report no record", async () => {
    const fixture = apiFixture();
    const env = { ...fixture.env, SEMANTIC_SCHOLAR_API_KEY: "semantic-key" };
    const fetchExternal = vi
      .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json(semanticScholarPaper()))
      .mockResolvedValueOnce(Response.json(semanticScholarPaper()));
    const response = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/metadata-refinement/preview`, {
        artifactId: "22222222-2222-4222-8222-222222222222",
        candidates: { doi: "10.5555/semantic" },
      }),
      env,
      identity,
      fetchExternal,
    );
    expect(response.status).toBe(200);
    const preview = (await response.json()) as {
      candidates: Array<{ metadataFingerprint: string; metadata: { doi: string }; provider: string }>;
    };
    expect(preview).toMatchObject({
      candidates: [{ provider: "semantic-scholar", match: "doi", metadata: { doi: "10.5555/semantic" } }],
    });
    const accepted = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/metadata-refinement/accept`, {
        artifactId: "22222222-2222-4222-8222-222222222222",
        provider: "semantic-scholar",
        doi: "10.5555/semantic",
        metadataFingerprint: preview.candidates[0]?.metadataFingerprint,
        fields: ["title", "abstract"],
      }),
      env,
      identity,
      fetchExternal,
    );
    expect(accepted.status).toBe(200);
    expect(fixture.library.applyReviewedProviderMetadata).toHaveBeenCalledWith(
      reference.id,
      expect.objectContaining({ title: "Semantic Scholar record", doi: "10.5555/semantic" }),
      ["title", "abstract"],
      "semantic-scholar",
      identity.email,
    );
    expect(fetchExternal).toHaveBeenCalledTimes(4);
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
    const fetchExternal = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return url.includes("10.1000%2Funmatched")
        ? crossrefResponse("10.1000/unmatched", "Unmatched candidate")
        : Response.json({
            message: { reference: [{ DOI: "10.1000/target", "article-title": "Target" }, { DOI: "10.1000/unmatched" }] },
          });
    });
    const expanded = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/citation-expansions`, {}),
      fixture.env,
      identity,
      fetchExternal,
    );
    expect(expanded.status).toBe(201);
    const expansionBody = await expanded.json();
    expect(expansionBody).toMatchObject({
      provider: "crossref",
      direction: "references",
      seedReferenceId: reference.id,
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

    fixture.library.getReferences.mockResolvedValueOnce([source]);
    const accepted = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/citation-candidates`, {
        doi: "10.1000/unmatched",
        responseId: (expansionBody as { responseId: string }).responseId,
        direction: "references",
      }),
      fixture.env,
      identity,
      fetchExternal,
    );
    expect(accepted.status).toBe(201);
    await expect(accepted.json()).resolves.toMatchObject({
      created: true,
      reference: { doi: "10.1000/unmatched", title: "Unmatched candidate" },
      assertion: { citedReferenceId: citationAssertion.citedReferenceId },
    });
    expect(fixture.library.acceptCitationCandidate).toHaveBeenCalledWith(
      source.id,
      expect.objectContaining({ doi: "10.1000/unmatched", title: "Unmatched candidate" }),
      expect.objectContaining({ responseId: (expansionBody as { responseId: string }).responseId }),
      identity.email,
    );
    expect(fetchExternal).toHaveBeenCalledTimes(3);

    fixture.library.getReferences.mockResolvedValueOnce([source]);
    const unavailable = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/citation-expansions`, {}),
      fixture.env,
      identity,
      vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "0" } })),
    );
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ error: "Crossref is temporarily unavailable; try again shortly" });

    fixture.library.getReferences.mockResolvedValueOnce([source]);
    const stale = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/citation-candidates`, {
        doi: "10.1000/unmatched",
        responseId: `sha256:${"f".repeat(64)}`,
        direction: "references",
      }),
      fixture.env,
      identity,
      fetchExternal,
    );
    expect(stale.status).toBe(409);
    expect(fixture.library.acceptCitationCandidate).toHaveBeenCalledOnce();

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

  it("discovers and accepts forward citations through Semantic Scholar", async () => {
    const fixture = apiFixture();
    const source = { ...reference, doi: "10.1000/source" };
    const known = { ...reference, id: crypto.randomUUID(), title: "Known citing work", doi: "10.1000/known-citing" };
    fixture.library.getReferences.mockResolvedValueOnce([source]);
    fixture.library.findReferencesByDois.mockResolvedValueOnce([known]);
    const fetchExternal = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/citations")) {
        return Response.json({
          data: [
            { citingPaper: semanticScholarPaper({ title: "Known citing work", externalIds: { DOI: known.doi } }) },
            { citingPaper: semanticScholarPaper({ title: "New citing work", externalIds: { DOI: "10.1000/new-citing" } }) },
          ],
        });
      }
      return Response.json(semanticScholarPaper({ title: "New citing work", externalIds: { DOI: "10.1000/new-citing" } }));
    });

    const expanded = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/citation-expansions`, { direction: "citations" }),
      fixture.env,
      identity,
      fetchExternal,
    );
    expect(expanded.status).toBe(201);
    const body = (await expanded.json()) as { responseId: string };
    expect(body).toMatchObject({
      provider: "semantic-scholar",
      direction: "citations",
      assertions: [expect.objectContaining({ citingReferenceId: known.id, citedReferenceId: source.id })],
      unmatched: [expect.objectContaining({ doi: "10.1000/new-citing", title: "New citing work" })],
    });
    expect(fixture.library.createCitationAssertions).toHaveBeenCalledWith(
      [expect.objectContaining({ citingReferenceId: known.id, citedReferenceId: source.id })],
      "Semantic Scholar",
    );

    fixture.library.getReferences.mockResolvedValueOnce([source]);
    const accepted = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/citation-candidates`, {
        doi: "10.1000/new-citing",
        responseId: body.responseId,
        direction: "citations",
      }),
      fixture.env,
      identity,
      fetchExternal,
    );
    expect(accepted.status).toBe(201);
    expect(fixture.library.acceptCitationCandidate).toHaveBeenCalledWith(
      source.id,
      expect.objectContaining({ doi: "10.1000/new-citing", title: "New citing work" }),
      expect.objectContaining({ provider: "semantic-scholar", direction: "citations", responseId: body.responseId }),
      identity.email,
    );
  });

  it("accepts a fingerprinted citation candidate batch through one atomic library call", async () => {
    const fixture = apiFixture();
    const source = { ...reference, doi: "10.1000/source" };
    fixture.library.getReferences.mockResolvedValue([source]);
    const fetchExternal = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("10.1000%2Fsource")) {
        return Response.json({
          message: { reference: [{ DOI: "10.1000/one" }, { DOI: "10.1000/two" }] },
        });
      }
      const doi = url.includes("10.1000%2Fone") ? "10.1000/one" : "10.1000/two";
      return crossrefResponse(doi, doi.endsWith("one") ? "Candidate One" : "Candidate Two");
    });
    const expanded = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/citation-expansions`, {}),
      fixture.env,
      identity,
      fetchExternal,
    );
    const expansion = (await expanded.json()) as { responseId: string };

    const accepted = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/citation-candidates`, {
        dois: ["10.1000/one", "10.1000/two"],
        responseId: expansion.responseId,
        direction: "references",
      }),
      fixture.env,
      identity,
      fetchExternal,
    );

    expect(accepted.status).toBe(201);
    expect(fixture.library.acceptCitationCandidates).toHaveBeenCalledOnce();
    expect(fixture.library.acceptCitationCandidates).toHaveBeenCalledWith(
      source.id,
      [expect.objectContaining({ doi: "10.1000/one" }), expect.objectContaining({ doi: "10.1000/two" })],
      expect.objectContaining({ direction: "references", responseId: expansion.responseId }),
      identity.email,
    );
    await expect(accepted.json()).resolves.toMatchObject({ accepted: [{ created: true }, { created: false }] });
  });

  it("owns the bounded citation research queue", async () => {
    const fixture = apiFixture();
    const seedReferenceId = crypto.randomUUID();
    const queueItem = { referenceId: reference.id, seedReferenceId, direction: "references" as const, addedAt: now };
    fixture.library.getCitationResearchQueue.mockResolvedValueOnce([queueItem]);

    const listed = await handleReferenceLibraryApi(
      new Request("https://example.test/api/library/citation-research-queue"),
      fixture.env,
      identity,
    );
    await expect(listed.json()).resolves.toEqual([queueItem]);

    const queued = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/research-queue`, { seedReferenceId, direction: "references" }, "PUT"),
      fixture.env,
      identity,
    );
    expect(queued.status).toBe(201);
    expect(fixture.library.queueCitationReference).toHaveBeenCalledWith(reference.id, { seedReferenceId, direction: "references" });

    const removed = await handleReferenceLibraryApi(
      new Request(`https://example.test/api/library/references/${reference.id}/research-queue`, { method: "DELETE" }),
      fixture.env,
      identity,
    );
    expect(removed.status).toBe(200);
    expect(fixture.library.removeCitationResearchQueueItem).toHaveBeenCalledWith(reference.id);

    const invalid = await handleReferenceLibraryApi(
      jsonRequest(`/api/library/references/${reference.id}/research-queue`, { seedReferenceId, direction: "sideways" }, "PUT"),
      fixture.env,
      identity,
    );
    expect(invalid.status).toBe(400);
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
  const metadataPreviewCache = new Map<string, MetadataRefinementPreview>();
  const pdfMarkupIds = new Set(["33333333-3333-4333-8333-333333333333"]);
  const analysis = {
    artifactId: artifact.id,
    fingerprint: artifact.fingerprint,
    kind: "pdf-highlights" as const,
    status: "queued" as const,
    result: null,
    error: "",
    requestedAt: now,
    startedAt: null,
    completedAt: null,
  };
  const getArtifactAnalysis = vi.fn(async (_artifactId: string, kind: ArtifactAnalysisKind): Promise<ArtifactAnalysis | null> => ({
    ...analysis,
    kind,
  }));
  const library = {
    getSnapshot: vi.fn(async () => snapshot),
    importBibTeX: vi.fn(async () => [{ reference, suggestedAlias: "guide", created: true }]),
    registerPdf: vi.fn(async () => artifact),
    createPdfDraft: vi.fn(async () => ({ reference, artifact, created: true })),
    attachPdf: vi.fn(async () => ({ reference, artifact, created: true })),
    identifyPdf: vi.fn(async () => artifact),
    setArtifactRights: vi.fn(async () => ({ ...artifact, rights: "shareable" as const })),
    archiveReference: vi.fn(async () => ({ ...reference, archivedAt: now })),
    updateReferenceMetadata: vi.fn(async () => ({ ...reference, updatedAt: now })),
    applyReviewedPdfMetadata: vi.fn(async () => ({ ...reference, title: "Reviewed PDF", updatedAt: now })),
    applyReviewedCrossrefMetadata: vi.fn(async () => ({ ...reference, title: "Crossref title", updatedAt: now })),
    applyReviewedProviderMetadata: vi.fn(async () => ({ ...reference, title: "Provider title", updatedAt: now })),
    applyReviewedProviderMetadataBatch: vi.fn(async () => ({ ...reference, title: "Combined provider title", updatedAt: now })),
    getPdfMetadataContext: vi.fn(async () => ({ reference, artifact })),
    getMetadataRefinementPreview: vi.fn(async (cacheKey: string) => metadataPreviewCache.get(cacheKey) ?? null),
    cacheMetadataRefinementPreview: vi.fn(async (cacheKey: string, preview: MetadataRefinementPreview) => {
      metadataPreviewCache.set(cacheKey, preview);
    }),
    setTags: vi.fn(async (_referenceId: string, tags: readonly string[]) => tags),
    setCollections: vi.fn(async (_referenceId: string, collections: readonly string[]) => collections),
    createNote: vi.fn(async (referenceId: string, body: string) => ({ id: "note", referenceId, body, createdAt: now, updatedAt: now })),
    createHighlight: vi.fn(
      async (referenceId: string, artifactId: string, page: number, quote: string, comment: string, rects: LibraryHighlight["rects"]) => ({
        id: "highlight",
        referenceId,
        artifactId,
        page,
        quote,
        comment,
        rects,
        createdAt: now,
        updatedAt: now,
      }),
    ),
    importHighlights: vi.fn(async () => []),
    getArtifactAnalysis,
    reserveArtifactAnalysisQueuePublication: vi.fn(async (_artifactId: string, kind: ArtifactAnalysisKind) => ({
      analysis: { ...analysis, kind },
      shouldPublish: true,
    })),
    confirmArtifactAnalysisQueuePublication: vi.fn(async () => true),
    getPdfReferenceReviewQueue: vi.fn(async (): Promise<PdfReferenceReviewQueue | null> => ({
      artifactId: artifact.id,
      fingerprint: artifact.fingerprint,
      citingReferenceId: reference.id,
      candidates: [],
    })),
    reviewPdfReferenceCandidate: vi.fn(
      async (
        _artifactId: string,
        _fingerprint: string,
        candidateId: string,
        decision: "accepted" | "rejected",
        _referenceId: string | undefined,
        actor: string,
      ) => ({
        review: {
          candidateId,
          decision,
          referenceId: decision === "accepted" ? reference.id : null,
          assertionId: decision === "accepted" ? citationAssertion.id : null,
          reviewedBy: actor,
          reviewedAt: now,
        },
        reference: decision === "accepted" ? reference : null,
        assertion: decision === "accepted" ? citationAssertion : null,
      }),
    ),
    reviewPdfReferenceCandidates: vi.fn(
      async (_artifactId: string, _fingerprint: string, candidates: readonly { candidateId: string }[], actor: string) =>
        candidates.map(({ candidateId }) => ({
          review: {
            candidateId,
            decision: "accepted" as const,
            referenceId: reference.id,
            assertionId: citationAssertion.id,
            reviewedBy: actor,
            reviewedAt: now,
          },
          reference,
          assertion: citationAssertion,
        })),
    ),
    updateHighlightComment: vi.fn(async (referenceId: string, id: string, comment: string) => ({
      id,
      referenceId,
      artifactId: artifact.id,
      page: 1,
      quote: "Evidence",
      comment,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
      createdAt: now,
      updatedAt: now,
    })),
    createPdfNote: vi.fn(async (referenceId: string, artifactId: string, page: number, x: number, y: number, body: string) => ({
      id: "pdf-note",
      kind: "note" as const,
      referenceId,
      artifactId,
      page,
      x,
      y,
      body,
      createdAt: now,
      updatedAt: now,
    })),
    updatePdfNote: vi.fn(async (referenceId: string, markupId: string, x: number, y: number, body = "Moved note") => ({
      id: markupId,
      kind: "note" as const,
      referenceId,
      artifactId: artifact.id,
      page: 1,
      x,
      y,
      body,
      createdAt: now,
      updatedAt: now,
    })),
    createPdfDrawing: vi.fn(
      async (
        referenceId: string,
        artifactId: string,
        page: number,
        color: string,
        width: number,
        points: readonly { x: number; y: number }[],
        mutationId: string,
      ) => ({
        id: mutationId,
        kind: "drawing" as const,
        referenceId,
        artifactId,
        page,
        color,
        width,
        points,
        createdAt: now,
        updatedAt: now,
      }),
    ),
    updatePdfDrawing: vi.fn(async (referenceId: string, markupId: string, color: string, width: number) => ({
      id: markupId,
      kind: "drawing" as const,
      referenceId,
      artifactId: artifact.id,
      page: 1,
      color,
      width,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
      createdAt: now,
      updatedAt: now,
    })),
    deletePdfMarkup: vi.fn(async (referenceId: string, markupId: string): Promise<LibraryPdfMarkup | null> => {
      if (!pdfMarkupIds.delete(markupId)) return null;
      return {
        id: markupId,
        kind: "note" as const,
        referenceId,
        artifactId: artifact.id,
        page: 1,
        x: 0.5,
        y: 0.5,
        body: "Deleted",
        createdAt: now,
        updatedAt: now,
      };
    }),
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
      pdfMarkupCount: 0,
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
    getReferenceReconciliationReport: vi.fn(async () => ({ candidates: [], truncated: false })),
    mergeReferences: vi.fn(async (input: import("../domain/reference-library").ReferenceMergeInput) => ({
      canonicalReference: { ...reference, id: input.canonicalReferenceId },
      mergedReferenceId: input.duplicateReferenceId,
      moved: { artifacts: 0, notes: 0, highlights: 0, pdfMarkups: 0, citationAssertions: 0 },
    })),
    findReferencesByDois: vi.fn(async () => [] as BibliographicRecord[]),
    createCitationAssertions: vi.fn(
      async (inputs: readonly import("../domain/citation/citation-assertions").CreateCitationAssertionInput[]) =>
        inputs.map((input) => ({ ...citationAssertion, ...input })),
    ),
    acceptCitationCandidate: vi.fn(
      async (
        _sourceId: string,
        metadata: import("../domain/reference-library").CrossrefMetadata,
        source: import("../domain/citation/citation-expansion-types").CitationCandidateSource,
      ) => ({
        reference: { ...reference, id: citationAssertion.citedReferenceId, ...metadata },
        created: true,
        assertion: {
          ...citationAssertion,
          observedAt: source.observedAt,
          sourceId: source.responseId,
          sourceLocator: source.sourceLocator,
        },
      }),
    ),
    acceptCitationCandidates: vi.fn(
      async (
        _sourceId: string,
        metadata: readonly import("../domain/reference-library").CrossrefMetadata[],
        source: import("../domain/citation/citation-expansion-types").CitationCandidateSource,
      ) => ({
        accepted: metadata.map((candidate, index) => ({
          reference: { ...reference, id: crypto.randomUUID(), ...candidate },
          created: index === 0,
          assertion: {
            ...citationAssertion,
            observedAt: source.observedAt,
            sourceId: source.responseId,
            sourceLocator: source.sourceLocator,
          },
        })),
      }),
    ),
    getCitationResearchQueue: vi.fn(
      async (): Promise<import("../domain/citation/citation-research-queue").CitationResearchQueueItem[]> => [],
    ),
    queueCitationReference: vi.fn(
      async (referenceId: string, input: import("../domain/citation/citation-research-queue").QueueCitationReferenceInput) => ({
        ...input,
        referenceId,
        addedAt: now,
      }),
    ),
    removeCitationResearchQueueItem: vi.fn(async (referenceId: string) => ({
      referenceId,
      seedReferenceId: crypto.randomUUID(),
      direction: "references" as const,
      addedAt: now,
    })),
    getCitationAssertions: vi.fn(async () => [citationAssertion]),
    reviewCitationAssertion: vi.fn(
      async (_id: string, input: import("../domain/citation/citation-assertions").ReviewCitationAssertionInput) => ({
        ...citationAssertion,
        review: { decision: input.decision, note: input.note, reviewer: identity.email, reviewedAt: now },
      }),
    ),
    getCitationNetwork: vi.fn(async () => citationNetwork),
  };
  const getByName = vi.fn(() => library);
  const refineGeneratedProjectReferenceAlias = vi.fn(async () => true);
  const getDocumentRoomByName = vi.fn(() => ({ refineGeneratedProjectReferenceAlias }));
  const sendArtifactAnalysis = vi.fn(async () => undefined);
  return {
    library,
    getByName,
    refineGeneratedProjectReferenceAlias,
    getDocumentRoomByName,
    sendArtifactAnalysis,
    env: {
      REFERENCE_LIBRARIES: { getByName },
      DOCUMENT_ROOMS: { getByName: getDocumentRoomByName },
      PAPERS: bucket,
      ARTIFACT_ANALYSIS_QUEUE: { send: sendArtifactAnalysis },
      CROSSREF_MAILTO: "",
    },
  };
}

function crossrefResponse(doi = "10.5555/current", title = "Crossref title"): Response {
  return Response.json({
    message: {
      type: "journal-article",
      title: [title],
      author: [{ family: "Doe", given: "Jane" }],
      issued: { "date-parts": [[2026]] },
      "container-title": ["Open Research"],
      DOI: doi,
      URL: `https://doi.org/${doi}`,
      abstract: "<jats:p>Crossref abstract</jats:p>",
    },
  });
}

function crossrefSearchResponse(): Response {
  return Response.json({
    message: {
      items: [
        {
          type: "journal-article",
          title: ["Verified discovery"],
          author: [{ family: "Doe", given: "Jane" }],
          issued: { "date-parts": [[2026]] },
          "container-title": ["Research Systems"],
          DOI: "10.5555/discovery",
          URL: "https://doi.org/10.5555/discovery",
          abstract: "Registry-backed metadata",
          score: 42,
        },
      ],
    },
  });
}

function dataCiteResponse(doi = "10.5438/data", title = "DataCite record"): Response {
  return Response.json({
    data: {
      attributes: {
        doi,
        url: `https://doi.org/${doi}`,
        titles: [{ title }],
        creators: [{ familyName: "Doe", givenName: "Jane" }],
        publicationYear: 2026,
        publisher: "Data archive",
        types: { bibtex: "misc" },
        descriptions: [],
      },
    },
  });
}

function openAlexWork(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    doi: "https://doi.org/10.5555/openalex",
    title: "OpenAlex record",
    publication_year: 2026,
    type: "article",
    authorships: [{ author: { display_name: "Jane Doe" } }],
    primary_location: { source: { display_name: "Open Research" } },
    abstract_inverted_index: { Open: [0], abstract: [1] },
    relevance_score: 90,
    ...overrides,
  };
}

function openAlexResponse(doi?: string, title?: string): Response {
  return Response.json(openAlexWork({ ...(doi ? { doi: `https://doi.org/${doi}` } : {}), ...(title ? { title } : {}) }));
}

function semanticScholarPaper(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    paperId: "semantic-paper",
    externalIds: { DOI: "10.5555/semantic" },
    title: "Semantic Scholar record",
    abstract: "Semantic abstract",
    authors: [{ name: "Jane Doe" }],
    year: 2026,
    venue: "Open Research",
    publicationTypes: ["JournalArticle"],
    ...overrides,
  };
}

class MemoryR2Bucket implements Pick<R2Bucket, "put" | "get" | "delete"> {
  readonly #objects = new Map<
    string,
    { bytes: Uint8Array; httpMetadata: R2HTTPMetadata | undefined; customMetadata: Record<string, string> | undefined }
  >();

  get size(): number {
    return this.#objects.size;
  }

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

class TestFixedLengthStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(_expectedLength: number) {
    super();
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

function jsonRequest(path: string, body: object, method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST"): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pdfUploadRequest(name: string): Request {
  return new Request("https://example.test/api/library/pdfs", {
    method: "POST",
    headers: { "content-length": "4", "content-type": "application/pdf", "x-file-name": encodeURIComponent(name) },
    body: new Blob([new Uint8Array([37, 80, 68, 70])]),
  });
}
