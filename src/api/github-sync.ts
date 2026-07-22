import type { GitHubPullResolution } from "../domain/github-sync";
import type { GitHubPublishConfirmation } from "../durable-objects/document-room";
import { GitHubClientError, type GitHubRepositorySelection, type GitHubRepositorySnapshot } from "../integrations/github-app";
import type { AuthIdentity } from "../security/auth";
import { authorizeGitHubSelection } from "./github-connection";
import {
  githubClient,
  githubErrorResponse,
  githubOperationId,
  isRecord,
  jsonError,
  type GitHubSelectionAuthorizer,
  type GitHubSyncRemoteClient,
} from "./github-sync-contracts";

type DocumentRoomStub = DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>;

interface GitHubSyncContext {
  readonly env: Env;
  readonly identity: AuthIdentity;
  readonly room: DocumentRoomStub;
  readonly client: GitHubSyncRemoteClient;
  readonly authorize: GitHubSelectionAuthorizer;
}

export async function handleGitHubWorkspaceSyncApi(
  request: Request,
  env: Env,
  identity: AuthIdentity,
  room: DocumentRoomStub,
  suffix: string,
  client: GitHubSyncRemoteClient = githubClient(env),
  authorize: GitHubSelectionAuthorizer = authorizeGitHubSelection,
): Promise<Response> {
  const context = { env, identity, room, client, authorize } satisfies GitHubSyncContext;
  try {
    if (suffix === "/github-sync" && request.method === "GET") return Response.json(await room.getGitHubSyncState());
    if (suffix === "/github-sync/status" && request.method === "GET") return await inspectSync(context);
    if (suffix === "/github-sync" && request.method === "DELETE") {
      await room.disconnectGitHubProject();
      return new Response(null, { status: 204 });
    }
    if (suffix === "/github-sync/pull-previews" && request.method === "POST") return await previewPull(context);
    if (suffix === "/github-sync/pulls" && request.method === "POST") return await confirmPull(request, context);
    if (suffix === "/github-sync/publish-previews" && request.method === "POST") return await previewPublish(request, context);
    if (suffix === "/github-sync/publishes" && request.method === "POST") return await confirmPublish(request, context);
    return jsonError("GitHub sync route not found", 404);
  } catch (error) {
    return githubErrorResponse(error);
  }
}

async function inspectSync(context: GitHubSyncContext): Promise<Response> {
  const binding = await context.room.getGitHubSyncState();
  if (!binding) return Response.json(null);
  const remote = await readAuthorizedSnapshot(context, binding);
  if (remote instanceof Response) return remote;
  return Response.json(await context.room.inspectGitHubSync(remote.commitSha, remote.files));
}

async function previewPull(context: GitHubSyncContext): Promise<Response> {
  const remote = await readConnectedSnapshot(context);
  if (remote instanceof Response) return remote;
  const preview = await context.room.createGitHubPullPreview(remote.commitSha, remote.files);
  return Response.json(preview, { status: 201 });
}

async function confirmPull(request: Request, context: GitHubSyncContext): Promise<Response> {
  const body: unknown = await request.json();
  if (
    !isRecord(body) ||
    typeof body.previewId !== "string" ||
    !githubOperationId.test(body.previewId) ||
    (body.resolutions !== undefined && !isGitHubPullResolutions(body.resolutions))
  ) {
    return jsonError("Invalid GitHub pull confirmation", 400);
  }
  const resolutions = body.resolutions ?? [];
  const confirmation = await context.room.getGitHubPullConfirmation(body.previewId);
  if (!confirmation) return jsonError("GitHub pull preview is stale", 409, "stale-preview");
  if (!hasEveryGitHubPullResolution(resolutions, confirmation.preview.plan.blocking.length)) {
    return jsonError("Every GitHub pull conflict requires a resolution", 409, "conflict");
  }
  if (confirmation.preview.plan.changes.length === 0 && confirmation.preview.plan.blocking.length === 0) {
    return jsonError("GitHub is already up to date", 409, "no-changes");
  }
  const remote = await readAuthorizedSnapshot(context, confirmation.binding);
  if (remote instanceof Response) return remote;
  if (remote.commitSha !== confirmation.preview.expectedRemoteHead) {
    return jsonError("GitHub changed after the pull preview", 409, "remote-changed");
  }
  const binding = await context.room.completeGitHubPull(confirmation.preview.id, remote.files, resolutions);
  return Response.json({ binding });
}

async function previewPublish(request: Request, context: GitHubSyncContext): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.commitMessage !== "string" || !body.commitMessage.trim() || body.commitMessage.length > 900) {
    return jsonError("Invalid GitHub publish preview", 400);
  }
  const remote = await readConnectedSnapshot(context);
  if (remote instanceof Response) return remote;
  const preview = await context.room.createGitHubPublishPreview(remote.commitSha, remote.files, body.commitMessage);
  return Response.json(preview, { status: 201 });
}

async function confirmPublish(request: Request, context: GitHubSyncContext): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.previewId !== "string" || !githubOperationId.test(body.previewId)) {
    return jsonError("Invalid GitHub publish confirmation", 400);
  }
  const confirmation = await context.room.getGitHubPublishConfirmation(body.previewId);
  if (!confirmation) return jsonError("GitHub publish preview is stale", 409, "stale-preview");
  if (confirmation.preview.plan.blocking.length > 0) return jsonError("GitHub publish has unresolved remote changes", 409, "conflict");
  if (confirmation.preview.plan.changes.length === 0) return jsonError("GitHub publish has no tracked changes", 409, "no-changes");
  const selection = await context.authorize(context.identity, context.env, selectionFromBinding(confirmation.binding));
  return await publishConfirmation(context.client, context.room, confirmation, selection);
}

async function publishConfirmation(
  client: GitHubSyncRemoteClient,
  room: DocumentRoomStub,
  confirmation: GitHubPublishConfirmation,
  selection: GitHubRepositorySelection,
): Promise<Response> {
  const operationFooter = `Kirjolab-Operation: ${confirmation.preview.id}`;
  const commitMessage = `${confirmation.preview.commitMessage}\n\n${operationFooter}`;
  const before = await client.readMarkdownSnapshot(selection);
  if (before.repositoryId !== confirmation.binding.repositoryId) {
    return jsonError("GitHub repository identity changed", 409, "repository-changed");
  }
  if (before.commitSha !== confirmation.preview.expectedRemoteHead) {
    if (before.commitMessage.includes(operationFooter)) {
      const binding = await room.completeGitHubPublish(confirmation.preview.id, before.commitSha, before.files);
      return Response.json({ commitSha: before.commitSha, reconciled: true, binding });
    }
    return jsonError("GitHub changed after the publish preview", 409, "remote-changed");
  }

  let commitSha: string;
  try {
    commitSha = await client.createCommit(
      selection,
      confirmation.preview.expectedRemoteHead,
      commitMessage,
      confirmation.preview.plan.changes,
    );
  } catch (error) {
    if (isDefinitiveGitHubFailure(error)) throw error;
    const reconciled = await client.readMarkdownSnapshot(selection);
    if (reconciled.repositoryId === confirmation.binding.repositoryId && reconciled.commitMessage.includes(operationFooter)) {
      const binding = await room.completeGitHubPublish(confirmation.preview.id, reconciled.commitSha, reconciled.files);
      return Response.json({ commitSha: reconciled.commitSha, reconciled: true, binding });
    }
    throw error;
  }
  const published = await client.readMarkdownSnapshot(selection);
  if (published.repositoryId !== confirmation.binding.repositoryId || published.commitSha !== commitSha) {
    return jsonError("GitHub publish result could not be verified", 502, "verification-failed");
  }
  const binding = await room.completeGitHubPublish(confirmation.preview.id, commitSha, published.files);
  return Response.json({ commitSha, reconciled: false, binding });
}

async function readConnectedSnapshot(context: GitHubSyncContext): Promise<GitHubRepositorySnapshot | Response> {
  const binding = await context.room.getGitHubSyncState();
  if (!binding) return jsonError("Project is not connected to GitHub", 409, "not-connected");
  const snapshot = await readAuthorizedSnapshot(context, binding);
  return snapshot;
}

async function readAuthorizedSnapshot(
  context: GitHubSyncContext,
  binding: GitHubProjectBindingInputLike,
): Promise<GitHubRepositorySnapshot | Response> {
  const selection = await context.authorize(context.identity, context.env, selectionFromBinding(binding));
  const snapshot = await context.client.readMarkdownSnapshot(selection);
  return snapshot.repositoryId === binding.repositoryId
    ? snapshot
    : jsonError("GitHub repository identity changed", 409, "repository-changed");
}

function selectionFromBinding(binding: GitHubProjectBindingInputLike): GitHubRepositorySelection {
  return {
    installationId: binding.installationId,
    repositoryId: binding.repositoryId,
    owner: binding.owner,
    repository: binding.repository,
    branch: binding.branch,
    rootPath: binding.rootPath,
  };
}

interface GitHubProjectBindingInputLike {
  readonly installationId: number;
  readonly repositoryId: number;
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
  readonly rootPath: string;
}

function isGitHubPullResolutions(value: unknown): value is GitHubPullResolution[] {
  return (
    Array.isArray(value) &&
    value.every(
      (resolution) =>
        isRecord(resolution) &&
        Number.isSafeInteger(resolution.conflict) &&
        (resolution.choice === "local" || resolution.choice === "remote"),
    )
  );
}

function hasEveryGitHubPullResolution(resolutions: readonly GitHubPullResolution[], conflictCount: number): boolean {
  return resolutions.length === conflictCount && resolutions.every((resolution, index) => resolution.conflict === index);
}

function isDefinitiveGitHubFailure(error: unknown): boolean {
  return (
    error instanceof GitHubClientError &&
    ["configuration", "authentication", "forbidden", "not-found", "branch-protected", "bounds"].includes(error.code)
  );
}
