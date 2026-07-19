import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ReviewMember, ReviewSummary } from "../domain/review-catalog";
import { defaultReviewProtocol } from "../domain/review-study";
import type { ReviewArtifactPin } from "../domain/workspace";
import { ownerKeyForEmail, type AuthIdentity } from "../security/auth";
import { discoverLegacyReviews, ensureLegacyReviewResource, handleReviewsApi, type ReviewProjectLinkView } from "./reviews";
import { handleWorkspaceApi } from "./workspace";

interface ReviewDetail {
  readonly review: ReviewSummary;
  readonly members: readonly ReviewMember[];
  readonly projectLinks: readonly ReviewProjectLinkView[];
}

interface TestProject {
  readonly id: string;
  readonly title: string;
  readonly access: DurableObjectStub<import("../durable-objects/workspace-access").WorkspaceAccess>;
  readonly room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>;
}

describe("independent reviews API in the Workers runtime", () => {
  it("creates, lists, and reads reviews independently", async () => {
    const owner = await testIdentity("independent-owner");
    const systematic = await createReview(owner, "Systematic evidence", "slr");
    const multivocal = await createReview(owner, "Industry evidence", "mlr");

    const listResponse = await handleReviewsApi(new Request("http://example.com/api/reviews"), env, owner);
    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get("cache-control")).toBe("no-store");
    const listed = await responseJson<ReviewSummary[]>(listResponse);
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining([systematic, multivocal]));

    const detailResponse = await handleReviewsApi(new Request(`http://example.com/api/reviews/${systematic.id}`), env, owner);
    expect(detailResponse.status).toBe(200);
    const detail = await responseJson<ReviewDetail>(detailResponse);
    expect(detail).toMatchObject({
      review: systematic,
      members: [{ email: owner.email, role: "owner" }],
      projectLinks: [],
    });
    expect(detail.review).not.toHaveProperty("locator");

    const catalog = env.REVIEW_CATALOGS.getByName(owner.ownerKey);
    const systematicRecord = await catalog.getReview(systematic.id);
    const multivocalRecord = await catalog.getReview(multivocal.id);
    expect(systematicRecord?.locator).toEqual({
      reviewId: systematic.id,
      storageKey: `review:${systematic.id}`,
      legacyWorkspaceId: null,
    });
    expect(multivocalRecord?.locator.storageKey).toBe(`review:${multivocal.id}`);
    expect(multivocalRecord?.locator.storageKey).not.toBe(systematicRecord?.locator.storageKey);
  });

  it("does not derive review access from project membership or project access from review membership", async () => {
    const owner = await testIdentity("boundary-owner");
    const projectOnly = await testIdentity("project-only");
    const reviewOnly = await testIdentity("review-only");
    const project = await createProject(owner, "Boundary project");
    await addProjectMember(project, owner, projectOnly);
    const review = await createReview(owner, "Boundary review", "slr");

    const invitation = await handleReviewsApi(
      jsonRequest(`http://example.com/api/reviews/${review.id}/members`, { email: reviewOnly.email }),
      env,
      owner,
    );
    expect(invitation.status).toBe(201);
    const linked = await linkProject(owner, review.id, project.id);

    const projectMemberList = await handleReviewsApi(new Request("http://example.com/api/reviews"), env, projectOnly);
    await expect(projectMemberList.json()).resolves.toEqual([]);
    const projectMemberDetail = await handleReviewsApi(new Request(`http://example.com/api/reviews/${review.id}`), env, projectOnly);
    expect(projectMemberDetail.status).toBe(404);
    await expect(projectMemberDetail.json()).resolves.toEqual({ error: "Review not found" });

    const ownerRecord = await env.REVIEW_CATALOGS.getByName(owner.ownerKey).getReview(review.id);
    expect(ownerRecord).not.toBeNull();
    const reviewAccess = env.REVIEW_ACCESS.getByName(ownerRecord!.locator.storageKey);
    await expect(reviewAccess.getRole(projectOnly.email)).resolves.toBeNull();
    await expect(project.access.getRole(reviewOnly.email)).resolves.toBeNull();

    const reviewMemberDetail = await handleReviewsApi(new Request(`http://example.com/api/reviews/${review.id}`), env, reviewOnly);
    expect(reviewMemberDetail.status).toBe(200);
    await expect(responseJson<ReviewDetail>(reviewMemberDetail)).resolves.toMatchObject({
      review: { id: review.id, role: "member" },
      projectLinks: [
        {
          id: linked.id,
          workspaceId: project.id,
          project: null,
          permission: "project-access-required",
        },
      ],
    });
  });

  it("registers legacy reviews idempotently without moving study data or absorbing later project members", async () => {
    const owner = await testIdentity("legacy-owner");
    const originalMember = await testIdentity("legacy-original-member");
    const laterMember = await testIdentity("legacy-later-member");
    const project = await createProject(owner, "Legacy review project");
    await addProjectMember(project, owner, originalMember);

    const study = env.REVIEW_STUDIES.getByName(project.id);
    const initial = await study.getSnapshot("mlr", owner.email);
    const preserved = await study.replaceProtocol({
      expectedRevision: initial.revision,
      content: {
        ...defaultReviewProtocol("mlr"),
        objective: "Preserve the existing legacy review data",
        researchQuestions: [{ id: "legacy-rq", text: "Does registration preserve this protocol?" }],
      },
      rationale: "Seed pre-registration review data",
      actor: owner.email,
    });

    const first = await ensureLegacyReviewResource(env, owner, project.id, true);
    if (!first) throw new Error("Legacy review was not registered");
    expect(first.record.locator).toEqual({
      reviewId: first.record.id,
      storageKey: project.id,
      legacyWorkspaceId: project.id,
    });
    expect(first.projectLink).toMatchObject({ reviewId: first.record.id, workspaceId: project.id, status: "active" });
    await expect(study.getSnapshot()).resolves.toMatchObject({
      revision: preserved.revision,
      protocol: { profile: "mlr", objective: "Preserve the existing legacy review data" },
    });

    await addProjectMember(project, owner, laterMember);
    const second = await ensureLegacyReviewResource(env, owner, project.id, true);
    if (!second) throw new Error("Legacy review registration was not idempotent");
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.locator.storageKey).toBe(project.id);
    expect(second.projectLink?.id).toBe(first.projectLink?.id);
    await expect(second.access.listMembers(owner.email)).resolves.toEqual([
      expect.objectContaining({ email: owner.email, role: "owner" }),
      expect.objectContaining({ email: originalMember.email, role: "member" }),
    ]);
    await expect(second.access.getRole(laterMember.email)).resolves.toBeNull();
    await expect(ensureLegacyReviewResource(env, laterMember, project.id, true)).resolves.toBeNull();
    await expect(discoverLegacyReviews(env, laterMember)).resolves.toEqual([]);
    const laterList = await handleReviewsApi(new Request("http://example.com/api/reviews"), env, laterMember);
    await expect(laterList.json()).resolves.toEqual([]);
    await expect(study.getSnapshot()).resolves.toMatchObject({
      revision: preserved.revision,
      protocol: { objective: "Preserve the existing legacy review data" },
    });
  });

  it("reconciles missing legacy project projections and compensates a failed first registration", async () => {
    const owner = await testIdentity("legacy-projection-owner");
    const project = await createProject(owner, "Legacy projection project");
    const study = env.REVIEW_STUDIES.getByName(project.id);
    await study.getSnapshot("slr", owner.email);
    const seeds = await project.access.listMembers(owner.email);
    const reviewAccess = env.REVIEW_ACCESS.getByName(project.id);
    const initialization = await reviewAccess.initializeLegacyMembers(seeds);
    const accessLink = await reviewAccess.createProjectLink(owner.email, project.id);

    await expect(project.room.listReviewLinks(project.id)).resolves.toEqual([]);
    const reconciled = await ensureLegacyReviewResource(env, owner, project.id, true);
    expect(reconciled?.projectLink?.id).toBe(accessLink.id);
    await expect(project.room.listReviewLinks(project.id)).resolves.toEqual([
      expect.objectContaining({ id: accessLink.id, reviewId: initialization.reviewId, status: "active" }),
    ]);

    const retryOwner = await testIdentity("legacy-projection-retry-owner");
    const retryProject = await createProject(retryOwner, "Legacy projection retry project");
    const retryStudy = env.REVIEW_STUDIES.getByName(retryProject.id);
    await retryStudy.getSnapshot("slr", retryOwner.email);
    const retryAccess = env.REVIEW_ACCESS.getByName(retryProject.id);
    const retryInitialization = await retryAccess.initializeLegacyMembers(await retryProject.access.listMembers(retryOwner.email));
    const conflictingLinkId = crypto.randomUUID();
    const conflictingCreatedAt = new Date().toISOString();
    await retryProject.room.linkReview(
      retryProject.id,
      conflictingLinkId,
      retryInitialization.reviewId,
      retryProject.id,
      retryOwner.email,
      conflictingCreatedAt,
    );

    await expect(ensureLegacyReviewResource(env, retryOwner, retryProject.id, true)).rejects.toThrow(
      "Review already has another active project link identity",
    );
    await expect(retryAccess.listProjectLinks(retryOwner.email, true)).resolves.toEqual([
      expect.objectContaining({ workspaceId: retryProject.id, status: "unlinked", unlinkedBy: retryOwner.email }),
    ]);

    await retryProject.room.unlinkReview(retryProject.id, conflictingLinkId, retryOwner.email);
    const retried = await ensureLegacyReviewResource(env, retryOwner, retryProject.id, true);
    expect(retried?.projectLink).toMatchObject({ workspaceId: retryProject.id, status: "active" });
    expect(retried?.projectLink?.id).not.toBe(conflictingLinkId);
    await expect(retryProject.room.listReviewLinks(retryProject.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: conflictingLinkId, status: "unlinked" }),
        expect.objectContaining({ id: retried?.projectLink?.id, status: "active" }),
      ]),
    );
  });

  it("deletes a linked project without deleting its independent review", async () => {
    const owner = await testIdentity("project-deletion-owner");
    const reviewMember = await testIdentity("project-deletion-review-member");
    const project = await createProject(owner, "Disposable manuscript");
    const review = await createReview(owner, "Persistent evidence review", "mlr");
    const invitation = await handleReviewsApi(
      jsonRequest(`http://example.com/api/reviews/${review.id}/members`, { email: reviewMember.email }),
      env,
      owner,
    );
    expect(invitation.status).toBe(201);
    const link = await linkProject(owner, review.id, project.id);

    const record = await env.REVIEW_CATALOGS.getByName(owner.ownerKey).getReview(review.id);
    if (!record) throw new Error("Independent review catalog record is unavailable");
    const study = env.REVIEW_STUDIES.getByName(record.locator.storageKey);
    const initial = await study.getSnapshot("mlr", owner.email);
    const preserved = await study.replaceProtocol({
      expectedRevision: initial.revision,
      content: {
        ...defaultReviewProtocol("mlr"),
        objective: "This review must survive manuscript deletion",
      },
      rationale: "Record independent review data",
      actor: owner.email,
    });

    const deletion = await handleWorkspaceApi(
      new Request(`http://example.com/api/workspaces/${project.id}/settings`, { method: "DELETE" }),
      env,
      owner,
    );
    expect(deletion.status).toBe(204);
    await expect(env.WORKSPACE_CATALOGS.getByName(owner.ownerKey).getWorkspace(project.id)).resolves.toBeNull();

    const ownerDetail = await handleReviewsApi(new Request(`http://example.com/api/reviews/${review.id}`), env, owner);
    expect(ownerDetail.status).toBe(200);
    await expect(responseJson<ReviewDetail>(ownerDetail)).resolves.toMatchObject({
      review: { id: review.id, title: review.title, profile: "mlr", role: "owner" },
      members: [
        { email: owner.email, role: "owner" },
        { email: reviewMember.email, role: "member" },
      ],
      projectLinks: [
        {
          id: link.id,
          workspaceId: project.id,
          status: "unlinked",
          unlinkedBy: owner.email,
          project: null,
          permission: "project-access-required",
        },
      ],
    });
    const memberDetail = await handleReviewsApi(new Request(`http://example.com/api/reviews/${review.id}`), env, reviewMember);
    expect(memberDetail.status).toBe(200);
    await expect(responseJson<ReviewDetail>(memberDetail)).resolves.toMatchObject({
      review: { id: review.id, role: "member" },
      members: expect.arrayContaining([expect.objectContaining({ email: reviewMember.email, role: "member" })]),
    });
    await expect(study.getSnapshot()).resolves.toMatchObject({
      revision: preserved.revision,
      protocol: { profile: "mlr", objective: "This review must survive manuscript deletion" },
    });
  });

  it("supports many-to-many links, soft unlinking, and review deletion without rewriting project materializations", async () => {
    const owner = await testIdentity("lifecycle-owner");
    const firstProject = await createProject(owner, "First manuscript");
    const secondProject = await createProject(owner, "Second manuscript");
    const firstReview = await createReview(owner, "Reusable review", "slr");
    const secondReview = await createReview(owner, "Companion review", "mlr");

    const firstToFirst = await linkProject(owner, firstReview.id, firstProject.id);
    const firstToSecond = await linkProject(owner, firstReview.id, secondProject.id);
    const secondToFirst = await linkProject(owner, secondReview.id, firstProject.id);

    const firstReviewLinks = await handleReviewsApi(
      new Request(`http://example.com/api/reviews/${firstReview.id}/project-links`),
      env,
      owner,
    );
    expect((await responseJson<ReviewProjectLinkView[]>(firstReviewLinks)).map((link) => link.workspaceId)).toEqual([
      firstProject.id,
      secondProject.id,
    ]);
    await expect(firstProject.room.listReviewLinks(firstProject.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstToFirst.id, reviewId: firstReview.id, status: "active" }),
        expect.objectContaining({ id: secondToFirst.id, reviewId: secondReview.id, status: "active" }),
      ]),
    );
    const projectReviewLinks = await handleWorkspaceApi(
      new Request(`http://example.com/api/workspaces/${firstProject.id}/reviews`),
      env,
      owner,
    );
    expect(projectReviewLinks.status).toBe(200);
    const publicProjectReviewLinks = await responseJson<Record<string, unknown>[]>(projectReviewLinks);
    expect(publicProjectReviewLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstToFirst.id, reviewId: firstReview.id, permission: "available" }),
        expect.objectContaining({ id: secondToFirst.id, reviewId: secondReview.id, permission: "available" }),
      ]),
    );
    expect(publicProjectReviewLinks.every((link) => !("reviewAccessLocator" in link))).toBe(true);
    await expect(secondProject.room.listReviewLinks(secondProject.id)).resolves.toEqual([
      expect.objectContaining({ id: firstToSecond.id, reviewId: firstReview.id, status: "active" }),
    ]);

    const beforeUnlink = await secondProject.room.getSnapshot(secondProject.id);
    const unlinkResponse = await handleReviewsApi(
      new Request(`http://example.com/api/reviews/${firstReview.id}/project-links/${firstToSecond.id}`, { method: "DELETE" }),
      env,
      owner,
    );
    expect(unlinkResponse.status).toBe(204);
    expect((await secondProject.room.getSnapshot(secondProject.id)).revision).toBe(beforeUnlink.revision);
    const linkHistory = await handleReviewsApi(new Request(`http://example.com/api/reviews/${firstReview.id}/project-links`), env, owner);
    expect(await responseJson<ReviewProjectLinkView[]>(linkHistory)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstToFirst.id, status: "active" }),
        expect.objectContaining({ id: firstToSecond.id, status: "unlinked", unlinkedBy: owner.email }),
      ]),
    );
    await expect(secondProject.room.listReviewLinks(secondProject.id)).resolves.toEqual([
      expect.objectContaining({ id: firstToSecond.id, status: "unlinked", unlinkedBy: owner.email }),
    ]);

    const artifactContent = "# Preserved companion synthesis\n";
    const pin: ReviewArtifactPin = {
      path: "review/companion-synthesis.md",
      reviewId: secondReview.id,
      linkId: secondToFirst.id,
      publicationId: crypto.randomUUID(),
      reviewRevision: 1,
      protocolRevision: 1,
      analysisDefinitionId: "review-synthesis-report",
      analysisDefinitionRevision: 1,
      generator: "kirjolab-review-synthesis",
      generatorSchema: "kirjolab-review-analysis-v1",
      digest: await sha256(artifactContent),
      publishedBy: owner.email,
      generatedAt: new Date().toISOString(),
    };
    const beforePublication = await firstProject.room.getSnapshot(firstProject.id);
    const publication = await firstProject.room.upsertReviewArtifact(
      firstProject.id,
      pin.path,
      artifactContent,
      beforePublication.revision,
      pin,
    );
    expect(publication.ok).toBe(true);
    if (!publication.ok) throw new Error(publication.error);
    const materialized = publication.value;

    const deletion = await handleReviewsApi(
      new Request(`http://example.com/api/reviews/${secondReview.id}/settings`, { method: "DELETE" }),
      env,
      owner,
    );
    expect(deletion.status).toBe(200);
    await expect(deletion.json()).resolves.toMatchObject({
      reviewId: secondReview.id,
      unlinkedProjectIds: [firstProject.id],
    });
    const afterDeletion = await firstProject.room.getSnapshot(firstProject.id);
    expect(afterDeletion.revision).toBe(materialized.revision);
    expect(afterDeletion.files.find((file) => file.path === pin.path)?.content).toBe(artifactContent);
    expect(afterDeletion.reviewArtifactPins).toEqual([pin]);
    await expect(firstProject.room.listReviewLinks(firstProject.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstToFirst.id, status: "active" }),
        expect.objectContaining({ id: secondToFirst.id, status: "unlinked", unlinkedBy: owner.email }),
      ]),
    );

    const ownerReviews = await handleReviewsApi(new Request("http://example.com/api/reviews"), env, owner);
    const remaining = await responseJson<ReviewSummary[]>(ownerReviews);
    expect(remaining.map((review) => review.id)).toEqual([firstReview.id]);
    const deletedDetail = await handleReviewsApi(new Request(`http://example.com/api/reviews/${secondReview.id}`), env, owner);
    expect(deletedDetail.status).toBe(404);
  });
});

async function testIdentity(label: string): Promise<AuthIdentity> {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  return {
    subject: `test:${label}:${crypto.randomUUID()}`,
    email,
    ownerKey: await ownerKeyForEmail(email),
    mode: "access",
  };
}

async function createProject(owner: AuthIdentity, title: string): Promise<TestProject> {
  const id = crypto.randomUUID();
  const access = env.WORKSPACE_ACCESS.getByName(id);
  await access.initializeOwner(owner.email);
  const room = env.DOCUMENT_ROOMS.getByName(id);
  await room.initializeWorkspace(title);
  await env.WORKSPACE_CATALOGS.getByName(owner.ownerKey).registerWorkspace(id, title);
  return { id, title, access, room };
}

async function addProjectMember(project: TestProject, owner: AuthIdentity, member: AuthIdentity): Promise<void> {
  await project.access.addMember(owner.email, member.email);
  await env.WORKSPACE_CATALOGS.getByName(member.ownerKey).registerWorkspace(project.id, project.title);
}

async function createReview(owner: AuthIdentity, title: string, profile: "slr" | "mlr"): Promise<ReviewSummary> {
  const response = await handleReviewsApi(jsonRequest("http://example.com/api/reviews", { title, profile }), env, owner);
  expect(response.status).toBe(201);
  return await responseJson<ReviewSummary>(response);
}

async function linkProject(owner: AuthIdentity, reviewId: string, workspaceId: string): Promise<ReviewProjectLinkView> {
  const response = await handleReviewsApi(
    jsonRequest(`http://example.com/api/reviews/${reviewId}/project-links`, { workspaceId }),
    env,
    owner,
  );
  expect(response.status).toBe(201);
  return await responseJson<ReviewProjectLinkView>(response);
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function responseJson<Value>(response: Response): Promise<Value> {
  return (await response.json()) as Value;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
