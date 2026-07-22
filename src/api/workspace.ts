import {
  isAddAnnotationFragmentInput,
  isCreateAnnotationInput,
  isCreateAnnotationLinkInput,
  isCreateCandidateInput,
  isCreateClaimCandidateInput,
  isCreateClaimPassageLinkInput,
  isCreateManuscriptCommentInput,
  isReanchorManuscriptCommentInput,
  isCreatePassageLinkInput,
  isCreatePublicationPdfLinkInput,
  isAcceptPublicationIntakeInput,
  isPreviewPublicationIntakeInput,
  isProjectPublicationProfile,
  isCreateWorkspaceInput,
  isImportBibliographyInput,
  isInviteWorkspaceMemberInput,
  isUpdateAnnotationInput,
  isUpdateAnnotationFragmentInput,
  isUpsertClaimInput,
  demoWorkspaceId,
  type PdfResource,
  type ProjectAsset,
  type WorkspaceRole,
} from "../domain/workspace";
import { normalizeProjectPath } from "../domain/project-files";
import { hasProjectImageSignature } from "../domain/project-image-signatures";
import { parseBibTeX } from "../domain/bibliography";
import {
  builtInProjectTemplate,
  isSaveProjectTemplateInput,
  projectTemplateSeed,
  type ProjectTemplateRecord,
} from "../domain/project-templates";
import { buildWorkspaceKnowledgeGraph, searchWorkspaceKnowledge } from "../domain/knowledge";
import { archivalSourceBundle, latexArchive, renderExportPdf } from "./export-artifacts";
import { assertExportable, buildExportBundle, ExportPipelineError } from "../domain/export-pipeline";
import { fetchCrossrefWork, fingerprintPublicationMetadata } from "../integrations/crossref";
import { ownerKeyForEmail, type AuthIdentity } from "../security/auth";
import { downloadR2Object } from "./r2-download";
import type { ProjectReferencePdf } from "../domain/reference-library";
import { handleGitHubWorkspaceSyncApi } from "./github-sync";
import { handleReviewStudyApi } from "./review-study";
import { ensureLegacyReviewResource, workspaceStorageKey } from "./reviews";

const maximumPdfBytes = 25 * 1024 * 1024;
const maximumImageBytes = 20 * 1024 * 1024;
const imageExtensions: Readonly<Record<ProjectAsset["mediaType"], readonly string[]>> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/svg+xml": [".svg"],
};

type DocumentRoomStub = DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>;
type WorkspaceAccessStub = DurableObjectStub<import("../durable-objects/workspace-access").WorkspaceAccess>;
type WorkspaceCatalogStub = DurableObjectStub<import("../durable-objects/workspace-catalog").WorkspaceCatalog>;

interface WorkspaceRouteContext {
  readonly request: Request;
  readonly url: URL;
  readonly suffix: string;
  readonly env: Env;
  readonly identity: AuthIdentity;
  readonly workspaceId: string;
  readonly workspaceTitle: string;
  readonly storageKey: string;
  readonly role: WorkspaceRole;
  readonly room: DocumentRoomStub;
  readonly access: WorkspaceAccessStub;
  readonly catalog: WorkspaceCatalogStub;
}

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
  const context = {
    request,
    url,
    suffix,
    env,
    identity,
    workspaceId,
    workspaceTitle: summary.title,
    storageKey,
    role,
    room,
    access,
    catalog,
  } satisfies WorkspaceRouteContext;

  try {
    if (suffix === "/github-sync" || suffix.startsWith("/github-sync/")) {
      if (role !== "owner") return jsonError("Only the workspace owner can synchronize GitHub", 403);
      return await handleGitHubWorkspaceSyncApi(request, env, identity, room, suffix);
    }
    if (suffix === "/review-study" || suffix.startsWith("/review-study/")) {
      const review = await ensureLegacyReviewResource(env, identity, workspaceId);
      if (!review) return jsonError("Review not found", 404);
      const activeLink = review.projectLink?.status === "active" ? review.projectLink : null;
      return await handleReviewStudyApi(
        request,
        review.study,
        identity,
        suffix,
        activeLink ? room : undefined,
        activeLink ? workspaceId : undefined,
        { reviewId: review.record.id, linkId: activeLink?.id ?? null, profile: review.record.profile },
      );
    }
    if (suffix === "/settings" && request.method === "PATCH") {
      if (role !== "owner") return jsonError("Only the workspace owner can change project settings", 403);
      return await updateWorkspaceSettings(request, workspaceId, room, access, catalog, env, identity.email);
    }
    if (suffix === "/duplicate" && request.method === "POST") {
      if (role !== "owner") return jsonError("Only the workspace owner can duplicate a project", 403);
      return await duplicateWorkspace(request, workspaceId, room, catalog, env, identity);
    }
    if (suffix === "/template" && request.method === "POST") {
      if (role !== "owner") return jsonError("Only the workspace owner can save project templates", 403);
      return await saveWorkspaceTemplate(request, workspaceId, room, env, identity);
    }
    if (suffix === "/settings" && request.method === "DELETE") {
      if (role !== "owner") return jsonError("Only the workspace owner can permanently delete a project", 403);
      return await permanentlyDeleteWorkspace(workspaceId, room, access, catalog, env, identity);
    }
    if (suffix === "/reviews" && request.method === "GET") {
      const links = await room.listReviewLinks(workspaceId);
      const reviews = await Promise.all(
        links.map(async (link) => {
          const review = await env.REVIEW_CATALOGS.getByName(identity.ownerKey).getReview(link.reviewId);
          const reviewRole = review ? await env.REVIEW_ACCESS.getByName(review.locator.storageKey).getRole(identity.email) : null;
          return {
            id: link.id,
            projectId: link.projectId,
            reviewId: link.reviewId,
            status: link.status,
            createdBy: link.createdBy,
            createdAt: link.createdAt,
            unlinkedBy: link.unlinkedBy,
            unlinkedAt: link.unlinkedAt,
            review: review && reviewRole ? { id: review.id, title: review.title, profile: review.profile, href: review.href } : null,
            permission: review && reviewRole ? "available" : "review-access-required",
          };
        }),
      );
      return Response.json(reviews, { headers: { "cache-control": "no-store" } });
    }
    if (suffix === "/" && request.method === "GET") {
      const library = await projectOwnerLibrary(env, access, identity.email);
      return Response.json(await refreshLinkedReferences(workspaceId, room, library));
    }
    if (suffix === "/search" && request.method === "GET") {
      const query = url.searchParams.get("q")?.slice(0, 200) ?? "";
      const [snapshot, members] = await Promise.all([room.getSnapshot(workspaceId), access.listMembers(identity.email)]);
      return Response.json(searchWorkspaceKnowledge(snapshot, query, members));
    }
    if (suffix === "/graph" && request.method === "GET") {
      const [snapshot, members] = await Promise.all([room.getSnapshot(workspaceId), access.listMembers(identity.email)]);
      return Response.json(buildWorkspaceKnowledgeGraph(snapshot, members));
    }
    if (suffix === "/socket" && request.method === "GET") return await room.fetch(request);
    if (suffix === "/members" && request.method === "GET") return Response.json(await access.listMembers(identity.email));
    if (suffix === "/members" && request.method === "POST") {
      return await inviteWorkspaceMember(request, env, identity, workspaceId, summary.title, access);
    }
    const shareResponse = await handleWorkspaceShareRoutes(context);
    if (shareResponse) return shareResponse;
    const resourceResponse = await handleWorkspaceResourceRoutes(context);
    if (resourceResponse) return resourceResponse;
    const annotationRouteResponse = await handleWorkspaceAnnotationRoutes(context);
    if (annotationRouteResponse) return annotationRouteResponse;
    const researchResponse = await handleWorkspaceResearchRoutes(context);
    if (researchResponse) return researchResponse;
    const publicationResponse = await handleWorkspacePublicationRoutes(context);
    if (publicationResponse) return publicationResponse;
    const evidenceResponse = await handleWorkspaceEvidenceRoutes(context);
    if (evidenceResponse) return evidenceResponse;
    if (suffix === "/history" && request.method === "GET") return Response.json(await room.listRevisions());
    if (suffix === "/history/compare" && request.method === "GET") {
      const from = revisionParameter(url.searchParams.get("from"));
      const to = revisionParameter(url.searchParams.get("to"));
      if (from === null || to === null) return jsonError("Invalid project revision comparison", 400);
      return Response.json(await room.compareRevisions(from, to));
    }
    if (suffix.startsWith("/history/")) {
      return await handleProjectHistory(request, suffix, workspaceId, env, identity, role, room, catalog);
    }
    if (suffix.startsWith("/export/") && request.method === "GET") return await exportWorkspace(suffix, workspaceId, room, env);
    return jsonError("Route not found", 404);
  } catch (error) {
    if (error instanceof ExportPipelineError) {
      return Response.json(
        { error: error.message, diagnostics: error.diagnostics },
        { status: 422, headers: { "cache-control": "no-store" } },
      );
    }
    const message = error instanceof Error ? error.message : "Workspace operation failed";
    const status = /access denied|only the workspace owner/iu.test(message)
      ? 403
      : /already exists|ambiguous|changed|stale|pending|remove citations|inbound include|dependencies|revision conflict|frozen protocol/iu.test(
            message,
          )
        ? 409
        : 400;
    return jsonError(message, status);
  }
}

async function handleWorkspaceShareRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const readOnlyResponse = await handleWorkspaceReadOnlyShareRoute(context);
  if (readOnlyResponse) return readOnlyResponse;
  return await handleWorkspaceEditShareRoute(context);
}

async function handleWorkspaceReadOnlyShareRoute(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, role, workspaceId, storageKey, catalog, env, room } = context;
  if (suffix !== "/share-link" || !["GET", "POST", "DELETE"].includes(request.method)) return null;
  if (role !== "owner") return jsonError("Only the workspace owner can manage read-only links", 403);
  const locator = await catalog.getOrCreateShareLocator(workspaceId);
  const shareAccess = env.WORKSPACE_ACCESS.getByName(locator);
  if (request.method === "GET") {
    return shareLinkStatusResponse(await shareAccess.getMappedReadOnlyShareStatus(), `/share/${locator}.`);
  }
  if (request.method === "POST") {
    const share = await shareAccess.createMappedReadOnlyShare(storageKey, workspaceId);
    await room.disconnectReadOnlySockets();
    return Response.json(
      { href: `/share/${locator}.${share.token}`, createdAt: share.createdAt },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  }
  await shareAccess.revokeMappedReadOnlyShare();
  await room.disconnectReadOnlySockets();
  return new Response(null, { status: 204 });
}

async function handleWorkspaceEditShareRoute(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, role, workspaceId, storageKey, catalog, env, room } = context;
  if (suffix !== "/edit-link" || !["GET", "POST", "DELETE"].includes(request.method)) return null;
  if (role !== "owner") return jsonError("Only the workspace owner can manage edit links", 403);
  const locator = await catalog.getOrCreateShareLocator(workspaceId);
  const shareAccess = env.WORKSPACE_ACCESS.getByName(locator);
  if (request.method === "GET") {
    return shareLinkStatusResponse(await shareAccess.getMappedEditShareStatus(), `/edit/${locator}.`);
  }
  if (request.method === "POST") {
    const share = await shareAccess.createMappedEditShare(storageKey, workspaceId);
    await room.disconnectEditPresenceSockets();
    return Response.json(
      { href: `/edit/${locator}.${share.token}`, createdAt: share.createdAt },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  }
  await shareAccess.revokeMappedEditShare();
  await room.disconnectEditPresenceSockets();
  return new Response(null, { status: 204 });
}

async function handleWorkspaceResourceRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const pdfResponse = await handleWorkspacePdfRoutes(context);
  if (pdfResponse) return pdfResponse;
  const assetResponse = await handleWorkspaceAssetRoutes(context);
  if (assetResponse) return assetResponse;
  const fileResponse = await handleWorkspaceFileRoutes(context);
  if (fileResponse) return fileResponse;
  return await handleWorkspaceFolderRoutes(context);
}

async function handleWorkspacePdfRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const projectPdfResponse = await handleWorkspaceProjectPdfRoutes(context);
  if (projectPdfResponse) return projectPdfResponse;
  return await handleWorkspaceReferencePdfRoutes(context);
}

async function handleWorkspaceProjectPdfRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, storageKey, env, room } = context;
  if (suffix === "/pdfs" && request.method === "POST") return await uploadPdf(request, storageKey, env, room);
  if (!suffix.startsWith("/pdfs/")) return null;
  const artifactId = suffix.slice("/pdfs/".length);
  if (request.method === "GET") return await downloadPdf(request, storageKey, artifactId, env);
  if (request.method === "DELETE") return await deletePdf(storageKey, artifactId, env, room);
  return null;
}

async function handleWorkspaceReferencePdfRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, workspaceId, identity, env, access, room } = context;
  if (request.method !== "GET" || (suffix !== "/reference-pdfs" && !suffix.startsWith("/reference-pdfs/"))) return null;
  const library = await projectOwnerLibrary(env, access, identity.email);
  if (suffix === "/reference-pdfs") {
    return Response.json(await listProjectReferencePdfs(workspaceId, room, library), {
      headers: { "cache-control": "private, no-store" },
    });
  }
  return await downloadProjectReferencePdf(request, workspaceId, suffix.slice("/reference-pdfs/".length), env, room, library);
}

async function handleWorkspaceAssetRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, workspaceId, storageKey, env, room } = context;
  if (suffix === "/assets" && request.method === "POST") {
    return await uploadProjectAsset(request, workspaceId, storageKey, env, room);
  }
  if (!suffix.startsWith("/assets/")) return null;
  const assetId = suffix.slice("/assets/".length);
  if (request.method === "GET") return await downloadProjectAsset(assetId, env, room);
  if (request.method === "DELETE") return await deleteProjectAsset(workspaceId, assetId, env, room);
  return null;
}

async function handleWorkspaceFileRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, workspaceId, room } = context;
  if (suffix === "/files" && request.method === "POST") return await createProjectFile(request, workspaceId, room);
  if (suffix.startsWith("/files/") && (request.method === "PATCH" || request.method === "DELETE")) {
    return await mutateProjectFile(request, workspaceId, suffix, room);
  }
  return null;
}

async function handleWorkspaceFolderRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, workspaceId, room } = context;
  if (suffix === "/folders" && request.method === "POST") return await createProjectFolder(request, workspaceId, room);
  if (suffix.startsWith("/folders/") && (request.method === "PATCH" || request.method === "DELETE")) {
    return await mutateProjectFolder(request, workspaceId, suffix, room);
  }
  return null;
}

async function handleWorkspaceAnnotationRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, room } = context;
  if (suffix === "/annotations" && request.method === "POST") return await createAnnotation(request, room);
  if (suffix.startsWith("/annotations/") && ["POST", "PUT", "DELETE"].includes(request.method)) {
    return await mutateAnnotation(request, suffix, room);
  }
  if (suffix === "/annotation-links" && request.method === "POST") return await createAnnotationLink(request, room);
  return null;
}

async function handleWorkspaceResearchRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const bibliographyResponse = await handleWorkspaceBibliographyImportRoute(context);
  if (bibliographyResponse) return bibliographyResponse;
  const referenceResponse = await handleWorkspaceReferenceRoutes(context);
  if (referenceResponse) return referenceResponse;
  return await handleWorkspaceResearchShareRoutes(context);
}

async function handleWorkspaceBibliographyImportRoute(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, role, workspaceId, identity, env, access, room } = context;
  if (suffix !== "/bibliography/import" || request.method !== "POST") return null;
  if (role !== "owner") return jsonError("Only the workspace owner can import into the shared library", 403);
  const library = await projectOwnerLibrary(env, access, identity.email);
  return await importBibliography(request, workspaceId, identity.email, room, library);
}

async function handleWorkspaceReferenceRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, role, workspaceId, identity, env, access, room } = context;
  if (suffix === "/references" && request.method === "POST") {
    if (role !== "owner") return jsonError("Only the workspace owner can link private library references", 403);
    const library = await projectOwnerLibrary(env, access, identity.email);
    return await linkProjectReference(request, workspaceId, room, library);
  }
  if (!suffix.startsWith("/references/") || !["PATCH", "POST", "DELETE"].includes(request.method)) return null;
  if (role !== "owner") return jsonError("Only the workspace owner can manage project references", 403);
  const library = await projectOwnerLibrary(env, access, identity.email);
  return await mutateProjectReference(request, workspaceId, suffix, room, library);
}

async function handleWorkspaceResearchShareRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, role, workspaceId, identity, env, access, room } = context;
  if (suffix === "/research-shares" && request.method === "POST") {
    if (role !== "owner") return jsonError("Only the workspace owner can share private research", 403);
    const library = await projectOwnerLibrary(env, access, identity.email);
    return await sharePrivateResearch(request, workspaceId, room, library);
  }
  if (!suffix.startsWith("/research-shares/") || !["DELETE", "GET"].includes(request.method)) return null;
  const library = await projectOwnerLibrary(env, access, identity.email);
  return await accessSharedResearch(request, workspaceId, suffix, env, room, library, role);
}

async function handleWorkspacePublicationRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const intakeResponse = await handleWorkspacePublicationIntakeRoutes(context);
  if (intakeResponse) return intakeResponse;
  const pdfLinkResponse = await handleWorkspacePublicationPdfLinkRoutes(context);
  if (pdfLinkResponse) return pdfLinkResponse;
  return await handleWorkspacePublicationEnrichmentRoute(context);
}

async function handleWorkspacePublicationIntakeRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, env, room } = context;
  if (request.method !== "POST") return null;
  if (suffix === "/publication-intake/preview") return await previewPublicationIntake(request, env, room);
  if (suffix === "/publication-intake/accept") return await acceptPublicationIntake(request, env, room);
  return null;
}

async function handleWorkspacePublicationPdfLinkRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, room } = context;
  if (suffix === "/publication-pdf-links" && request.method === "POST") return await createPublicationPdfLink(request, room);
  if (suffix.startsWith("/publication-pdf-links/") && request.method === "DELETE") {
    return await deletePublicationPdfLink(suffix, room);
  }
  return null;
}

async function handleWorkspacePublicationEnrichmentRoute(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, workspaceId, env, room } = context;
  if (!suffix.startsWith("/publications/") || request.method !== "POST") return null;
  return await enrichPublication(workspaceId, suffix, env, room);
}

async function handleWorkspaceEvidenceRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const claimResponse = await handleWorkspaceClaimRoutes(context);
  if (claimResponse) return claimResponse;
  const commentResponse = await handleWorkspaceCommentRoutes(context);
  if (commentResponse) return commentResponse;
  return await handleWorkspaceCandidateRoutes(context);
}

async function handleWorkspaceClaimRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const passageLinkResponse = await handleWorkspacePassageLinkRoutes(context);
  if (passageLinkResponse) return passageLinkResponse;
  return await handleWorkspaceClaimMutationRoutes(context);
}

async function handleWorkspacePassageLinkRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, room } = context;
  if (request.method !== "POST") return null;
  if (suffix === "/links") return await createPassageLink(request, room);
  if (suffix === "/claim-links") return await createClaimPassageLink(request, room);
  return null;
}

async function handleWorkspaceClaimMutationRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, room } = context;
  if (suffix === "/claims" && request.method === "POST") return await createClaim(request, room);
  if (suffix.startsWith("/claims/") && ["PUT", "DELETE"].includes(request.method)) {
    return await mutateClaim(request, suffix, room);
  }
  return null;
}

async function handleWorkspaceCommentRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, identity, access, room } = context;
  if (suffix === "/comments" && request.method === "POST") {
    const member = (await access.listMembers(identity.email)).find((candidate) => candidate.email === identity.email);
    if (!member) return jsonError("Workspace member is unavailable", 403);
    return await createManuscriptComment(request, room, member.id, member.email);
  }
  if (suffix.startsWith("/comments/") && request.method === "POST") return await mutateManuscriptComment(request, suffix, room);
  return null;
}

async function handleWorkspaceCandidateRoutes(context: WorkspaceRouteContext): Promise<Response | null> {
  const { request, suffix, workspaceId, room } = context;
  if (request.method !== "POST") return null;
  if (suffix === "/candidates") return await createCandidate(request, room);
  if (suffix === "/claim-candidates") return await createClaimCandidate(request, room);
  if (suffix.startsWith("/candidates/")) return await updateCandidate(workspaceId, suffix, room);
  return null;
}

async function updateWorkspaceSettings(
  request: Request,
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  access: DurableObjectStub<import("../durable-objects/workspace-access").WorkspaceAccess>,
  catalog: DurableObjectStub<import("../durable-objects/workspace-catalog").WorkspaceCatalog>,
  env: Env,
  requesterEmail: string,
): Promise<Response> {
  if (workspaceId === demoWorkspaceId) return jsonError("The demo project cannot be changed", 409);
  const body: unknown = await request.json();
  if (!isRecord(body)) return jsonError("Invalid project settings", 400);
  const title = body.title === undefined ? null : typeof body.title === "string" ? body.title.trim() : "";
  const archived = body.archived === undefined ? null : typeof body.archived === "boolean" ? body.archived : undefined;
  const publicationProfile = body.publicationProfile === undefined ? null : body.publicationProfile;
  const entryFileId = body.entryFileId === undefined ? null : typeof body.entryFileId === "string" ? body.entryFileId : "";
  if (
    (title !== null && (!title || title.length > 120)) ||
    archived === undefined ||
    (entryFileId !== null && (!entryFileId || entryFileId.length > 128)) ||
    (publicationProfile !== null && !isProjectPublicationProfile(publicationProfile))
  )
    return jsonError("Invalid project settings", 400);
  if (title !== null) await room.renameWorkspace(title);
  if (publicationProfile !== null) await room.updatePublicationProfile(publicationProfile);
  if (entryFileId !== null) await room.setProjectEntryFile(workspaceId, entryFileId);
  const members = await access.listMembers(requesterEmail);
  let result = await catalog.updateWorkspace(workspaceId, title, archived);
  for (const member of members) {
    const memberCatalog = env.WORKSPACE_CATALOGS.getByName(await ownerKeyForEmail(member.email));
    result = await memberCatalog.updateWorkspace(workspaceId, title, archived);
  }
  return Response.json(result);
}

async function duplicateWorkspace(
  request: Request,
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  catalog: DurableObjectStub<import("../durable-objects/workspace-catalog").WorkspaceCatalog>,
  env: Env,
  identity: AuthIdentity,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.title !== "string" || !body.title.trim() || body.title.length > 120)
    return jsonError("Invalid duplicate title", 400);
  const id = crypto.randomUUID();
  const storageKey = workspaceStorageKey(identity, id);
  const snapshot = await room.getSnapshot(workspaceId);
  const copiedAssets: Array<{ id: string; objectKey: string; fingerprint: string; updatedAt: string }> = [];
  for (const asset of snapshot.assets) {
    const source = await env.PAPERS.get(asset.objectKey);
    if (!source) throw new Error(`Project image is unavailable: ${asset.path}`);
    const objectKey = `${storageKey}/assets/${asset.id}`;
    const stored = await env.PAPERS.put(objectKey, source.body, { httpMetadata: { contentType: asset.mediaType } });
    copiedAssets.push({
      id: asset.id,
      objectKey,
      fingerprint: `r2-etag:${stored.etag.replaceAll('"', "")}`,
      updatedAt: new Date().toISOString(),
    });
  }
  await env.WORKSPACE_ACCESS.getByName(storageKey).initializeOwner(identity.email);
  const duplicate = env.DOCUMENT_ROOMS.getByName(storageKey);
  await duplicate.seedFromRevision(id, body.title.trim(), await room.getHeadRevisionSeed());
  if (copiedAssets.length > 0) await duplicate.replaceProjectAssetObjects(id, copiedAssets);
  return Response.json(await catalog.registerWorkspace(id, body.title.trim()), { status: 201 });
}

async function saveWorkspaceTemplate(
  request: Request,
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  env: Env,
  identity: AuthIdentity,
): Promise<Response> {
  if (workspaceId === demoWorkspaceId) return jsonError("The demo project cannot become a personal template", 409);
  const body: unknown = await request.json();
  if (!isSaveProjectTemplateInput(body)) return jsonError("Invalid project template", 400);
  const snapshot = await room.getSnapshot(workspaceId);
  const catalog = env.PROJECT_TEMPLATE_CATALOGS.getByName(identity.ownerKey);
  const summary = await catalog.saveTemplate({
    ...(body.templateId ? { id: body.templateId } : {}),
    name: body.name,
    description: body.description ?? "",
    seed: projectTemplateSeed(snapshot),
  });
  return Response.json(summary, { status: body.templateId ? 200 : 201 });
}

async function permanentlyDeleteWorkspace(
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  access: DurableObjectStub<import("../durable-objects/workspace-access").WorkspaceAccess>,
  catalog: DurableObjectStub<import("../durable-objects/workspace-catalog").WorkspaceCatalog>,
  env: Env,
  identity: AuthIdentity,
): Promise<Response> {
  if (workspaceId === demoWorkspaceId) return jsonError("The demo project cannot be deleted", 409);
  await ensureLegacyReviewResource(env, identity, workspaceId, true);
  const [snapshot, members, reviewLinks] = await Promise.all([
    room.getSnapshot(workspaceId),
    access.listMembers(identity.email),
    room.listReviewLinks(workspaceId),
  ]);
  const library = await projectOwnerLibrary(env, access, identity.email);
  for (const reference of snapshot.projectReferences) await library.unregisterProjectDependency(workspaceId, reference.referenceId);
  let cursor: string | undefined;
  do {
    const page = await env.PAPERS.list({ prefix: `${workspaceStorageKey(identity, workspaceId)}/`, ...(cursor ? { cursor } : {}) });
    if (page.objects.length) await env.PAPERS.delete(page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const locator = await catalog.getOrCreateShareLocator(workspaceId);
  const publicAccess = env.WORKSPACE_ACCESS.getByName(locator);
  await Promise.all([publicAccess.revokeMappedReadOnlyShare(), publicAccess.revokeMappedEditShare()]);
  for (const link of reviewLinks) {
    if (link.status === "active") {
      await env.REVIEW_ACCESS.getByName(link.reviewAccessLocator).unlinkProjectsForDeletedWorkspace(workspaceId, identity.email);
    }
  }
  for (const member of members) await env.WORKSPACE_CATALOGS.getByName(await ownerKeyForEmail(member.email)).removeWorkspace(workspaceId);
  await room.deleteWorkspaceData();
  await access.deleteWorkspaceAccess(identity.email);
  await catalog.removeWorkspace(workspaceId);
  return new Response(null, { status: 204 });
}

async function exportWorkspace(
  suffix: string,
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  env: Env,
): Promise<Response> {
  const snapshot = await room.getSnapshot(workspaceId);
  const bundle = buildExportBundle({
    title: snapshot.title,
    files: snapshot.files,
    entryFileId: snapshot.entryFileId,
    bibliography: snapshot.bibliography,
    publicationProfile: snapshot.publicationProfile,
    reviewArtifactPins: snapshot.reviewArtifactPins,
  });
  if (suffix === "/export/statistics.json") return privateJsonResponse(bundle.intermediate.statistics);
  if (suffix === "/export/diagnostics.json") return privateJsonResponse(bundle.intermediate.diagnostics);
  if (suffix === "/export/intermediate.json") return privateJsonResponse(bundle.intermediate, "kirjolab-intermediate.json");
  if (suffix === "/export/source.zip") {
    const { files: _files, composition: _composition, source: _source, candidates: _candidates, ...metadata } = snapshot;
    const binaryFiles: Record<string, Uint8Array> = {};
    for (const asset of snapshot.assets) {
      const object = await env.PAPERS.get(asset.objectKey);
      if (!object) throw new Error(`Project image is unavailable: ${asset.path}`);
      binaryFiles[asset.path] = new Uint8Array(await object.arrayBuffer());
    }
    return binaryDownload(archivalSourceBundle(bundle, snapshot.files, metadata, binaryFiles), "application/zip", "kirjolab-source.zip");
  }
  assertExportable(bundle.intermediate);
  if (suffix === "/export/document.md") {
    return portableResponse(bundle.intermediate.markdown, "text/markdown; charset=utf-8", "kirjolab-document.md");
  }
  if (suffix === "/export/bibliography.bib") {
    return portableResponse(bundle.bibliography, "application/x-bibtex; charset=utf-8", "bibliography.bib");
  }
  if (suffix === "/export/latex.zip") return binaryDownload(latexArchive(bundle), "application/zip", "kirjolab-latex.zip");
  if (suffix === "/export/document.pdf") {
    return binaryDownload(await renderExportPdf(bundle), "application/pdf", "kirjolab-document.pdf");
  }
  return jsonError("Export route not found", 404);
}

async function handleProjectHistory(
  request: Request,
  suffix: string,
  workspaceId: string,
  env: Env,
  identity: AuthIdentity,
  role: "owner" | "member",
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  catalog: DurableObjectStub<import("../durable-objects/workspace-catalog").WorkspaceCatalog>,
): Promise<Response> {
  const match = /^\/history\/(\d+)(?:\/(milestones|restore|seed))?$/u.exec(suffix);
  const revision = revisionParameter(match?.[1] ?? null);
  if (revision === null) return jsonError("Project revision route not found", 404);
  const action = match?.[2];
  if (!action && request.method === "GET") return Response.json(await room.getRevision(revision));
  if (role !== "owner") return jsonError("Only the workspace owner can manage project history", 403);
  if (action === "milestones" && request.method === "POST") {
    const body: unknown = await request.json();
    if (
      !isRecord(body) ||
      typeof body.name !== "string" ||
      body.name.trim().length === 0 ||
      body.name.length > 120 ||
      (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 2_000))
    ) {
      return jsonError("Invalid project milestone", 400);
    }
    return Response.json(await room.createMilestone(revision, body.name, body.description ?? ""), { status: 201 });
  }
  if (action === "restore" && request.method === "POST") {
    const snapshot = await room.restoreRevision(workspaceId, revision);
    await catalog.registerWorkspace(workspaceId, snapshot.title);
    return Response.json(snapshot);
  }
  if (action === "seed" && request.method === "POST") {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.title !== "string" || !body.title.trim() || body.title.length > 120) {
      return jsonError("Invalid workspace seed", 400);
    }
    const id = crypto.randomUUID();
    const title = body.title.trim();
    const storageKey = workspaceStorageKey(identity, id);
    const access = env.WORKSPACE_ACCESS.getByName(storageKey);
    await access.initializeOwner(identity.email);
    const target = env.DOCUMENT_ROOMS.getByName(storageKey);
    await target.seedFromRevision(id, title, await room.getRevisionSeed(revision));
    return Response.json(await catalog.registerWorkspace(id, title), { status: 201 });
  }
  return jsonError("Project revision route not found", 404);
}

function revisionParameter(value: string | null): number | null {
  if (!value || !/^\d{1,10}$/u.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

async function createProjectFile(
  request: Request,
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.path !== "string" || body.path.length > 1_024) return jsonError("Invalid project file", 400);
  if (body.content !== undefined && (typeof body.content !== "string" || body.content.length > 2_000_000)) {
    return jsonError("Invalid project file", 400);
  }
  return Response.json(await room.createProjectFile(workspaceId, body.path, body.content ?? ""), { status: 201 });
}

async function mutateProjectFile(
  request: Request,
  workspaceId: string,
  suffix: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const match = /^\/files\/([0-9a-f-]{36})$/iu.exec(suffix);
  if (!match?.[1]) return jsonError("Project file route not found", 404);
  if (request.method === "DELETE") return Response.json(await room.deleteProjectFile(workspaceId, match[1]));
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.path !== "string" || body.path.length > 1_024) return jsonError("Invalid project file", 400);
  return Response.json(await room.renameProjectFile(workspaceId, match[1], body.path));
}

async function createProjectFolder(
  request: Request,
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.path !== "string" || body.path.length > 1_024) return jsonError("Invalid project folder", 400);
  return Response.json(await room.createProjectFolder(workspaceId, body.path), { status: 201 });
}

async function mutateProjectFolder(
  request: Request,
  workspaceId: string,
  suffix: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const match = /^\/folders\/([0-9a-f-]{36})$/iu.exec(suffix);
  if (!match?.[1]) return jsonError("Project folder route not found", 404);
  if (request.method === "DELETE") return Response.json(await room.deleteProjectFolder(workspaceId, match[1]));
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.path !== "string" || body.path.length > 1_024) return jsonError("Invalid project folder", 400);
  return Response.json(await room.renameProjectFolder(workspaceId, match[1], body.path));
}

async function handleWorkspaceCatalog(request: Request, env: Env, identity: AuthIdentity): Promise<Response> {
  const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
  if (request.method === "GET") return Response.json(await catalog.listWorkspaces());
  if (request.method !== "POST") return jsonError("Route not found", 404);
  const body: unknown = await request.json();
  if (!isCreateWorkspaceInput(body)) return jsonError("Invalid workspace", 400);
  let template: ProjectTemplateRecord | null = null;
  if (body.templateId && body.templateId !== "builtin-guided") {
    template =
      builtInProjectTemplate(body.templateId) ??
      (await env.PROJECT_TEMPLATE_CATALOGS.getByName(identity.ownerKey).getTemplate(body.templateId));
    if (!template) return jsonError("Project template not found", 404);
  }
  const id = crypto.randomUUID();
  const storageKey = workspaceStorageKey(identity, id);
  const access = env.WORKSPACE_ACCESS.getByName(storageKey);
  await access.initializeOwner(identity.email);
  const room = env.DOCUMENT_ROOMS.getByName(storageKey);
  if (template) await room.seedFromTemplate(id, body.title.trim(), template.seed);
  else await room.initializeWorkspace(body.title.trim());
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

async function downloadPdf(request: Request, workspaceId: string, pdfId: string, env: Env): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/iu.test(pdfId)) return jsonError("PDF not found", 404);
  return (
    (await downloadR2Object(request, env.PAPERS, `${workspaceId}/${pdfId}.pdf`, {
      cacheControl: "private, max-age=300",
      contentDisposition: "inline",
    })) ?? jsonError("PDF not found", 404)
  );
}

async function deletePdf(
  workspaceId: string,
  pdfId: string,
  env: Env,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/iu.test(pdfId)) return jsonError("PDF not found", 404);
  const pdf = await room.deletePdf(pdfId);
  await env.PAPERS.delete(pdf.objectKey || `${workspaceId}/${pdfId}.pdf`);
  return new Response(null, { status: 204 });
}

async function uploadProjectAsset(
  request: Request,
  workspaceId: string,
  storageKey: string,
  env: Env,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
  if (!isProjectImageMediaType(mediaType)) return jsonError("Only PNG, JPEG, GIF, WebP, AVIF, and SVG images are supported", 415);
  if (!request.body) return jsonError("Image body is required", 400);
  const size = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isSafeInteger(size) || size <= 0) return jsonError("Content-Length is required", 411);
  if (size > maximumImageBytes) return jsonError("Image exceeds the 20 MB limit", 413);
  const rawPath = decodeURIComponent(request.headers.get("x-file-path") ?? "");
  const path = normalizeProjectPath(rawPath);
  if (!path || path !== rawPath.trim() || !path.startsWith("figures/") || /[<>]/u.test(path)) {
    return jsonError("Images require a relative figures/ path", 400);
  }
  const lowerPath = path.toLocaleLowerCase();
  if (!imageExtensions[mediaType].some((extension) => lowerPath.endsWith(extension))) {
    return jsonError("Image filename extension does not match its media type", 415);
  }

  const id = crypto.randomUUID();
  const objectKey = `${storageKey}/assets/${id}`;
  const fixedLengthBody = new FixedLengthStream(size);
  const upload = env.PAPERS.put(objectKey, fixedLengthBody.readable, { httpMetadata: { contentType: mediaType } });
  const pipeline = request.body.pipeTo(fixedLengthBody.writable);
  const [stored] = await Promise.all([upload, pipeline]);
  const validationObject =
    mediaType === "image/svg+xml"
      ? await env.PAPERS.get(objectKey)
      : await env.PAPERS.get(objectKey, { range: { offset: 0, length: Math.min(size, 16) } });
  const validationBytes = validationObject ? new Uint8Array(await validationObject.arrayBuffer()) : new Uint8Array();
  if (!hasProjectImageSignature(mediaType, validationBytes)) {
    await env.PAPERS.delete(objectKey);
    return jsonError("Image bytes do not match the declared media type", 415);
  }
  const now = new Date().toISOString();
  const asset: ProjectAsset = {
    id,
    path,
    mediaType,
    size,
    objectKey,
    fingerprint: `r2-etag:${stored.etag.replaceAll('"', "")}`,
    createdAt: now,
    updatedAt: now,
  };
  try {
    return Response.json(await room.registerProjectAsset(workspaceId, asset), { status: 201 });
  } catch (error) {
    await env.PAPERS.delete(objectKey);
    throw error;
  }
}

async function downloadProjectAsset(
  assetId: string,
  env: Env,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/iu.test(assetId)) return jsonError("Project image not found", 404);
  const asset = await room.getProjectAsset(assetId);
  const object = await env.PAPERS.get(asset.objectKey);
  if (!object) return jsonError("Project image not found", 404);
  const headers = new Headers({
    "content-type": asset.mediaType,
    "content-length": String(asset.size),
    "content-disposition": "inline",
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
    etag: object.httpEtag,
  });
  headers.set("cross-origin-resource-policy", "same-origin");
  if (asset.mediaType === "image/svg+xml") {
    headers.set("content-security-policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  }
  return new Response(object.body, { headers });
}

async function deleteProjectAsset(
  workspaceId: string,
  assetId: string,
  env: Env,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/iu.test(assetId)) return jsonError("Project image not found", 404);
  const asset = await room.getProjectAsset(assetId);
  const snapshot = await room.deleteProjectAsset(workspaceId, assetId);
  await env.PAPERS.delete(asset.objectKey);
  return Response.json(snapshot);
}

function isProjectImageMediaType(value: string): value is ProjectAsset["mediaType"] {
  return Object.hasOwn(imageExtensions, value);
}

async function createAnnotation(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreateAnnotationInput(body)) return jsonError("Invalid annotation", 400);
  return Response.json(await room.createAnnotation(body), { status: 201 });
}

async function mutateAnnotation(
  request: Request,
  suffix: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const fragmentMatch = /^\/annotations\/([0-9a-f-]{36})\/fragments(?:\/([0-9a-f-]{36}|legacy-[0-9a-f-]{36}))?$/iu.exec(suffix);
  if (fragmentMatch?.[1]) {
    if (request.method === "POST" && !fragmentMatch[2]) {
      const body: unknown = await request.json();
      if (!isAddAnnotationFragmentInput(body)) return jsonError("Invalid highlight fragment", 400);
      return Response.json(await room.appendAnnotationFragment(fragmentMatch[1], body), { status: 201 });
    }
    if (request.method === "DELETE" && fragmentMatch[2]) {
      const annotation = await room.removeAnnotationFragment(fragmentMatch[1], fragmentMatch[2]);
      return annotation ? Response.json(annotation) : new Response(null, { status: 204 });
    }
    if (request.method === "PUT" && fragmentMatch[2] && !fragmentMatch[2].startsWith("legacy-")) {
      const body: unknown = await request.json();
      if (!isUpdateAnnotationFragmentInput(body)) return jsonError("Invalid highlight fragment", 400);
      return Response.json(await room.updateAnnotationFragment(fragmentMatch[1], fragmentMatch[2], body));
    }
    return jsonError("Highlight fragment route not found", 404);
  }
  const annotationMatch = /^\/annotations\/([0-9a-f-]{36})$/iu.exec(suffix);
  if (!annotationMatch?.[1]) return jsonError("Highlight route not found", 404);
  if (request.method === "PUT") {
    const body: unknown = await request.json();
    if (!isUpdateAnnotationInput(body)) return jsonError("Invalid highlight", 400);
    return Response.json(await room.updateAnnotation(annotationMatch[1], body));
  }
  if (request.method === "DELETE") {
    await room.deleteAnnotation(annotationMatch[1]);
    return new Response(null, { status: 204 });
  }
  return jsonError("Highlight route not found", 404);
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
  actor: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  library: DurableObjectStub<import("../durable-objects/reference-library").ReferenceLibrary>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isImportBibliographyInput(body)) return jsonError("Invalid BibTeX import", 400);
  if (parseBibTeX(body.bibtex).length === 0) return jsonError("No valid BibTeX entries found", 400);
  const imported = await library.importBibTeX(body.bibtex, actor);
  let snapshot = await room.getSnapshot(workspaceId);
  const aliases = new Set(snapshot.projectReferences.map((link) => link.citationAlias.toLocaleLowerCase()));
  for (const item of imported) {
    if (snapshot.projectReferences.some((link) => link.referenceId === item.reference.id)) continue;
    if (aliases.has(item.suggestedAlias.toLocaleLowerCase())) throw new Error(`Citation alias already exists: ${item.suggestedAlias}`);
    aliases.add(item.suggestedAlias.toLocaleLowerCase());
  }
  for (const item of imported) {
    if (snapshot.projectReferences.some((link) => link.referenceId === item.reference.id)) {
      snapshot = await room.syncProjectReference(workspaceId, item.reference);
      continue;
    }
    snapshot = await room.linkProjectReference(workspaceId, item.reference, item.suggestedAlias);
    await library.registerProjectDependency(workspaceId, item.reference.id);
  }
  return Response.json(snapshot);
}

async function linkProjectReference(
  request: Request,
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  library: DurableObjectStub<import("../durable-objects/reference-library").ReferenceLibrary>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.referenceId !== "string" || typeof body.citationAlias !== "string") {
    return jsonError("Invalid project reference", 400);
  }
  const reference = (await library.getReferences([body.referenceId]))[0];
  if (!reference) return jsonError("Reference not found", 404);
  const webSnapshot = await library.getLatestWebSnapshot(reference.id);
  const snapshot = await room.linkProjectReference(workspaceId, reference, body.citationAlias, webSnapshot);
  await library.registerProjectDependency(workspaceId, reference.id);
  return Response.json(snapshot, { status: 201 });
}

async function mutateProjectReference(
  request: Request,
  workspaceId: string,
  suffix: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  library: DurableObjectStub<import("../durable-objects/reference-library").ReferenceLibrary>,
): Promise<Response> {
  const match = /^\/references\/([0-9a-f-]{36})(?:\/(sync|web-snapshot))?$/iu.exec(suffix);
  if (!match?.[1]) return jsonError("Project reference route not found", 404);
  const referenceId = match[1];
  if (request.method === "DELETE" && !match[2]) {
    const result = await room.unlinkProjectReference(workspaceId, referenceId);
    if (!result.ok) return jsonError(result.error, result.code === "citation-alias-in-use" ? 409 : 400);
    await library.unregisterProjectDependency(workspaceId, referenceId);
    return Response.json(result.value);
  }
  if (request.method === "POST" && match[2] === "sync") {
    const reference = (await library.getReferences([referenceId]))[0];
    if (!reference) return jsonError("Reference not found", 404);
    return Response.json(await room.syncProjectReference(workspaceId, reference));
  }
  if (request.method === "POST" && match[2] === "web-snapshot") {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.snapshotId !== "string") return jsonError("Invalid web snapshot pin", 400);
    const [reference, webSnapshot] = await Promise.all([
      library.getReferences([referenceId]).then((references) => references[0]),
      library.getWebSnapshot(body.snapshotId),
    ]);
    if (!reference) return jsonError("Reference not found", 404);
    if (webSnapshot.referenceId !== referenceId) return jsonError("Web snapshot does not belong to this reference", 409);
    return Response.json(await room.pinProjectWebSnapshot(workspaceId, reference, webSnapshot));
  }
  if (request.method === "PATCH" && !match[2]) {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.citationAlias !== "string") return jsonError("Invalid citation alias", 400);
    return Response.json(await room.renameProjectReferenceAlias(workspaceId, referenceId, body.citationAlias));
  }
  return jsonError("Project reference route not found", 404);
}

async function sharePrivateResearch(
  request: Request,
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  library: DurableObjectStub<import("../durable-objects/reference-library").ReferenceLibrary>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (
    !isRecord(body) ||
    typeof body.referenceId !== "string" ||
    typeof body.resourceId !== "string" ||
    (body.kind !== "note" && body.kind !== "highlight" && body.kind !== "web-snapshot")
  ) {
    return jsonError("Invalid private research share", 400);
  }
  const snapshot = await room.getSnapshot(workspaceId);
  if (!snapshot.projectReferences.some((link) => link.referenceId === body.referenceId)) {
    return jsonError("Link the bibliographic reference to the project before sharing research", 409);
  }
  const share = await library.shareResearch(workspaceId, body.referenceId, body.kind, body.resourceId);
  try {
    return Response.json(await room.pinResearchShare(workspaceId, share), { status: 201 });
  } catch (error) {
    await library.revokeResearchShare(share.id);
    throw error;
  }
}

async function listProjectReferencePdfs(
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  library: DurableObjectStub<import("../durable-objects/reference-library").ReferenceLibrary>,
): Promise<ProjectReferencePdf[]> {
  const [workspace, librarySnapshot] = await Promise.all([room.getSnapshot(workspaceId), library.getSnapshot(true)]);
  const linkedReferenceIds = new Set(workspace.projectReferences.map((link) => link.referenceId));
  return librarySnapshot.artifacts.flatMap((artifact) =>
    artifact.referenceId && linkedReferenceIds.has(artifact.referenceId)
      ? [
          {
            id: artifact.id,
            referenceId: artifact.referenceId,
            name: artifact.name,
            size: artifact.size,
            fingerprint: artifact.fingerprint,
          },
        ]
      : [],
  );
}

async function downloadProjectReferencePdf(
  request: Request,
  workspaceId: string,
  artifactId: string,
  env: Env,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  library: DurableObjectStub<import("../durable-objects/reference-library").ReferenceLibrary>,
): Promise<Response> {
  const [workspace, librarySnapshot] = await Promise.all([room.getSnapshot(workspaceId), library.getSnapshot(true)]);
  const artifact = librarySnapshot.artifacts.find((item) => item.id === artifactId);
  if (!artifact?.referenceId || !workspace.projectReferences.some((link) => link.referenceId === artifact.referenceId)) {
    return jsonError("Reference PDF not found", 404);
  }
  return (
    (await downloadR2Object(request, env.PAPERS, artifact.objectKey, {
      cacheControl: "private, no-store",
      contentDisposition: `inline; filename="${safeFilename(artifact.name)}"`,
    })) ?? jsonError("Reference PDF not found", 404)
  );
}

async function accessSharedResearch(
  request: Request,
  workspaceId: string,
  suffix: string,
  env: Env,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  library: DurableObjectStub<import("../durable-objects/reference-library").ReferenceLibrary>,
  role: import("../domain/workspace").WorkspaceRole,
): Promise<Response> {
  const match = /^\/research-shares\/([0-9a-f-]{36})(?:\/(content))?$/iu.exec(suffix);
  if (!match?.[1]) return jsonError("Research share route not found", 404);
  if (request.method === "DELETE" && !match[2]) {
    if (role !== "owner") return jsonError("Only the workspace owner can revoke private research", 403);
    const revoked = await library.revokeResearchShare(match[1]);
    return Response.json(await room.revokeResearchShare(workspaceId, match[1], revoked.revokedAt ?? new Date().toISOString()));
  }
  if (request.method === "GET" && match[2] === "content") {
    const share = await room.getActiveResearchShare(workspaceId, match[1]);
    if (share.content.kind === "web-snapshot") {
      const representation = new URL(request.url).searchParams.get("representation") === "raw" ? "raw" : "readable";
      const objectKey = representation === "raw" ? share.content.rawObjectKey : share.content.readableObjectKey;
      if (!objectKey) return jsonError(`Shared web ${representation} content is unavailable`, 404);
      const object = await env.PAPERS.get(objectKey);
      if (!object) return jsonError("Shared web snapshot is unavailable", 410);
      if (representation === "raw" && object.customMetadata?.contentHash !== share.content.contentHash) {
        return jsonError("Shared web snapshot no longer matches its captured fingerprint", 410);
      }
      const headers = new Headers({
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="web-snapshot-${share.content.snapshotId}.${representation === "raw" ? "bin" : "txt"}"`,
        "content-security-policy": "sandbox; default-src 'none'",
        "content-type": representation === "raw" ? "application/octet-stream" : "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
      });
      return new Response(object.body, { headers });
    }
    if (share.content.kind !== "artifact") return jsonError("Research share has no binary content", 400);
    const object = await env.PAPERS.get(share.content.objectKey);
    if (!object || `r2-etag:${object.etag.replaceAll('"', "")}` !== share.content.fingerprint) {
      return jsonError("Shared artifact is unavailable", 410);
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, no-store");
    headers.set("content-disposition", `inline; filename="${safeFilename(share.content.name)}"`);
    return new Response(object.body, { headers });
  }
  return jsonError("Research share route not found", 404);
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
  const result = await room.updateClaim(match[1], body);
  return result.ok ? Response.json(result.value) : jsonError(result.error, 400);
}

async function createClaimPassageLink(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreateClaimPassageLinkInput(body)) return jsonError("Invalid claim passage link", 400);
  return Response.json(await room.createClaimPassageLink(body), { status: 201 });
}

async function createManuscriptComment(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  authorId: string,
  authorLabel: string,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreateManuscriptCommentInput(body)) return jsonError("Invalid manuscript comment", 400);
  return Response.json(await room.createManuscriptComment(body, authorId, authorLabel), { status: 201 });
}

async function mutateManuscriptComment(
  request: Request,
  suffix: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const match = /^\/comments\/([0-9a-f-]{36})\/(resolve|reanchor)$/iu.exec(suffix);
  if (!match?.[1] || !match[2]) return jsonError("Manuscript comment route not found", 404);
  if (match[2] === "resolve") return Response.json(await room.resolveManuscriptComment(match[1]));
  const body: unknown = await request.json();
  if (!isReanchorManuscriptCommentInput(body)) return jsonError("Invalid manuscript comment anchor", 400);
  return Response.json(await room.reanchorManuscriptComment(match[1], body));
}

async function createCandidate(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreateCandidateInput(body)) return jsonError("Invalid model candidate", 400);
  const result = await room.createCandidate(body);
  if (result.ok) return Response.json(result.value, { status: 201 });
  return jsonError(result.error, result.code === "source-stale" || result.code === "evidence-stale" ? 409 : 400);
}

async function createClaimCandidate(
  request: Request,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isCreateClaimCandidateInput(body)) return jsonError("Invalid model claim candidate", 400);
  const result = await room.createClaimCandidate(body);
  if (result.ok) return Response.json(result.value, { status: 201 });
  return jsonError(result.error, result.code === "evidence-stale" ? 409 : 400);
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

function binaryDownload(body: Uint8Array, contentType: string, filename: string): Response {
  const bytes = new Uint8Array(body);
  return new Response(bytes, {
    headers: {
      "content-type": contentType,
      "content-length": String(bytes.byteLength),
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function privateJsonResponse(value: unknown, filename?: string): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (filename) headers.set("content-disposition", `attachment; filename="${filename}"`);
  return Response.json(value, { headers });
}

function shareLinkStatusResponse(status: import("../durable-objects/workspace-access").ReadOnlyShareStatus, hrefPrefix: string): Response {
  return Response.json(
    {
      active: status.active,
      createdAt: status.createdAt,
      href: status.token ? `${hrefPrefix}${status.token}` : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function safeFilename(value: string): string {
  const decoded = decodeURIComponent(value);
  const sanitized = decoded.replaceAll(/[\r\n"/\\]/gu, "-").trim();
  return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized || "paper"}.pdf`;
}

async function projectOwnerLibrary(
  env: Env,
  access: DurableObjectStub<import("../durable-objects/workspace-access").WorkspaceAccess>,
  requesterEmail: string,
): Promise<DurableObjectStub<import("../durable-objects/reference-library").ReferenceLibrary>> {
  const owner = (await access.listMembers(requesterEmail)).find((member) => member.role === "owner");
  if (!owner) throw new Error("Workspace owner is unavailable");
  return env.REFERENCE_LIBRARIES.getByName(await ownerKeyForEmail(owner.email));
}

async function refreshLinkedReferences(
  workspaceId: string,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  library: DurableObjectStub<import("../durable-objects/reference-library").ReferenceLibrary>,
) {
  let snapshot = await room.getSnapshot(workspaceId);
  if (snapshot.projectReferences.length === 0 && snapshot.bibliography.trim()) {
    const imported = await library.importBibTeX(snapshot.bibliography, "workspace migration");
    for (const item of imported) {
      snapshot = await room.linkProjectReference(workspaceId, item.reference, item.suggestedAlias);
      await library.registerProjectDependency(workspaceId, item.reference.id);
    }
  }
  if (snapshot.projectReferences.length === 0) return snapshot;
  const references = await library.getReferences(snapshot.projectReferences.map((link) => link.referenceId));
  for (const reference of references) {
    const link = snapshot.projectReferences.find((item) => item.referenceId === reference.id);
    if (link?.snapshot.webSnapshot) continue;
    if (!link || projectReferenceIsCurrent(link, reference)) continue;
    snapshot = await room.syncProjectReference(workspaceId, reference);
  }
  return snapshot;
}

function projectReferenceIsCurrent(
  link: import("../domain/workspace").ProjectReferenceLink,
  reference: import("../domain/reference-library").BibliographicRecord,
): boolean {
  const snapshot = link.snapshot;
  return (
    snapshot.type === reference.type &&
    snapshot.title === reference.title &&
    arraysEqual(snapshot.authors, reference.authors) &&
    snapshot.year === reference.year &&
    snapshot.venue === reference.venue &&
    snapshot.doi === reference.doi &&
    snapshot.url === reference.url &&
    snapshot.tombstone === (reference.deletedAt !== null)
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
