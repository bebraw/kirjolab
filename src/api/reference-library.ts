import {
  compareWebSnapshotText,
  extractWebDocument,
  isReferenceLibrarySnapshot,
  normalizeWebSourceUrl,
  type BibliographicRecord,
  type LibraryHighlight,
  type LibraryNote,
  type LibraryPdfArtifact,
  type ReadingState,
  type ReferenceLibrarySnapshot,
  type WebCaptureRegistration,
  type WebSnapshot,
} from "../domain/reference-library";
import type { ReferenceDeletionImpact, ReferenceImportItem, WebCaptureItem } from "../durable-objects/reference-library";
import type { AuthIdentity } from "../security/auth";

const maximumPdfBytes = 25 * 1024 * 1024;
const maximumWebRawBytes = 2 * 1024 * 1024;
const maximumWebReadableBytes = 1024 * 1024;
const maximumWebRedirects = 5;

type WebFetch = (request: Request) => Promise<Response>;

interface ReferenceLibraryApi {
  getSnapshot(includeArchived?: boolean): Promise<ReferenceLibrarySnapshot>;
  importBibTeX(source: string, actor: string): Promise<ReferenceImportItem[]>;
  registerPdf(artifact: LibraryPdfArtifact): Promise<LibraryPdfArtifact>;
  identifyPdf(artifactId: string, referenceId: string): Promise<LibraryPdfArtifact>;
  setArtifactRights(artifactId: string, rights: LibraryPdfArtifact["rights"]): Promise<LibraryPdfArtifact>;
  archiveReference(referenceId: string, archived: boolean): Promise<BibliographicRecord>;
  setTags(referenceId: string, tags: readonly string[]): Promise<readonly string[]>;
  createNote(referenceId: string, body: string): Promise<LibraryNote>;
  createHighlight(referenceId: string, artifactId: string, page: number, quote: string, comment: string): Promise<LibraryHighlight>;
  setReadingState(referenceId: string, status: ReadingState["status"], rating: number | null): Promise<ReadingState>;
  getDeletionImpact(referenceId: string): Promise<ReferenceDeletionImpact>;
  permanentlyDeleteReference(referenceId: string, expectedProjectIds: readonly string[]): Promise<BibliographicRecord>;
  registerWebCapture(registration: WebCaptureRegistration): Promise<WebCaptureItem>;
  getWebSnapshot(snapshotId: string): Promise<WebSnapshot>;
  getWebSnapshots(referenceId: string): Promise<readonly WebSnapshot[]>;
}

interface ReferenceLibraryApiEnv {
  readonly REFERENCE_LIBRARIES: { getByName(name: string): ReferenceLibraryApi };
  readonly PAPERS: Pick<R2Bucket, "put" | "get" | "delete">;
}

export async function handleReferenceLibraryApi(
  request: Request,
  env: ReferenceLibraryApiEnv,
  identity: AuthIdentity,
  fetchWeb: WebFetch = (outbound) => fetch(outbound),
): Promise<Response> {
  const url = new URL(request.url);
  const suffix = url.pathname.slice("/api/library".length) || "/";
  const library = env.REFERENCE_LIBRARIES.getByName(identity.ownerKey);
  try {
    if (suffix === "/" && request.method === "GET") {
      return Response.json(await library.getSnapshot(url.searchParams.get("archived") === "include"), noStore());
    }
    if (suffix === "/import" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isRecord(body) || typeof body.bibtex !== "string" || body.bibtex.length === 0 || body.bibtex.length > 2_000_000) {
        return jsonError("Invalid BibTeX import", 400);
      }
      return Response.json(await library.importBibTeX(body.bibtex, identity.email), { status: 201, ...noStore() });
    }
    if (suffix === "/web-sources" && request.method === "POST") {
      return await captureWebSource(request, identity, env, library, fetchWeb);
    }
    const comparisonMatch = /^\/web-snapshots\/([0-9a-f-]{36})\/compare\/([0-9a-f-]{36})$/iu.exec(suffix);
    if (comparisonMatch?.[1] && comparisonMatch[2] && request.method === "GET") {
      return await compareWebSnapshots(comparisonMatch[1], comparisonMatch[2], env, library);
    }
    const webSnapshotMatch = /^\/web-snapshots\/([0-9a-f-]{36})(?:\/(raw|readable))?$/iu.exec(suffix);
    if (webSnapshotMatch?.[1] && request.method === "GET") {
      const snapshot = await library.getWebSnapshot(webSnapshotMatch[1]);
      const representation = webSnapshotMatch[2];
      if (!representation) return Response.json(snapshot, noStore());
      if (representation !== "raw" && representation !== "readable") return jsonError("Invalid web snapshot representation", 400);
      return await downloadWebSnapshot(snapshot, representation, env);
    }
    if (suffix === "/pdfs" && request.method === "POST") return await uploadLibraryPdf(request, identity.ownerKey, env, library);
    const pdfMatch = /^\/pdfs\/([0-9a-f-]{36})(?:\/(identify|rights))?$/iu.exec(suffix);
    if (pdfMatch?.[1] && request.method === "GET" && !pdfMatch[2]) {
      return await downloadLibraryPdf(pdfMatch[1], env, library);
    }
    if (pdfMatch?.[1] && pdfMatch[2] === "identify" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isRecord(body) || typeof body.referenceId !== "string") return jsonError("Invalid PDF identification", 400);
      return Response.json(await library.identifyPdf(pdfMatch[1], body.referenceId), noStore());
    }
    if (pdfMatch?.[1] && pdfMatch[2] === "rights" && request.method === "PUT") {
      const body: unknown = await request.json();
      if (!isRecord(body) || (body.rights !== "private" && body.rights !== "shareable" && body.rights !== "unknown")) {
        return jsonError("Invalid artifact rights", 400);
      }
      return Response.json(await library.setArtifactRights(pdfMatch[1], body.rights), noStore());
    }
    const referenceMatch = /^\/references\/([0-9a-f-]{36})(?:\/(tags|notes|highlights|reading|deletion-impact|web-snapshots))?$/iu.exec(
      suffix,
    );
    if (!referenceMatch?.[1]) return jsonError("Library route not found", 404);
    const referenceId = referenceMatch[1];
    const action = referenceMatch[2];
    if (!action && request.method === "PATCH") {
      const body: unknown = await request.json();
      if (!isRecord(body) || typeof body.archived !== "boolean") return jsonError("Invalid archive state", 400);
      return Response.json(await library.archiveReference(referenceId, body.archived), noStore());
    }
    if (action === "tags" && request.method === "PUT") {
      const body: unknown = await request.json();
      if (!isRecord(body) || !Array.isArray(body.tags) || !body.tags.every((tag) => typeof tag === "string")) {
        return jsonError("Invalid reference tags", 400);
      }
      return Response.json(await library.setTags(referenceId, body.tags), noStore());
    }
    if (action === "notes" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isRecord(body) || typeof body.body !== "string") return jsonError("Invalid reference note", 400);
      return Response.json(await library.createNote(referenceId, body.body), { status: 201, ...noStore() });
    }
    if (action === "highlights" && request.method === "POST") {
      const body: unknown = await request.json();
      if (
        !isRecord(body) ||
        typeof body.artifactId !== "string" ||
        typeof body.page !== "number" ||
        typeof body.quote !== "string" ||
        typeof body.comment !== "string"
      ) {
        return jsonError("Invalid private highlight", 400);
      }
      return Response.json(await library.createHighlight(referenceId, body.artifactId, body.page, body.quote, body.comment), {
        status: 201,
        ...noStore(),
      });
    }
    if (action === "reading" && request.method === "PUT") {
      const body: unknown = await request.json();
      if (!isRecord(body) || !isReadingStatus(body.status) || (body.rating !== null && typeof body.rating !== "number")) {
        return jsonError("Invalid reading state", 400);
      }
      return Response.json(await library.setReadingState(referenceId, body.status, body.rating), noStore());
    }
    if (action === "deletion-impact" && request.method === "GET") {
      return Response.json(await library.getDeletionImpact(referenceId), noStore());
    }
    if (action === "web-snapshots" && request.method === "GET") {
      return Response.json(await library.getWebSnapshots(referenceId), noStore());
    }
    if (!action && request.method === "DELETE") {
      const body: unknown = await request.json();
      if (!isRecord(body) || !Array.isArray(body.expectedProjectIds) || !body.expectedProjectIds.every((id) => typeof id === "string")) {
        return jsonError("Review deletion impact before permanent deletion", 409);
      }
      return Response.json(await library.permanentlyDeleteReference(referenceId, body.expectedProjectIds), noStore());
    }
    return jsonError("Library route not found", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reference library operation failed";
    const status = /changed|already|before deleting|before identifying/iu.test(message) ? 409 : /not found/iu.test(message) ? 404 : 400;
    return jsonError(message, status);
  }
}

async function captureWebSource(
  request: Request,
  identity: AuthIdentity,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
  fetchWeb: WebFetch,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isWebCaptureBody(body)) return jsonError("Invalid web source capture", 400);
  let requestedUrl: string;
  try {
    requestedUrl = normalizeWebSourceUrl(body.url);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid web source URL", 400);
  }
  const accessedAt = new Date().toISOString();
  const snapshotId = crypto.randomUUID();
  const retrieval = await retrieveWebSource(requestedUrl, fetchWeb);
  const extraction = extractWebDocument(retrieval.sourceText, retrieval.contentType);
  const title = body.title.trim() || extraction.title;
  if (!title) return jsonError("Enter a title because this page did not expose one", 422);
  const authors = body.authors.length > 0 ? body.authors.map((author) => author.trim()).filter(Boolean) : extraction.authors;
  const publisher = body.publisher.trim() || extraction.publisher;
  const publishedAt = body.publishedAt.trim() || extraction.publishedAt;
  const diagnostics = [...retrieval.diagnostics, ...extraction.diagnostics];
  const readable = boundedUtf8(extraction.readableText, maximumWebReadableBytes);
  if (readable.truncated) diagnostics.push("Readable text exceeded 1 MiB and was truncated.");
  const baseKey = `libraries/${identity.ownerKey}/web/${snapshotId}`;
  const rawObjectKey = retrieval.raw.length > 0 ? `${baseKey}/raw` : null;
  const readableObjectKey = readable.bytes.length > 0 ? `${baseKey}/readable.txt` : null;
  const contentHash = await sha256Fingerprint(retrieval.raw);
  const registration: WebCaptureRegistration = {
    canonicalUrl: retrieval.finalUrl,
    actor: identity.email,
    snapshot: {
      id: snapshotId,
      requestedUrl,
      finalUrl: retrieval.finalUrl,
      accessedAt,
      status: retrieval.status,
      contentType: retrieval.contentType,
      rawObjectKey,
      readableObjectKey,
      rawSize: retrieval.raw.length,
      readableSize: readable.bytes.length,
      contentHash,
      title,
      authors,
      publisher,
      publishedAt,
      complete: retrieval.complete && !readable.truncated,
      diagnostics: [...new Set(diagnostics)],
      redirectChain: retrieval.redirectChain,
      etag: retrieval.etag,
      lastModified: retrieval.lastModified,
    },
  };
  try {
    const writes: Promise<unknown>[] = [];
    if (rawObjectKey) {
      writes.push(
        env.PAPERS.put(rawObjectKey, retrieval.raw, {
          httpMetadata: { contentType: "application/octet-stream" },
          customMetadata: { contentHash },
        }),
      );
    }
    if (readableObjectKey) {
      writes.push(env.PAPERS.put(readableObjectKey, readable.bytes, { httpMetadata: { contentType: "text/plain; charset=utf-8" } }));
    }
    await Promise.all(writes);
    return Response.json(await library.registerWebCapture(registration), { status: 201, ...noStore() });
  } catch (error) {
    await Promise.all([
      rawObjectKey ? env.PAPERS.delete(rawObjectKey) : Promise.resolve(),
      readableObjectKey ? env.PAPERS.delete(readableObjectKey) : Promise.resolve(),
    ]);
    throw error;
  }
}

interface RetrievedWebSource {
  readonly finalUrl: string;
  readonly status: number;
  readonly contentType: string;
  readonly raw: Uint8Array;
  readonly sourceText: string;
  readonly complete: boolean;
  readonly diagnostics: readonly string[];
  readonly redirectChain: readonly string[];
  readonly etag: string;
  readonly lastModified: string;
}

async function retrieveWebSource(requestedUrl: string, fetchWeb: WebFetch): Promise<RetrievedWebSource> {
  const redirectChain: string[] = [];
  const diagnostics: string[] = [];
  let currentUrl = requestedUrl;
  try {
    for (let redirect = 0; redirect <= maximumWebRedirects; redirect += 1) {
      const response = await fetchWeb(
        new Request(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(15_000),
          headers: {
            accept: "text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.1",
            "user-agent": "Kirjolab-Web-Capture/1.0",
          },
        }),
      );
      if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
        await response.body?.cancel();
        if (redirect === maximumWebRedirects) throw new Error("Web source exceeded the redirect limit");
        const destination = normalizeWebSourceUrl(new URL(response.headers.get("location") ?? "", currentUrl).href);
        redirectChain.push(destination);
        currentUrl = destination;
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const bounded = await readBoundedBytes(response.body, maximumWebRawBytes);
      if (bounded.truncated) diagnostics.push("Fetched content exceeded 2 MiB and was truncated.");
      if (!response.ok) diagnostics.push(`The source returned HTTP ${response.status}.`);
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > maximumWebRawBytes)
        diagnostics.push("The declared response size exceeded 2 MiB.");
      return {
        finalUrl: currentUrl,
        status: response.status,
        contentType,
        raw: bounded.bytes,
        sourceText: new TextDecoder().decode(bounded.bytes),
        complete: response.ok && !bounded.truncated,
        diagnostics,
        redirectChain,
        etag: response.headers.get("etag") ?? "",
        lastModified: response.headers.get("last-modified") ?? "",
      };
    }
  } catch (error) {
    diagnostics.push(
      error instanceof Error && /redirect limit/iu.test(error.message)
        ? error.message
        : "The page could not be retrieved during this capture.",
    );
  }
  return {
    finalUrl: currentUrl,
    status: 0,
    contentType: "",
    raw: new Uint8Array(),
    sourceText: "",
    complete: false,
    diagnostics,
    redirectChain,
    etag: "",
    lastModified: "",
  };
}

async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!body) return { bytes: new Uint8Array(), truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    const remaining = maximumBytes - size;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }
    const chunk = result.value.length > remaining ? result.value.subarray(0, remaining) : result.value;
    chunks.push(chunk);
    size += chunk.length;
    if (chunk.length < result.value.length) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, truncated };
}

function boundedUtf8(value: string, maximumBytes: number): { bytes: Uint8Array; truncated: boolean } {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length <= maximumBytes) return { bytes: encoded, truncated: false };
  let end = maximumBytes;
  while (end > 0 && (encoded[end] ?? 0) >= 0x80 && (encoded[end] ?? 0) < 0xc0) end -= 1;
  return { bytes: encoded.subarray(0, end), truncated: true };
}

async function sha256Fingerprint(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function compareWebSnapshots(
  beforeId: string,
  afterId: string,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
): Promise<Response> {
  const [before, after] = await Promise.all([library.getWebSnapshot(beforeId), library.getWebSnapshot(afterId)]);
  if (before.referenceId !== after.referenceId) return jsonError("Web snapshots must belong to the same source", 409);
  const [beforeText, afterText] = await Promise.all([readWebSnapshotText(before, env), readWebSnapshotText(after, env)]);
  return Response.json({ before, after, comparison: compareWebSnapshotText(beforeText, afterText) }, noStore());
}

async function readWebSnapshotText(snapshot: WebSnapshot, env: ReferenceLibraryApiEnv): Promise<string> {
  if (!snapshot.readableObjectKey) return "";
  const object = await env.PAPERS.get(snapshot.readableObjectKey);
  if (!object) throw new Error("Web snapshot readable content not found");
  if (object.size > maximumWebReadableBytes) throw new Error("Stored web snapshot exceeds the readable-text limit");
  return await object.text();
}

async function downloadWebSnapshot(
  snapshot: WebSnapshot,
  representation: "raw" | "readable",
  env: ReferenceLibraryApiEnv,
): Promise<Response> {
  const objectKey = representation === "raw" ? snapshot.rawObjectKey : snapshot.readableObjectKey;
  if (!objectKey) return jsonError(`Web snapshot ${representation} content is unavailable`, 404);
  const object = await env.PAPERS.get(objectKey);
  if (!object) return jsonError("Web snapshot content not found", 404);
  if (representation === "raw" && object.customMetadata?.contentHash !== snapshot.contentHash) {
    return jsonError("Web snapshot content no longer matches its captured fingerprint", 410);
  }
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-disposition": `attachment; filename="web-snapshot-${snapshot.id}.${representation === "raw" ? "bin" : "txt"}"`,
    "content-security-policy": "sandbox; default-src 'none'",
    "content-type": representation === "raw" ? "application/octet-stream" : "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  return new Response(object.body, { headers });
}

async function uploadLibraryPdf(
  request: Request,
  ownerKey: string,
  env: ReferenceLibraryApiEnv,
  library: ReferenceLibraryApi,
): Promise<Response> {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/pdf") return jsonError("Only PDF uploads are supported", 415);
  if (!request.body) return jsonError("PDF body is required", 400);
  const size = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(size) || size <= 0) return jsonError("Content-Length is required", 411);
  if (size > maximumPdfBytes) return jsonError("PDF exceeds the 25 MB limit", 413);
  const id = crypto.randomUUID();
  const objectKey = `libraries/${ownerKey}/${id}.pdf`;
  const stream = new FixedLengthStream(size);
  const upload = env.PAPERS.put(objectKey, stream.readable, { httpMetadata: { contentType: "application/pdf" } });
  const pipeline = request.body.pipeTo(stream.writable);
  const [stored] = await Promise.all([upload, pipeline]);
  const artifact: LibraryPdfArtifact = {
    id,
    referenceId: null,
    name: safeFilename(request.headers.get("x-file-name") ?? "paper.pdf"),
    contentType: "application/pdf",
    size,
    objectKey,
    fingerprint: `r2-etag:${stored.etag.replaceAll('"', "")}`,
    rights: "private",
    createdAt: new Date().toISOString(),
  };
  try {
    await library.registerPdf(artifact);
  } catch (error) {
    await env.PAPERS.delete(objectKey);
    throw error;
  }
  return Response.json(artifact, { status: 201, ...noStore() });
}

async function downloadLibraryPdf(artifactId: string, env: ReferenceLibraryApiEnv, library: ReferenceLibraryApi): Promise<Response> {
  const snapshot = await library.getSnapshot(true);
  if (!isReferenceLibrarySnapshot(snapshot)) throw new Error("Reference library returned an invalid snapshot");
  const artifact = snapshot.artifacts.find((item) => item.id === artifactId);
  if (!artifact) return jsonError("PDF artifact not found", 404);
  const object = await env.PAPERS.get(artifact.objectKey);
  if (!object) return jsonError("PDF artifact not found", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");
  headers.set("content-disposition", "inline");
  return new Response(object.body, { headers });
}

function isReadingStatus(value: unknown): value is ReadingState["status"] {
  return value === "unread" || value === "reading" || value === "read";
}

function isWebCaptureBody(value: unknown): value is {
  readonly url: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly publisher: string;
  readonly publishedAt: string;
} {
  if (!isRecord(value) || typeof value.url !== "string" || value.url.length === 0 || value.url.length > 4096) return false;
  return (
    typeof value.title === "string" &&
    value.title.length <= 1000 &&
    Array.isArray(value.authors) &&
    value.authors.length <= 32 &&
    value.authors.every((author) => typeof author === "string" && author.length <= 500) &&
    typeof value.publisher === "string" &&
    value.publisher.length <= 500 &&
    typeof value.publishedAt === "string" &&
    value.publishedAt.length <= 100
  );
}

function safeFilename(value: string): string {
  const decoded = decodeURIComponent(value);
  const sanitized = decoded.replaceAll(/[\r\n"/\\]/gu, "-").trim();
  return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized || "paper"}.pdf`;
}

function noStore(): { headers: { "cache-control": string } } {
  return { headers: { "cache-control": "no-store" } };
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, ...noStore() });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
