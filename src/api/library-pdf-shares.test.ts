import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryPdfShare, LibraryPdfShareRegistration, LibraryPdfShareSourceResult } from "../domain/library-pdf-share";
import type { AuthIdentity } from "../security/auth";
import { handleLibraryPdfSharesApi, handlePublicPdfShareRequest, isLibraryPdfSharesPath } from "./library-pdf-shares";
import { renderAnnotatedPdf } from "./annotated-pdf";

vi.mock("./annotated-pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./annotated-pdf")>()),
  renderAnnotatedPdf: vi.fn(async () => new TextEncoder().encode("%PDF-snapshot")),
}));

const artifactId = "11111111-1111-4111-8111-111111111111";
const shareId = "22222222-2222-4222-8222-222222222222";
const token = "a".repeat(43);
const now = "2026-11-13T12:00:00.000Z";
const identity: AuthIdentity = { subject: "owner", email: "owner@example.test", ownerKey: "private-owner", mode: "local" };
const share: LibraryPdfShare = { id: shareId, name: "paper-annotated.pdf", createdAt: now, href: `/share/pdf/${token}` };
const snapshot: LibraryPdfShareSourceResult = {
  status: "ok",
  highlights: [],
  markups: [],
  artifact: {
    id: artifactId,
    referenceId: null,
    name: "paper.pdf",
    contentType: "application/pdf",
    size: 10,
    objectKey: "private/source.pdf",
    fingerprint: "source",
    rights: "private",
    createdAt: now,
  },
};

beforeEach(() => vi.clearAllMocks());

describe("owner PDF link API", () => {
  it("creates a snapshot with a recoverable opaque link and no private routing metadata", async () => {
    const fixture = apiFixture();
    const response = await handleLibraryPdfSharesApi(ownerRequest("POST"), fixture.env, identity);
    expect(response.status).toBe(201);
    const result = await response.json<{ share: LibraryPdfShare }>();
    expect(result.share.href).toMatch(/^\/share\/pdf\/[A-Za-z0-9_-]{43}$/u);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(result)).not.toContain(identity.ownerKey);
    expect(fixture.library.registerPdfShare).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId,
        name: "paper-annotated.pdf",
        token: result.share.href.slice("/share/pdf/".length),
        digest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
    expect(fixture.bucket.put).toHaveBeenCalledWith(
      expect.stringMatching(/^pdf-shares\/[a-f0-9]{64}\.pdf$/u),
      new TextEncoder().encode("%PDF-snapshot"),
      expect.objectContaining({ customMetadata: { ownerKey: identity.ownerKey, shareId: result.share.id } }),
    );
    expect(renderAnnotatedPdf).toHaveBeenCalledWith(new TextEncoder().encode("%PDF-source"), { highlights: [], markups: [] });
  });

  it("lists owner links and keeps requests scoped to the authenticated owner", async () => {
    const fixture = apiFixture();
    fixture.library.listPdfShares.mockResolvedValue({ status: "ok", shares: [share] });
    const response = await handleLibraryPdfSharesApi(ownerRequest("GET"), fixture.env, identity);
    expect(await response.json()).toEqual({ shares: [share] });
    expect(fixture.env.REFERENCE_LIBRARIES.getByName).toHaveBeenCalledWith(identity.ownerKey);
  });

  it.each(["GET", "POST"])("rejects a missing owner artifact on %s", async (method) => {
    const fixture = apiFixture();
    fixture.library.listPdfShares.mockResolvedValue({ status: "missing" });
    expect((await handleLibraryPdfSharesApi(ownerRequest(method), fixture.env, identity)).status).toBe(404);
    expect(fixture.bucket.put).not.toHaveBeenCalled();
  });

  it("refuses the active-link limit before reading or rendering the source", async () => {
    const fixture = apiFixture();
    fixture.library.listPdfShares.mockResolvedValue({ status: "ok", shares: Array.from({ length: 20 }, () => share) });
    expect((await handleLibraryPdfSharesApi(ownerRequest("POST"), fixture.env, identity)).status).toBe(409);
    expect(fixture.bucket.get).not.toHaveBeenCalled();
  });

  it.each(["missing", "limit", "invalid"] as const)("cleans an unpublished snapshot when registration reports %s", async (status) => {
    const fixture = apiFixture();
    fixture.library.registerPdfShare.mockResolvedValue({ status });
    const response = await handleLibraryPdfSharesApi(ownerRequest("POST"), fixture.env, identity);
    expect(response.status).toBe(status === "missing" ? 404 : status === "limit" ? 409 : 400);
    expect(fixture.bucket.delete).toHaveBeenCalledWith(expect.stringMatching(/^pdf-shares\//u));
  });

  it("cleans an unpublished copy when registration fails unexpectedly", async () => {
    const fixture = apiFixture();
    fixture.library.registerPdfShare.mockRejectedValue(new Error("Storage unavailable"));
    expect((await handleLibraryPdfSharesApi(ownerRequest("POST"), fixture.env, identity)).status).toBe(400);
    expect(fixture.bucket.delete).toHaveBeenCalledOnce();
  });

  it("retains failed unpublished-copy cleanup and retries it during the next owner request", async () => {
    const fixture = apiFixture();
    const pending: { id: string; digest: string }[] = [];
    fixture.library.registerPdfShare.mockResolvedValue({ status: "missing" });
    fixture.library.retainPdfShareCleanup.mockImplementation(async ({ id, digest }) => {
      pending.push({ id, digest });
      return "retained";
    });
    fixture.library.getPendingPdfShareCleanup.mockImplementation(async () => [...pending]);
    fixture.library.completePdfShareCleanup.mockImplementation(async () => {
      pending.length = 0;
    });
    fixture.bucket.delete.mockRejectedValueOnce(new Error("R2 unavailable"));

    expect((await handleLibraryPdfSharesApi(ownerRequest("POST"), fixture.env, identity)).status).toBe(404);
    expect(pending).toHaveLength(1);
    expect(fixture.library.retainPdfShareCleanup.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.bucket.delete.mock.invocationCallOrder[0]!,
    );
    expect(fixture.library.completePdfShareCleanup).not.toHaveBeenCalled();
    const retained = pending[0]!;
    expect((await handleLibraryPdfSharesApi(ownerRequest("GET"), fixture.env, identity)).status).toBe(200);
    expect(pending).toEqual([]);
    expect(fixture.bucket.delete).toHaveBeenLastCalledWith(`pdf-shares/${retained.digest}.pdf`);
    expect(fixture.library.completePdfShareCleanup).toHaveBeenCalledWith(retained.id, retained.digest);
  });

  it.each(["snapshot", "bytes"])("handles missing source %s without writing a share", async (missing) => {
    const fixture = apiFixture();
    if (missing === "snapshot") fixture.library.getPdfShareSource.mockResolvedValue({ status: "missing" });
    else fixture.bucket.get.mockResolvedValue(null);
    expect((await handleLibraryPdfSharesApi(ownerRequest("POST"), fixture.env, identity)).status).toBe(404);
    expect(fixture.bucket.put).not.toHaveBeenCalled();
  });

  it("rejects oversized source objects before buffering", async () => {
    const fixture = apiFixture();
    fixture.bucket.get.mockResolvedValue(objectBody(25 * 1024 * 1024 + 1));
    expect((await handleLibraryPdfSharesApi(ownerRequest("POST"), fixture.env, identity)).status).toBe(413);
    expect(renderAnnotatedPdf).not.toHaveBeenCalled();
  });

  it("rejects an oversized annotation set without silently truncating the shared copy", async () => {
    const fixture = apiFixture();
    fixture.library.getPdfShareSource.mockResolvedValue({ status: "limit" });
    const response = await handleLibraryPdfSharesApi(ownerRequest("POST"), fixture.env, identity);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "This PDF has too many annotations to share in one copy" });
    expect(fixture.bucket.put).not.toHaveBeenCalled();
  });

  it("revokes authority before deleting the public copy and supports cleanup retry", async () => {
    const fixture = apiFixture();
    fixture.bucket.delete.mockRejectedValueOnce(new Error("R2 unavailable"));
    const request = ownerRequest("DELETE", `/${shareId}`);
    const failedCleanup = await handleLibraryPdfSharesApi(request, fixture.env, identity);
    expect(failedCleanup.status).toBe(503);
    expect(await failedCleanup.json()).toEqual({ error: "Link revoked, but PDF cleanup failed. Retry revocation." });
    expect(fixture.library.revokePdfShare.mock.invocationCallOrder[0]).toBeLessThan(fixture.bucket.delete.mock.invocationCallOrder[0]!);
    expect((await handleLibraryPdfSharesApi(request, fixture.env, identity)).status).toBe(204);
  });

  it("does not delete another owner's or artifact's share", async () => {
    const fixture = apiFixture();
    fixture.library.revokePdfShare.mockResolvedValue({ status: "missing" });
    expect((await handleLibraryPdfSharesApi(ownerRequest("DELETE", `/${shareId}`), fixture.env, identity)).status).toBe(404);
    expect(fixture.bucket.delete).not.toHaveBeenCalled();
  });

  it("rejects unsupported owner routes and methods", async () => {
    const fixture = apiFixture();
    expect(isLibraryPdfSharesPath(new URL(ownerRequest("GET").url).pathname)).toBe(true);
    expect(isLibraryPdfSharesPath("/api/library/pdfs/arbitrary/shares")).toBe(false);
    expect((await handleLibraryPdfSharesApi(new Request("https://example.test/wrong"), fixture.env, identity)).status).toBe(404);
    expect((await handleLibraryPdfSharesApi(ownerRequest("PUT"), fixture.env, identity)).status).toBe(405);
  });
});

describe("public PDF link API", () => {
  it("only handles its own route family and never admits public writes", async () => {
    const fixture = apiFixture();
    expect(await handlePublicPdfShareRequest(new Request("https://example.test/library"), fixture.env)).toBeNull();
    expect((await handlePublicPdfShareRequest(new Request("https://example.test/share/pdf/bad"), fixture.env))?.status).toBe(404);
    expect((await handlePublicPdfShareRequest(publicRequest("POST"), fixture.env))?.status).toBe(405);
    expect((await handlePublicPdfShareRequest(publicRequest("GET"), undefined))?.status).toBe(503);
  });

  it.each(["object", "metadata", "authority"])("denies missing public %s without serving bytes", async (missing) => {
    const fixture = apiFixture();
    if (missing === "object") fixture.bucket.head.mockResolvedValue(null);
    else if (missing === "metadata") {
      const metadata = objectMetadata();
      fixture.bucket.head.mockResolvedValue({
        ...metadata,
        customMetadata: {},
        writeHttpMetadata: (headers) => metadata.writeHttpMetadata(headers),
      });
    } else fixture.library.resolvePdfShare.mockResolvedValue(null);
    const response = await handlePublicPdfShareRequest(publicRequest("GET", "/document.pdf"), fixture.env);
    expect(response?.status).toBe(404);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(fixture.bucket.get).not.toHaveBeenCalled();
  });

  it("serves a no-index landing page without exposing private routing or annotations", async () => {
    const fixture = apiFixture();
    const response = await handlePublicPdfShareRequest(publicRequest("GET"), fixture.env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response?.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(await response?.text()).not.toContain(identity.ownerKey);
    const head = await handlePublicPdfShareRequest(publicRequest("HEAD"), fixture.env);
    expect(await head?.text()).toBe("");
    expect(fixture.bucket.get).not.toHaveBeenCalled();
  });

  it.each([false, true])("streams an authorized copy with download=%s", async (download) => {
    const fixture = apiFixture();
    const response = await handlePublicPdfShareRequest(publicRequest("GET", `/document.pdf${download ? "?download=1" : ""}`), fixture.env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-disposition")).toBe(`${download ? "attachment" : "inline"}; filename="paper-annotated.pdf"`);
    expect(response?.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(await response?.text()).toBe("%PDF-source");
  });

  it("provides HEAD metadata without reading the PDF body", async () => {
    const fixture = apiFixture();
    const response = await handlePublicPdfShareRequest(publicRequest("HEAD", "/document.pdf"), fixture.env);
    expect(response?.headers.get("content-length")).toBe("11");
    expect(await response?.text()).toBe("");
    expect(fixture.bucket.get).not.toHaveBeenCalled();
  });

  it("returns not found if bytes disappear after metadata validation", async () => {
    const fixture = apiFixture();
    fixture.bucket.get.mockResolvedValue(null);
    expect((await handlePublicPdfShareRequest(publicRequest("GET", "/document.pdf"), fixture.env))?.status).toBe(404);
  });
});

function ownerRequest(method: string, suffix = ""): Request {
  return new Request(`https://example.test/api/library/pdfs/${artifactId}/shares${suffix}`, { method });
}

function publicRequest(method: string, suffix = ""): Request {
  return new Request(`https://example.test${share.href}${suffix}`, { method });
}

function apiFixture() {
  type Env = Parameters<typeof handleLibraryPdfSharesApi>[1];
  type Library = ReturnType<Env["REFERENCE_LIBRARIES"]["getByName"]>;
  const library = {
    getPendingPdfShareCleanup: vi.fn(async (): Promise<readonly { id: string; digest: string }[]> => []),
    completePdfShareCleanup: vi.fn(async (_id: string, _digest: string): Promise<void> => undefined),
    retainPdfShareCleanup: vi.fn(async (_input: Omit<LibraryPdfShareRegistration, "token">): Promise<"retained" | "invalid"> => "retained"),
    getPdfShareSource: vi.fn<Library["getPdfShareSource"]>().mockResolvedValue(snapshot),
    listPdfShares: vi.fn<Library["listPdfShares"]>().mockResolvedValue({ status: "ok", shares: [] }),
    registerPdfShare: vi.fn<Library["registerPdfShare"]>().mockImplementation(async (input: LibraryPdfShareRegistration) => ({
      status: "created",
      share: { id: input.id, name: input.name, createdAt: input.createdAt, href: `/share/pdf/${input.token}` },
    })),
    resolvePdfShare: vi.fn<Library["resolvePdfShare"]>().mockResolvedValue({ name: share.name, createdAt: now }),
    revokePdfShare: vi.fn<Library["revokePdfShare"]>().mockResolvedValue({ status: "revoked", digest: "f".repeat(64) }),
  };
  const bucket = {
    get: vi.fn<R2Bucket["get"]>().mockResolvedValue(objectBody()),
    head: vi.fn<R2Bucket["head"]>().mockResolvedValue(objectMetadata()),
    put: vi.fn<R2Bucket["put"]>().mockResolvedValue(objectMetadata()),
    delete: vi.fn<R2Bucket["delete"]>().mockResolvedValue(undefined),
  };
  return { library, bucket, env: { PAPERS: bucket, REFERENCE_LIBRARIES: { getByName: vi.fn(() => library) } } satisfies Env };
}

function objectMetadata(size = 11): R2Object {
  return {
    key: "opaque.pdf",
    version: "1",
    size,
    etag: "etag",
    httpEtag: '"etag"',
    checksums: { toJSON: () => ({}) },
    uploaded: new Date(now),
    httpMetadata: { contentType: "application/pdf" },
    storageClass: "Standard",
    customMetadata: { ownerKey: identity.ownerKey, shareId },
    writeHttpMetadata(headers: Headers) {
      headers.set("content-type", "application/pdf");
    },
  };
}

function objectBody(size = 11): R2ObjectBody {
  const bytes = new TextEncoder().encode("%PDF-source");
  const metadata = objectMetadata(size);
  return {
    ...metadata,
    writeHttpMetadata: (headers) => metadata.writeHttpMetadata(headers),
    body: new Blob([bytes]).stream(),
    bodyUsed: false,
    arrayBuffer: async () => bytes.slice().buffer,
    bytes: async () => bytes.slice(),
    text: async () => new TextDecoder().decode(bytes),
    json: async () => JSON.parse("{}"),
    blob: async () => new Blob([bytes]),
  };
}
