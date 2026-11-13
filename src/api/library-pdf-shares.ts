import type { AuthIdentity } from "../security/auth";
import type { ReferenceLibrary } from "../durable-objects/reference-library";
import { renderPdfSharePage } from "../views/pdf-share";
import { htmlResponse } from "../views/shared";
import { renderAnnotatedPdf, annotatedPdfFilename } from "./annotated-pdf";
import { downloadR2Object } from "./r2-download";
import { cleanupLibraryPdfShare, cleanupLibraryPdfShares } from "./library-pdf-share-cleanup";
import type { LibraryPdfShareRegistration, LibraryPdfShareRegistrationResult } from "../domain/library-pdf-share";

type PdfShareMethod =
  | "getPdfShareSource"
  | "listPdfShares"
  | "registerPdfShare"
  | "resolvePdfShare"
  | "revokePdfShare"
  | "getPendingPdfShareCleanup"
  | "completePdfShareCleanup"
  | "retainPdfShareCleanup";
type PdfShareLibrary = {
  [Method in PdfShareMethod]: (...args: Parameters<ReferenceLibrary[Method]>) => Promise<Awaited<ReturnType<ReferenceLibrary[Method]>>>;
};

interface PdfShareEnv {
  readonly PAPERS: Pick<R2Bucket, "get" | "head" | "put" | "delete">;
  readonly REFERENCE_LIBRARIES: { getByName(ownerKey: string): PdfShareLibrary };
}

const ownerPath = /^\/api\/library\/pdfs\/([0-9a-f-]{36})\/shares(?:\/([0-9a-f-]{36}))?$/iu;
const publicPath = /^\/share\/pdf\/([A-Za-z0-9_-]{43})(\/document\.pdf)?$/u;
const maximumPdfBytes = 25 * 1024 * 1024;

export function isLibraryPdfSharesPath(pathname: string): boolean {
  return ownerPath.test(pathname);
}

export async function handleLibraryPdfSharesApi(request: Request, env: PdfShareEnv, identity: AuthIdentity): Promise<Response> {
  const match = ownerPath.exec(new URL(request.url).pathname);
  if (!match?.[1]) return jsonError("PDF share route not found", 404);
  const artifactId = match[1];
  const library = env.REFERENCE_LIBRARIES.getByName(identity.ownerKey);
  try {
    await cleanupLibraryPdfShares(env.PAPERS, library);
    if (!match[2] && request.method === "GET") {
      const result = await library.listPdfShares(artifactId);
      return result.status === "missing"
        ? jsonError("PDF artifact not found", 404)
        : Response.json({ shares: result.shares }, { headers: { "cache-control": "private, no-store" } });
    }
    if (!match[2] && request.method === "POST") return await createPdfShare(artifactId, env, library, identity.ownerKey);
    if (match[2] && request.method === "DELETE") return await revokePdfShare(artifactId, match[2], env.PAPERS, library);
    return jsonError("Method not allowed", 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not manage the PDF link";
    return jsonError(message, /not found/iu.test(message) ? 404 : 400);
  }
}

async function revokePdfShare(
  artifactId: string,
  shareId: string,
  bucket: Pick<R2Bucket, "delete">,
  library: PdfShareLibrary,
): Promise<Response> {
  // Revoke authority before deleting bytes: a storage failure cannot leave a working link.
  const result = await library.revokePdfShare(artifactId, shareId);
  if (result.status === "missing") return jsonError("PDF share not found", 404);
  try {
    await bucket.delete(shareObjectKey(result.digest));
    await library.completePdfShareCleanup(shareId, result.digest);
  } catch {
    return jsonError("Link revoked, but PDF cleanup failed. Retry revocation.", 503);
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

async function createPdfShare(artifactId: string, env: PdfShareEnv, library: PdfShareLibrary, ownerKey: string): Promise<Response> {
  const current = await library.listPdfShares(artifactId);
  if (current.status === "missing") return jsonError("PDF artifact not found", 404);
  if (current.shares.length >= 20) return jsonError("Revoke an existing link before creating more PDF shares", 409);
  const snapshot = await library.getPdfShareSource(artifactId);
  if (snapshot.status !== "ok")
    return snapshot.status === "missing"
      ? jsonError("PDF artifact not found", 404)
      : jsonError("This PDF has too many annotations to share in one copy", 413);
  const artifact = snapshot.artifact;
  const source = await env.PAPERS.get(artifact.objectKey);
  if (!source) return jsonError("PDF artifact not found", 404);
  if (source.size > maximumPdfBytes) return jsonError("Stored PDF exceeds the 25 MB limit", 413);
  const bytes = await renderAnnotatedPdf(new Uint8Array(await source.arrayBuffer()), {
    markups: snapshot.markups,
    highlights: snapshot.highlights,
  });
  const token = randomToken();
  const digest = await tokenDigest(token);
  const id = crypto.randomUUID();
  const name = annotatedPdfFilename(artifact.name);
  const key = shareObjectKey(digest);
  await env.PAPERS.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "private, no-store" },
    customMetadata: { ownerKey, shareId: id },
  });
  const registration: LibraryPdfShareRegistration = { id, artifactId, token, digest, name, createdAt: new Date().toISOString() };
  let result: LibraryPdfShareRegistrationResult;
  try {
    // Registration revalidates the artifact after rendering/storage and enforces the active-link limit atomically.
    result = await library.registerPdfShare(registration);
  } catch (error) {
    await discardUnpublishedPdfShare(env.PAPERS, library, registration);
    throw error;
  }
  if (result.status === "created")
    return Response.json({ share: result.share }, { status: 201, headers: { "cache-control": "private, no-store" } });
  await discardUnpublishedPdfShare(env.PAPERS, library, registration);
  if (result.status === "missing") return jsonError("PDF artifact not found", 404);
  if (result.status === "limit") return jsonError("Revoke an existing link before creating more PDF shares", 409);
  return jsonError("Invalid PDF share", 400);
}

async function discardUnpublishedPdfShare(
  bucket: Pick<R2Bucket, "delete">,
  library: PdfShareLibrary,
  share: LibraryPdfShareRegistration,
): Promise<void> {
  const { id, artifactId, digest, name, createdAt } = share;
  const retained = await library.retainPdfShareCleanup({ id, artifactId, digest, name, createdAt });
  if (retained !== "retained") throw new Error("Could not retain PDF cleanup record");
  // Cleanup failure leaves the unpublished copy queued for the next owner operation.
  await Promise.allSettled([cleanupLibraryPdfShare(bucket, library, share)]);
}

export async function handlePublicPdfShareRequest(request: Request, env: PdfShareEnv | undefined): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/share/pdf" && !url.pathname.startsWith("/share/pdf/")) return null;
  const match = publicPath.exec(url.pathname);
  if (!match?.[1]) return publicError("Shared PDF not found", 404);
  if (request.method !== "GET" && request.method !== "HEAD") return publicError("Method not allowed", 405);
  if (!env) return publicError("Worker bindings unavailable", 503);
  const digest = await tokenDigest(match[1]);
  const key = shareObjectKey(digest);
  const object = await env.PAPERS.head(key);
  const ownerKey = object?.customMetadata?.ownerKey;
  const shareId = object?.customMetadata?.shareId;
  if (!object || !ownerKey || !shareId) return publicError("Shared PDF not found", 404);
  const share = await env.REFERENCE_LIBRARIES.getByName(ownerKey).resolvePdfShare(shareId, digest);
  if (!share) return publicError("Shared PDF not found", 404);
  if (!match[2]) {
    const response = htmlResponse(request.method === "HEAD" ? "" : renderPdfSharePage(share, `/share/pdf/${match[1]}`), 200, url, {
      allowSameOriginFrames: true,
    });
    return protectPublicResponse(response);
  }
  const disposition = `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${share.name}"`;
  if (request.method === "HEAD") {
    return protectPublicResponse(
      new Response(null, {
        headers: {
          "content-type": "application/pdf",
          "content-length": String(object.size),
          "content-disposition": disposition,
          "accept-ranges": "bytes",
          etag: object.httpEtag,
        },
      }),
    );
  }
  const response = await downloadR2Object(request, env.PAPERS, key, { cacheControl: "private, no-store", contentDisposition: disposition });
  return response ? protectPublicResponse(response) : publicError("Shared PDF not found", 404);
}

function protectPublicResponse(response: Response): Response {
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("cross-origin-resource-policy", "same-origin");
  if (response.headers.get("content-type") === "application/pdf") response.headers.set("content-security-policy", "frame-ancestors 'self'");
  return response;
}

function publicError(message: string, status: number): Response {
  return protectPublicResponse(new Response(message, { status }));
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "private, no-store" } });
}

function randomToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function tokenDigest(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function shareObjectKey(digest: string): string {
  return `pdf-shares/${digest}.pdf`;
}
