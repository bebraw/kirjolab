import {
  isReferenceLibrarySnapshot,
  type BibliographicRecord,
  type LibraryHighlight,
  type LibraryNote,
  type LibraryPdfArtifact,
  type ReadingState,
  type ReferenceLibrarySnapshot,
} from "../domain/reference-library";
import type { ReferenceDeletionImpact, ReferenceImportItem } from "../durable-objects/reference-library";
import type { AuthIdentity } from "../security/auth";

const maximumPdfBytes = 25 * 1024 * 1024;

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
}

interface ReferenceLibraryApiEnv {
  readonly REFERENCE_LIBRARIES: { getByName(name: string): ReferenceLibraryApi };
  readonly PAPERS: Pick<R2Bucket, "put" | "get" | "delete">;
}

export async function handleReferenceLibraryApi(request: Request, env: ReferenceLibraryApiEnv, identity: AuthIdentity): Promise<Response> {
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
    const referenceMatch = /^\/references\/([0-9a-f-]{36})(?:\/(tags|notes|highlights|reading|deletion-impact))?$/iu.exec(suffix);
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
