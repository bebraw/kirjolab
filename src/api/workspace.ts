import {
  isCreateAnnotationInput,
  isCreateAnnotationLinkInput,
  isCreateCandidateInput,
  isCreateClaimPassageLinkInput,
  isCreatePassageLinkInput,
  isCreatePublicationPdfLinkInput,
  isAcceptPublicationIntakeInput,
  isPreviewPublicationIntakeInput,
  isCreateWorkspaceInput,
  isImportBibliographyInput,
  isInviteWorkspaceMemberInput,
  isUpsertClaimInput,
  localOwnerId,
  type PdfResource,
} from "../domain/workspace";
import { buildWorkspaceKnowledgeGraph, searchWorkspaceKnowledge } from "../domain/knowledge";
import { fetchCrossrefWork, fingerprintPublicationMetadata } from "../integrations/crossref";
import { ownerKeyForEmail, type AuthIdentity } from "../security/auth";

const maximumPdfBytes = 25 * 1024 * 1024;

export async function handleWorkspaceApi(request: Request, env: Env, identity: AuthIdentity): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/workspaces") return await handleWorkspaceCatalog(request, env, identity);
  const match = /^\/api\/workspaces\/([a-z0-9-]{1,64})(\/.*)?$/iu.exec(url.pathname);
  const workspaceId = match?.[1];
  if (!workspaceId) return jsonError("Workspace not found", 404);
  const prefix = `/api/workspaces/${workspaceId}`;
  const suffix = url.pathname.slice(prefix.length) || "/";
  const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
  const summary = await catalog.getWorkspace(workspaceId);
  if (!summary) return jsonError("Workspace not found", 404);
  const storageKey = workspaceStorageKey(identity, workspaceId);
  const access = env.WORKSPACE_ACCESS.getByName(storageKey);
  if (workspaceId === "demo" || identity.mode === "local") await access.initializeOwner(identity.email);
  const role = await access.getRole(identity.email);
  if (!role) return jsonError("Workspace access denied", 403);
  const room = env.DOCUMENT_ROOMS.getByName(storageKey);

  try {
    if (suffix === "/" && request.method === "GET") return Response.json(await room.getSnapshot(workspaceId));
    if (suffix === "/search" && request.method === "GET") {
      const query = url.searchParams.get("q")?.slice(0, 200) ?? "";
      return Response.json(searchWorkspaceKnowledge(await room.getSnapshot(workspaceId), query));
    }
    if (suffix === "/graph" && request.method === "GET") {
      return Response.json(buildWorkspaceKnowledgeGraph(await room.getSnapshot(workspaceId)));
    }
    if (suffix === "/socket" && request.method === "GET") return await room.fetch(request);
    if (suffix === "/members" && request.method === "GET") return Response.json(await access.listMembers(identity.email));
    if (suffix === "/members" && request.method === "POST") {
      return await inviteWorkspaceMember(request, env, identity, workspaceId, summary.title, access);
    }
    if (suffix === "/pdfs" && request.method === "POST") return await uploadPdf(request, storageKey, env, room);
    if (suffix.startsWith("/pdfs/") && request.method === "GET") {
      return await downloadPdf(storageKey, suffix.slice("/pdfs/".length), env);
    }
    if (suffix === "/annotations" && request.method === "POST") return await createAnnotation(request, room);
    if (suffix === "/annotation-links" && request.method === "POST") return await createAnnotationLink(request, room);
    if (suffix === "/bibliography/import" && request.method === "POST") return await importBibliography(request, workspaceId, room);
    if (suffix === "/publication-intake/preview" && request.method === "POST") {
      return await previewPublicationIntake(request, env, room);
    }
    if (suffix === "/publication-intake/accept" && request.method === "POST") {
      return await acceptPublicationIntake(request, env, room);
    }
    if (suffix === "/publication-pdf-links" && request.method === "POST") {
      return await createPublicationPdfLink(request, room);
    }
    if (suffix.startsWith("/publication-pdf-links/") && request.method === "DELETE") {
      return await deletePublicationPdfLink(suffix, room);
    }
    if (suffix.startsWith("/publications/") && request.method === "POST") {
      return await enrichPublication(workspaceId, suffix, env, room);
    }
    if (suffix === "/links" && request.method === "POST") return await createPassageLink(request, room);
    if (suffix === "/claims" && request.method === "POST") return await createClaim(request, room);
    if (suffix.startsWith("/claims/") && (request.method === "PUT" || request.method === "DELETE")) {
      return await mutateClaim(request, suffix, room);
    }
    if (suffix === "/claim-links" && request.method === "POST") return await createClaimPassageLink(request, room);
    if (suffix === "/candidates" && request.method === "POST") return await createCandidate(request, room);
    if (suffix.startsWith("/candidates/") && request.method === "POST") return await updateCandidate(workspaceId, suffix, room);
    if (suffix === "/export/document.md" && request.method === "GET") {
      const portable = await room.getPortableDocument();
      return portableResponse(portable.source, "text/markdown; charset=utf-8", "kirjolab-document.md");
    }
    if (suffix === "/export/bibliography.bib" && request.method === "GET") {
      const portable = await room.getPortableDocument();
      return portableResponse(portable.bibliography, "application/x-bibtex; charset=utf-8", "bibliography.bib");
    }
    return jsonError("Route not found", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace operation failed";
    const status = /access denied|only the workspace owner/iu.test(message)
      ? 403
      : /already exists|ambiguous|changed|stale|pending/iu.test(message)
        ? 409
        : 400;
    return jsonError(message, status);
  }
}

async function handleWorkspaceCatalog(request: Request, env: Env, identity: AuthIdentity): Promise<Response> {
  const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
  if (request.method === "GET") return Response.json(await catalog.listWorkspaces());
  if (request.method !== "POST") return jsonError("Route not found", 404);
  const body: unknown = await request.json();
  if (!isCreateWorkspaceInput(body)) return jsonError("Invalid workspace", 400);
  const id = crypto.randomUUID();
  const storageKey = workspaceStorageKey(identity, id);
  const access = env.WORKSPACE_ACCESS.getByName(storageKey);
  await access.initializeOwner(identity.email);
  const room = env.DOCUMENT_ROOMS.getByName(storageKey);
  await room.initializeWorkspace(body.title.trim());
  return Response.json(await catalog.registerWorkspace(id, body.title.trim()), { status: 201 });
}

async function inviteWorkspaceMember(
  request: Request,
  env: Env,
  identity: AuthIdentity,
  workspaceId: string,
  title: string,
  access: DurableObjectStub<import("../durable-objects/workspace-access").WorkspaceAccess>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isInviteWorkspaceMemberInput(body)) return jsonError("Invalid workspace member", 400);
  const email = body.email.trim().toLowerCase();
  const member = await access.addMember(identity.email, email);
  const memberOwnerKey = await ownerKeyForEmail(email);
  const memberCatalog = env.WORKSPACE_CATALOGS.getByName(memberOwnerKey);
  await memberCatalog.registerWorkspace(workspaceId, title);
  return Response.json(member, { status: 201 });
}

async function uploadPdf(
  request: Request,
  workspaceId: string,
  env: Env,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/pdf") return jsonError("Only PDF uploads are supported", 415);
  if (!request.body) return jsonError("PDF body is required", 400);
  const size = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(size) || size <= 0) return jsonError("Content-Length is required", 411);
  if (size > maximumPdfBytes) return jsonError("PDF exceeds the 25 MB vertical-slice limit", 413);

  const id = crypto.randomUUID();
  const objectKey = `${workspaceId}/${id}.pdf`;
  const name = safeFilename(request.headers.get("x-file-name") ?? "paper.pdf");
  const fixedLengthBody = new FixedLengthStream(size);
  const upload = env.PAPERS.put(objectKey, fixedLengthBody.readable, { httpMetadata: { contentType: "application/pdf" } });
  const pipeline = request.body.pipeTo(fixedLengthBody.writable);
  const [stored] = await Promise.all([upload, pipeline]);

  const pdf: PdfResource = {
    id,
    name,
    contentType: "application/pdf",
    size,
    objectKey,
    fingerprint: `r2-etag:${stored.etag.replaceAll('"', "")}`,
    createdAt: new Date().toISOString(),
  };
  try {
    await room.registerPdf(pdf);
  } catch (error) {
    await env.PAPERS.delete(objectKey);
    throw error;
  }
  return Response.json(pdf, { status: 201 });
}

async function downloadPdf(workspaceId: string, pdfId: string, env: Env): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/iu.test(pdfId)) return jsonError("PDF not found", 404);
  const object = await env.PAPERS.get(`${workspaceId}/${pdfId}.pdf`);
  if (!object) return jsonError("PDF not found", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=300");
  headers.set("content-disposition", "inline");
  return new Response(object.body, { headers });
}

async function createAnnotation(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreateAnnotationInput(body)) return jsonError("Invalid annotation", 400);
  return Response.json(await room.createAnnotation(body), { status: 201 });
}

async function createAnnotationLink(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreateAnnotationLinkInput(body)) return jsonError("Invalid annotation link", 400);
  return Response.json(await room.createAnnotationLink(body), { status: 201 });
}

async function importBibliography(
  request: Request,
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isImportBibliographyInput(body)) return jsonError("Invalid BibTeX import", 400);
  return Response.json(await room.importBibliography(workspaceId, body.bibtex));
}

async function enrichPublication(
  workspaceId: string,
  suffix: string,
  env: Env,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const match = /^\/publications\/([0-9a-f-]{36})\/enrich$/iu.exec(suffix);
  if (!match?.[1]) return jsonError("Publication route not found", 404);
  const publication = await room.getPublication(match[1]);
  if (!publication.doi) return jsonError("Publication has no DOI", 400);
  const metadata = await fetchCrossrefWork(publication.doi, env.CROSSREF_MAILTO);
  return Response.json(await room.enrichPublication(workspaceId, publication.id, metadata));
}

async function previewPublicationIntake(
  request: Request,
  env: Env,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isPreviewPublicationIntakeInput(body)) return jsonError("Invalid publication intake preview", 400);
  const metadata = await fetchCrossrefWork(body.doi, env.CROSSREF_MAILTO);
  const metadataFingerprint = await fingerprintPublicationMetadata(metadata);
  return Response.json(await room.previewPublicationIntake(body.pdfId, metadata, metadataFingerprint));
}

async function acceptPublicationIntake(
  request: Request,
  env: Env,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isAcceptPublicationIntakeInput(body)) return jsonError("Invalid publication intake", 400);
  const metadata = await fetchCrossrefWork(body.doi, env.CROSSREF_MAILTO);
  const metadataFingerprint = await fingerprintPublicationMetadata(metadata);
  if (metadataFingerprint !== body.metadataFingerprint) throw new Error("Crossref metadata changed; review it again");
  const result = await room.acceptPublicationIntake(body.pdfId, body.citationKey, metadata);
  return Response.json(result, { status: result.publicationCreated || result.linkCreated ? 201 : 200 });
}

async function createPublicationPdfLink(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreatePublicationPdfLinkInput(body)) return jsonError("Invalid publication/PDF link", 400);
  return Response.json(await room.createPublicationPdfLink(body), { status: 201 });
}

async function deletePublicationPdfLink(
  suffix: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const match = /^\/publication-pdf-links\/([0-9a-f-]{36})$/iu.exec(suffix);
  if (!match?.[1]) return jsonError("Publication/PDF link route not found", 404);
  await room.deletePublicationPdfLink(match[1]);
  return new Response(null, { status: 204 });
}

async function createPassageLink(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreatePassageLinkInput(body)) return jsonError("Invalid passage link", 400);
  return Response.json(await room.createPassageLink(body), { status: 201 });
}

async function createClaim(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isUpsertClaimInput(body)) return jsonError("Invalid claim", 400);
  return Response.json(await room.createClaim(body), { status: 201 });
}

async function mutateClaim(
  request: Request,
  suffix: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const match = /^\/claims\/([0-9a-f-]{36})$/iu.exec(suffix);
  if (!match?.[1]) return jsonError("Claim route not found", 404);
  if (request.method === "DELETE") {
    await room.deleteClaim(match[1]);
    return new Response(null, { status: 204 });
  }
  const body: unknown = await request.json();
  if (!isUpsertClaimInput(body)) return jsonError("Invalid claim", 400);
  return Response.json(await room.updateClaim(match[1], body));
}

async function createClaimPassageLink(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreateClaimPassageLinkInput(body)) return jsonError("Invalid claim passage link", 400);
  return Response.json(await room.createClaimPassageLink(body), { status: 201 });
}

async function createCandidate(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreateCandidateInput(body)) return jsonError("Invalid model candidate", 400);
  return Response.json(await room.createCandidate(body), { status: 201 });
}

async function updateCandidate(
  workspaceId: string,
  suffix: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const match = /^\/candidates\/([0-9a-f-]{36})\/(apply|reject)$/iu.exec(suffix);
  if (!match?.[1] || !match[2]) return jsonError("Candidate route not found", 404);
  if (match[2] === "reject") return Response.json(await room.rejectCandidate(match[1]));
  const result = await room.applyCandidate(workspaceId, match[1]);
  return result.ok ? Response.json(result.snapshot) : jsonError(result.error, 409);
}

function portableResponse(body: string, contentType: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function safeFilename(value: string): string {
  const decoded = decodeURIComponent(value);
  const sanitized = decoded.replaceAll(/[\r\n"/\\]/gu, "-").trim();
  return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized || "paper"}.pdf`;
}

function workspaceStorageKey(identity: AuthIdentity, workspaceId: string): string {
  if (workspaceId !== "demo" || identity.ownerKey === localOwnerId) return workspaceId;
  return `${identity.ownerKey}:demo`;
}
