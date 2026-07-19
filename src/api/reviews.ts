import {
  isReviewId,
  isReviewProfile,
  normalizeReviewEmail,
  type ProjectReviewLink,
  type ReviewCatalogRecord,
  type ReviewMember,
  type ReviewSummary,
} from "../domain/review-catalog";
import { demoWorkspaceId, localOwnerId, type WorkspaceSummary } from "../domain/workspace";
import { ownerKeyForEmail, type AuthIdentity } from "../security/auth";
import { handleReviewStudyApi } from "./review-study";

export interface ReviewResource {
  readonly record: ReviewCatalogRecord;
  readonly role: "owner" | "member";
  readonly deletedAt: string | null;
  readonly access: DurableObjectStub<import("../durable-objects/review-access").ReviewAccess>;
  readonly study: DurableObjectStub<import("../durable-objects/review-study").ReviewStudy>;
}

export interface ReviewProjectLinkView extends ProjectReviewLink {
  readonly project: Pick<WorkspaceSummary, "id" | "title" | "href"> | null;
  readonly permission: "available" | "project-access-required";
}

export interface LegacyReviewRegistration extends ReviewResource {
  readonly projectLink: ProjectReviewLink | null;
}

export async function handleReviewsApi(request: Request, env: Env, identity: AuthIdentity): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/reviews") {
    try {
      if (request.method === "GET") {
        return noStore(await env.REVIEW_CATALOGS.getByName(identity.ownerKey).listReviews());
      }
      if (request.method === "POST") {
        const input = await createReviewRequest(request);
        const resource = await createReviewResource(env, identity, input.title, input.profile);
        return noStore(publicReview(resource.record), 201);
      }
      return methodNotAllowed();
    } catch (error) {
      return reviewError(error);
    }
  }

  const match = /^\/api\/reviews\/([a-f0-9-]{36})(\/.*)?$/iu.exec(url.pathname);
  if (!match?.[1] || !isReviewId(match[1])) return jsonError("Review not found", 404);
  const reviewId = match[1].toLowerCase();
  const suffix = match[2] ?? "/";
  try {
    const resource = await resolveReviewResource(env, identity, reviewId);
    if (!resource) return jsonError("Review not found", 404);
    const isDeletionRequest = suffix === "/settings" && request.method === "DELETE";
    if (resource.deletedAt !== null && !isDeletionRequest) return jsonError("Review not found", 404);

    if (suffix === "/" && request.method === "GET") {
      const [members, projectLinks] = await Promise.all([
        resource.access.listMembers(identity.email),
        reviewProjectLinkViews(env, identity, resource.access),
      ]);
      return noStore({ review: publicReview(resource.record), members, projectLinks });
    }
    if (suffix === "/settings" && request.method === "PATCH") {
      if (resource.role !== "owner") return jsonError("Only the review owner can change review settings", 403);
      return noStore(await updateReviewResource(request, env, identity, resource));
    }
    if (suffix === "/settings" && request.method === "DELETE") {
      if (resource.role !== "owner") return jsonError("Only the review owner can permanently delete a review", 403);
      return await deleteReviewResource(env, identity, resource);
    }
    if (suffix === "/members" && request.method === "GET") {
      return noStore(await resource.access.listMembers(identity.email));
    }
    if (suffix === "/members" && request.method === "POST") {
      return noStore(await inviteReviewMember(request, env, identity, resource), 201);
    }
    if (suffix === "/members" && request.method === "DELETE") {
      await removeReviewMember(request, env, identity, resource);
      return new Response(null, { status: 204 });
    }
    if (suffix === "/project-links" && request.method === "GET") {
      return noStore(await reviewProjectLinkViews(env, identity, resource.access));
    }
    if (suffix === "/project-links" && request.method === "POST") {
      return noStore(await createReviewProjectLink(request, env, identity, resource), 201);
    }
    const projectLinkMatch = /^\/project-links\/([a-f0-9-]{36})$/iu.exec(suffix);
    if (projectLinkMatch?.[1] && request.method === "DELETE") {
      await unlinkReviewProject(env, identity, resource, projectLinkMatch[1]);
      return new Response(null, { status: 204 });
    }

    const projectContext = await reviewWorkflowProjectContext(request, env, identity, resource);
    const workflowSuffix = suffix.startsWith("/review-study") ? suffix : `/review-study${suffix === "/" ? "" : suffix}`;
    return await handleReviewStudyApi(
      request,
      resource.study,
      identity,
      workflowSuffix,
      projectContext?.room,
      projectContext?.workspaceId,
      { reviewId, linkId: projectContext?.link.id ?? null },
    );
  } catch (error) {
    return reviewError(error);
  }
}

export async function createReviewResource(
  env: Env,
  identity: AuthIdentity,
  title: string,
  profile: "slr" | "mlr",
): Promise<ReviewResource> {
  const catalog = env.REVIEW_CATALOGS.getByName(identity.ownerKey);
  const record = await catalog.createReview({ title, profile });
  const access = env.REVIEW_ACCESS.getByName(record.locator.storageKey);
  const study = env.REVIEW_STUDIES.getByName(record.locator.storageKey);
  try {
    await access.initializeOwner(record.id, identity.email);
    await study.getSnapshot(profile, identity.email);
  } catch (error) {
    await catalog.removeReview(record.id);
    throw error;
  }
  return { record, role: "owner", deletedAt: null, access, study };
}

export async function resolveReviewResource(env: Env, identity: AuthIdentity, reviewId: string): Promise<ReviewResource | null> {
  const record = await env.REVIEW_CATALOGS.getByName(identity.ownerKey).getReview(reviewId);
  if (!record) return null;
  const access = env.REVIEW_ACCESS.getByName(record.locator.storageKey);
  const role = await access.getRole(identity.email);
  if (!role) throw new Error("Review access denied");
  const status = await access.getAccessStatus();
  return { record, role, deletedAt: status.deletedAt, access, study: env.REVIEW_STUDIES.getByName(record.locator.storageKey) };
}

export async function discoverLegacyReviews(env: Env, identity: AuthIdentity): Promise<ReviewSummary[]> {
  const [reviews, workspaces] = await Promise.all([
    env.REVIEW_CATALOGS.getByName(identity.ownerKey).listReviews(),
    env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).listWorkspaces(),
  ]);
  const registeredWorkspaces = new Set(
    (
      await Promise.all(
        reviews.map(
          async (review) => (await env.REVIEW_CATALOGS.getByName(identity.ownerKey).getReview(review.id))?.locator.legacyWorkspaceId,
        ),
      )
    ).filter((workspaceId): workspaceId is string => workspaceId !== null && workspaceId !== undefined),
  );
  for (const workspace of workspaces) {
    if (workspace.archivedAt !== null || registeredWorkspaces.has(workspace.id)) continue;
    const storageKey = workspaceStorageKey(identity, workspace.id);
    if (!(await env.REVIEW_STUDIES.getByName(storageKey).hasReviewData())) continue;
    await ensureLegacyReviewResource(env, identity, workspace.id, true);
  }
  return await env.REVIEW_CATALOGS.getByName(identity.ownerKey).listReviews();
}

export async function ensureLegacyReviewResource(
  env: Env,
  identity: AuthIdentity,
  workspaceId: string,
  requireExistingData = false,
): Promise<LegacyReviewRegistration | null> {
  const workspace = await env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).getWorkspace(workspaceId);
  if (!workspace) return null;
  const storageKey = workspaceStorageKey(identity, workspaceId);
  const workspaceAccess = env.WORKSPACE_ACCESS.getByName(storageKey);
  if (workspaceId === demoWorkspaceId || identity.mode === "local") await workspaceAccess.initializeOwner(identity.email);
  if (!(await workspaceAccess.getRole(identity.email))) throw new Error("Workspace access denied");
  const study = env.REVIEW_STUDIES.getByName(storageKey);
  const hasData = await study.hasReviewData();
  if (requireExistingData && !hasData) return null;

  const workspaceMembers = await workspaceAccess.listMembers(identity.email);
  const access = env.REVIEW_ACCESS.getByName(storageKey);
  const initialization = await access.initializeLegacyMembers(workspaceMembers);
  const currentEmail = normalizeReviewEmail(identity.email);
  if (!initialization.members.some((member) => member.email === currentEmail)) return null;
  const owner = initialization.members.find((member) => member.role === "owner");
  if (!owner) throw new Error("Legacy review owner is unavailable");
  const existingLinks = await access.listProjectLinks(owner.email, true);
  const existingProjectLink = existingLinks.find((link) => link.workspaceId === workspaceId && link.status === "active") ?? null;
  const projectLink = existingProjectLink ?? (await access.createProjectLink(owner.email, workspaceId));
  const createdProjectLink = existingProjectLink === null;
  const room = env.DOCUMENT_ROOMS.getByName(storageKey);
  try {
    await room.linkReview(workspaceId, projectLink.id, initialization.reviewId, storageKey, projectLink.createdBy, projectLink.createdAt);
  } catch (error) {
    const projection = await room.listReviewLinks(workspaceId).catch(() => []);
    const reconciled = projection.some(
      (candidate) =>
        candidate.id === projectLink.id &&
        candidate.reviewId === initialization.reviewId &&
        candidate.reviewAccessLocator === storageKey &&
        candidate.status === "active",
    );
    if (!reconciled) {
      if (createdProjectLink) await access.unlinkProject(owner.email, projectLink.id);
      throw error;
    }
  }

  const snapshot = await study.getSnapshot("slr", identity.email);
  const ownerCatalog = env.REVIEW_CATALOGS.getByName(await reviewCatalogOwnerKey(identity, owner.email));
  const authoritative = await ownerCatalog.getReview(initialization.reviewId);
  const registration = {
    reviewId: initialization.reviewId,
    title: authoritative?.title ?? workspace.title,
    profile: authoritative?.profile ?? snapshot.protocol.profile,
    storageKey,
    legacyWorkspaceId: workspaceId,
    createdAt: authoritative?.createdAt ?? workspace.createdAt,
    updatedAt: authoritative?.updatedAt ?? workspace.updatedAt,
    archivedAt: authoritative?.archivedAt ?? null,
  } as const;
  let currentRecord: ReviewCatalogRecord | null = null;
  for (const member of initialization.members) {
    const record = await env.REVIEW_CATALOGS.getByName(await reviewCatalogOwnerKey(identity, member.email)).registerLegacyReview({
      ...registration,
      role: member.role,
    });
    if (member.email === currentEmail) currentRecord = record;
  }
  if (!currentRecord) return null;
  return {
    record: currentRecord,
    role: currentRecord.role,
    deletedAt: null,
    access,
    study,
    projectLink,
  };
}

export async function reviewProjectLinkViews(
  env: Env,
  identity: AuthIdentity,
  access: DurableObjectStub<import("../durable-objects/review-access").ReviewAccess>,
  includeUnlinked = true,
): Promise<ReviewProjectLinkView[]> {
  const links = await access.listProjectLinks(identity.email, includeUnlinked);
  return await Promise.all(
    links.map(async (link): Promise<ReviewProjectLinkView> => {
      const project = await authorizedProject(env, identity, link.workspaceId);
      return {
        ...link,
        project: project ? { id: project.summary.id, title: project.summary.title, href: project.summary.href } : null,
        permission: project ? "available" : "project-access-required",
      };
    }),
  );
}

export function publicReview(record: ReviewCatalogRecord): ReviewSummary {
  const { locator: _locator, ...summary } = record;
  return summary;
}

export function workspaceStorageKey(identity: Pick<AuthIdentity, "ownerKey">, workspaceId: string): string {
  if (workspaceId !== demoWorkspaceId || identity.ownerKey === localOwnerId) return workspaceId;
  return `${identity.ownerKey}:demo`;
}

async function updateReviewResource(request: Request, env: Env, identity: AuthIdentity, resource: ReviewResource): Promise<ReviewSummary> {
  const input = await updateReviewRequest(request);
  const members = await resource.access.listMembers(identity.email);
  let updated: ReviewCatalogRecord | null = null;
  for (const member of members) {
    const memberCatalog = env.REVIEW_CATALOGS.getByName(await reviewCatalogOwnerKey(identity, member.email));
    const candidate = await memberCatalog.updateReview(resource.record.id, input);
    if (member.email === normalizeReviewEmail(identity.email)) updated = candidate;
  }
  if (!updated) throw new Error("Review catalog update failed");
  return publicReview(updated);
}

async function inviteReviewMember(request: Request, env: Env, identity: AuthIdentity, resource: ReviewResource): Promise<ReviewMember> {
  if (resource.role !== "owner") throw new Error("Only the review owner can manage review access");
  const email = await reviewMemberEmailRequest(request);
  const member = await resource.access.addMember(identity.email, email);
  await env.REVIEW_CATALOGS.getByName(await reviewCatalogOwnerKey(identity, member.email)).registerReview({
    id: resource.record.id,
    title: resource.record.title,
    profile: resource.record.profile,
    role: member.role,
    storageKey: resource.record.locator.storageKey,
    legacyWorkspaceId: resource.record.locator.legacyWorkspaceId,
    createdAt: resource.record.createdAt,
    updatedAt: resource.record.updatedAt,
    archivedAt: resource.record.archivedAt,
  });
  return member;
}

async function removeReviewMember(request: Request, env: Env, identity: AuthIdentity, resource: ReviewResource): Promise<void> {
  if (resource.role !== "owner") throw new Error("Only the review owner can manage review access");
  const email = await reviewMemberEmailRequest(request);
  await resource.access.removeMember(identity.email, email);
  await env.REVIEW_CATALOGS.getByName(await reviewCatalogOwnerKey(identity, email)).removeReview(resource.record.id);
}

async function createReviewProjectLink(
  request: Request,
  env: Env,
  identity: AuthIdentity,
  resource: ReviewResource,
): Promise<ReviewProjectLinkView> {
  if (resource.role !== "owner") throw new Error("Only the review owner can link writing projects");
  const workspaceId = await projectLinkRequest(request);
  const project = await authorizedProject(env, identity, workspaceId);
  if (!project) throw new Error("Project access denied");
  const link = await resource.access.createProjectLink(identity.email, workspaceId);
  try {
    await project.room.linkReview(
      workspaceId,
      link.id,
      resource.record.id,
      resource.record.locator.storageKey,
      link.createdBy,
      link.createdAt,
    );
  } catch (error) {
    await resource.access.unlinkProject(identity.email, link.id);
    throw error;
  }
  return {
    ...link,
    project: { id: project.summary.id, title: project.summary.title, href: project.summary.href },
    permission: "available",
  };
}

async function unlinkReviewProject(env: Env, identity: AuthIdentity, resource: ReviewResource, linkId: string): Promise<void> {
  if (resource.role !== "owner") throw new Error("Only the review owner can unlink writing projects");
  const link = await resource.access.getProjectLink(identity.email, linkId);
  if (!link) throw new Error("Review project link not found");
  const project = await authorizedProject(env, identity, link.workspaceId);
  if (!project) throw new Error("Project access denied");
  await resource.access.unlinkProject(identity.email, link.id);
  await project.room.unlinkReview(link.workspaceId, link.id, identity.email);
}

async function deleteReviewResource(env: Env, identity: AuthIdentity, resource: ReviewResource): Promise<Response> {
  const deletion = await resource.access.getDeletionSnapshot(identity.email);
  const members = deletion.members;
  const links = deletion.projectLinks;
  const owner = members.find((member) => member.role === "owner");
  if (!owner) throw new Error("Review owner is unavailable during deletion");
  for (const link of links) {
    if (link.status !== "active") continue;
    const room = env.DOCUMENT_ROOMS.getByName(workspaceStorageKey(identity, link.workspaceId));
    const projection = await room.listReviewLinks(link.workspaceId);
    if (projection.some((candidate) => candidate.id === link.id && candidate.status === "active")) {
      await room.unlinkReview(link.workspaceId, link.id, identity.email);
    }
  }
  for (const member of members) {
    if (member.email === owner.email) continue;
    await env.REVIEW_CATALOGS.getByName(await reviewCatalogOwnerKey(identity, member.email)).removeReview(resource.record.id);
  }
  await resource.study.deleteReviewData();
  const boundary = await resource.access.deleteReviewAccess(identity.email);
  await env.REVIEW_CATALOGS.getByName(await reviewCatalogOwnerKey(identity, owner.email)).removeReview(resource.record.id);
  return noStore(boundary);
}

async function reviewWorkflowProjectContext(
  request: Request,
  env: Env,
  identity: AuthIdentity,
  resource: ReviewResource,
): Promise<{
  readonly link: ProjectReviewLink;
  readonly workspaceId: string;
  readonly room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>;
} | null> {
  const links = await resource.access.listProjectLinks(identity.email);
  const url = new URL(request.url);
  let requestedLinkId = url.searchParams.get("projectLinkId") ?? request.headers.get("x-kirjolab-project-link-id");
  if (!requestedLinkId && request.method === "POST" && url.pathname.endsWith("/synthesis/publish")) {
    const value: unknown = await request.clone().json();
    if (isRecord(value) && typeof value.projectLinkId === "string") requestedLinkId = value.projectLinkId;
  }
  let link: ProjectReviewLink | undefined;
  if (requestedLinkId) link = links.find((candidate) => candidate.id === requestedLinkId);
  else if (links.length === 1) link = links[0];
  if (!link && resource.record.locator.legacyWorkspaceId) {
    link = links.find((candidate) => candidate.workspaceId === resource.record.locator.legacyWorkspaceId);
  }
  if (!link) return null;
  const project = await authorizedProject(env, identity, link.workspaceId);
  if (!project) return null;
  return { link, workspaceId: link.workspaceId, room: project.room };
}

async function authorizedProject(
  env: Env,
  identity: AuthIdentity,
  workspaceId: string,
): Promise<{
  readonly summary: WorkspaceSummary;
  readonly room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>;
} | null> {
  const summary = await env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).getWorkspace(workspaceId);
  if (!summary) return null;
  const storageKey = workspaceStorageKey(identity, workspaceId);
  const role = await env.WORKSPACE_ACCESS.getByName(storageKey).getRole(identity.email);
  if (!role) return null;
  return { summary, room: env.DOCUMENT_ROOMS.getByName(storageKey) };
}

async function reviewCatalogOwnerKey(identity: AuthIdentity, email: string): Promise<string> {
  return normalizeReviewEmail(email) === normalizeReviewEmail(identity.email) ? identity.ownerKey : await ownerKeyForEmail(email);
}

async function createReviewRequest(request: Request): Promise<{ title: string; profile: "slr" | "mlr" }> {
  const value: unknown = await request.json();
  if (!isRecord(value) || typeof value.title !== "string" || !isReviewProfile(value.profile)) {
    throw new Error("Review creation request is invalid");
  }
  const title = value.title.trim();
  if (!title || title.length > 120) throw new Error("Review title is invalid");
  return { title, profile: value.profile };
}

async function updateReviewRequest(request: Request): Promise<{ title?: string; archived?: boolean }> {
  const value: unknown = await request.json();
  if (!isRecord(value)) throw new Error("Review settings request is invalid");
  if (value.profile !== undefined) throw new Error("Review method profile cannot change after creation");
  const title = value.title === undefined ? undefined : typeof value.title === "string" ? value.title.trim() : "";
  const archived = value.archived === undefined ? undefined : typeof value.archived === "boolean" ? value.archived : null;
  if ((title !== undefined && (!title || title.length > 120)) || archived === null) {
    throw new Error("Review settings request is invalid");
  }
  return {
    ...(title === undefined ? {} : { title }),
    ...(archived === undefined ? {} : { archived }),
  };
}

async function reviewMemberEmailRequest(request: Request): Promise<string> {
  const value: unknown = await request.json();
  if (!isRecord(value) || typeof value.email !== "string") throw new Error("Review member request is invalid");
  return normalizeReviewEmail(value.email);
}

async function projectLinkRequest(request: Request): Promise<string> {
  const value: unknown = await request.json();
  if (!isRecord(value) || typeof value.workspaceId !== "string" || !/^[a-z0-9-]{1,64}$/iu.test(value.workspaceId)) {
    throw new Error("Review project link request is invalid");
  }
  return value.workspaceId;
}

function reviewError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Review operation failed";
  const status = /access denied|only the review owner|project access denied/iu.test(message)
    ? 403
    : /not found/iu.test(message)
      ? 404
      : /limit|conflict|already|cannot change|deleted|unavailable|active project link/iu.test(message)
        ? 409
        : 400;
  return jsonError(message, status);
}

function noStore(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

function methodNotAllowed(): Response {
  return jsonError("Method not allowed", 405);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
