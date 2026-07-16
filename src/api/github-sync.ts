import { defaultProjectPublicationProfile } from "../domain/workspace";
import { resolveTemplateEntryPath, type ProjectTemplateSeed } from "../domain/project-templates";
import type { GitHubPublishConfirmation } from "../durable-objects/document-room";
import {
  GitHubAppClient,
  GitHubClientError,
  type GitHubRepositorySelection,
  type GitHubRepositorySnapshot,
} from "../integrations/github-app";
import type { AuthIdentity } from "../security/auth";

interface GitHubSecretEnvironment {
  readonly GITHUB_APP_PRIVATE_KEY?: string;
}

type DocumentRoomStub = DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>;

export interface GitHubSyncRemoteClient {
  readMarkdownSnapshot(selection: GitHubRepositorySelection): Promise<GitHubRepositorySnapshot>;
  createCommit(
    selection: GitHubRepositorySelection,
    expectedHead: string,
    message: string,
    changes: readonly { readonly path: string; readonly content: string | null }[],
  ): Promise<string>;
}

export async function handleGitHubImportApi(
  request: Request,
  env: Env,
  identity: AuthIdentity,
  client: GitHubSyncRemoteClient = githubClient(env),
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "POST") return jsonError("GitHub sync route not found", 404);
  try {
    if (pathname === "/api/github/import-previews") return await previewImport(request, env, identity, client);
    if (pathname === "/api/github/imports") return await confirmImport(request, env, identity, client);
    return jsonError("GitHub sync route not found", 404);
  } catch (error) {
    return githubErrorResponse(error);
  }
}

export async function handleGitHubWorkspaceSyncApi(
  request: Request,
  env: Env,
  room: DocumentRoomStub,
  suffix: string,
  client: GitHubSyncRemoteClient = githubClient(env),
): Promise<Response> {
  try {
    if (suffix === "/github-sync" && request.method === "GET") return Response.json(await room.getGitHubSyncState());
    if (suffix === "/github-sync" && request.method === "DELETE") {
      await room.disconnectGitHubProject();
      return new Response(null, { status: 204 });
    }
    if (suffix === "/github-sync/publish-previews" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isRecord(body) || typeof body.commitMessage !== "string" || !body.commitMessage.trim() || body.commitMessage.length > 900) {
        return jsonError("Invalid GitHub publish preview", 400);
      }
      const binding = await room.getGitHubSyncState();
      if (!binding) return jsonError("Project is not connected to GitHub", 409, "not-connected");
      const snapshot = await client.readMarkdownSnapshot(selectionFromBinding(binding));
      if (snapshot.repositoryId !== binding.repositoryId) return jsonError("GitHub repository identity changed", 409, "repository-changed");
      const preview = await room.createGitHubPublishPreview(snapshot.commitSha, snapshot.files, body.commitMessage);
      return Response.json(preview, { status: 201 });
    }
    if (suffix === "/github-sync/publishes" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isRecord(body) || typeof body.previewId !== "string" || !uuid.test(body.previewId)) {
        return jsonError("Invalid GitHub publish confirmation", 400);
      }
      const confirmation = await room.getGitHubPublishConfirmation(body.previewId);
      if (!confirmation) return jsonError("GitHub publish preview is stale", 409, "stale-preview");
      if (confirmation.preview.plan.blocking.length > 0) return jsonError("GitHub publish has unresolved remote changes", 409, "conflict");
      if (confirmation.preview.plan.changes.length === 0) return jsonError("GitHub publish has no tracked changes", 409, "no-changes");
      return await publishConfirmation(client, room, confirmation);
    }
    return jsonError("GitHub sync route not found", 404);
  } catch (error) {
    return githubErrorResponse(error);
  }
}

async function previewImport(request: Request, env: Env, identity: AuthIdentity, client: GitHubSyncRemoteClient): Promise<Response> {
  const body: unknown = await request.json();
  if (!isImportPreviewInput(body)) return jsonError("Invalid GitHub import preview", 400);
  const selection: GitHubRepositorySelection = {
    installationId: body.installationId,
    owner: body.owner,
    repository: body.repository,
    branch: body.branch,
    rootPath: body.rootPath,
  };
  const snapshot = await client.readMarkdownSnapshot(selection);
  if (body.entryPath !== undefined && !snapshot.files.some((file) => file.path === body.entryPath)) {
    return jsonError("GitHub import entry file is unavailable", 400);
  }
  const seed = seedFromSnapshot(snapshot, body.entryPath);
  const entryPath = resolveTemplateEntryPath(seed);
  const preview = await env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).createGitHubImportPreview(selection, snapshot, entryPath);
  return Response.json(
    {
      id: preview.id,
      expiresAt: preview.expiresAt,
      repository: {
        id: snapshot.repositoryId,
        owner: snapshot.owner,
        name: snapshot.repository,
        branch: snapshot.branch,
        rootPath: snapshot.rootPath,
      },
      commitSha: snapshot.commitSha,
      entryPath,
      files: snapshot.files.map((file) => ({ path: file.path, bytes: new TextEncoder().encode(file.content).byteLength })),
      skipped: snapshot.skipped,
    },
    { status: 201 },
  );
}

async function confirmImport(request: Request, env: Env, identity: AuthIdentity, client: GitHubSyncRemoteClient): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.previewId !== "string" || !uuid.test(body.previewId) || typeof body.title !== "string") {
    return jsonError("Invalid GitHub import confirmation", 400);
  }
  const title = body.title.trim();
  if (!title || title.length > 120) return jsonError("Invalid GitHub import confirmation", 400);
  const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
  const preview = await catalog.getGitHubImportPreview(body.previewId);
  if (!preview) return jsonError("GitHub import preview is stale", 409, "stale-preview");
  const current = await client.readMarkdownSnapshot(preview.selection);
  if (current.repositoryId !== preview.snapshot.repositoryId || current.commitSha !== preview.snapshot.commitSha) {
    return jsonError("GitHub changed after the import preview", 409, "remote-changed");
  }
  const id = crypto.randomUUID();
  const access = env.WORKSPACE_ACCESS.getByName(id);
  await access.initializeOwner(identity.email);
  const room = env.DOCUMENT_ROOMS.getByName(id);
  await room.seedFromTemplate(id, title, seedFromSnapshot(preview.snapshot, preview.entryPath ?? undefined));
  const binding = await room.bindGitHubProject(
    {
      ...preview.selection,
      repositoryId: preview.snapshot.repositoryId,
      commitSha: preview.snapshot.commitSha,
    },
    preview.snapshot.files,
  );
  const workspace = await catalog.registerWorkspace(id, title);
  await catalog.deleteGitHubImportPreview(preview.id);
  return Response.json({ workspace, binding }, { status: 201 });
}

async function publishConfirmation(
  client: GitHubSyncRemoteClient,
  room: DocumentRoomStub,
  confirmation: GitHubPublishConfirmation,
): Promise<Response> {
  const selection = selectionFromBinding(confirmation.binding);
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

function githubClient(env: Env): GitHubAppClient {
  const privateKey = (env as Env & GitHubSecretEnvironment).GITHUB_APP_PRIVATE_KEY ?? "";
  return new GitHubAppClient({ appId: env.GITHUB_APP_ID, privateKey });
}

function selectionFromBinding(binding: GitHubProjectBindingInputLike): GitHubRepositorySelection {
  return {
    installationId: binding.installationId,
    owner: binding.owner,
    repository: binding.repository,
    branch: binding.branch,
    rootPath: binding.rootPath,
  };
}

interface GitHubProjectBindingInputLike {
  readonly installationId: number;
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
  readonly rootPath: string;
}

function seedFromSnapshot(snapshot: GitHubRepositorySnapshot, entryPath?: string): ProjectTemplateSeed {
  const folders = new Set<string>();
  for (const file of snapshot.files) {
    const parts = file.path.split("/");
    for (let index = 1; index < parts.length; index += 1) folders.add(parts.slice(0, index).join("/"));
  }
  return {
    schemaVersion: 1,
    ...(entryPath ? { entryPath } : {}),
    files: snapshot.files.map((file) => ({ path: file.path, content: file.content })),
    folders: [...folders].sort(compareText),
    bibliography: "",
    publicationProfile: defaultProjectPublicationProfile,
  };
}

function isImportPreviewInput(value: unknown): value is {
  installationId: number;
  owner: string;
  repository: string;
  branch: string;
  rootPath: string;
  entryPath?: string;
} {
  return (
    isRecord(value) &&
    typeof value.installationId === "number" &&
    typeof value.owner === "string" &&
    typeof value.repository === "string" &&
    typeof value.branch === "string" &&
    typeof value.rootPath === "string" &&
    (value.entryPath === undefined || typeof value.entryPath === "string")
  );
}

function isDefinitiveGitHubFailure(error: unknown): boolean {
  return (
    error instanceof GitHubClientError &&
    ["configuration", "authentication", "forbidden", "not-found", "branch-protected", "bounds"].includes(error.code)
  );
}

function githubErrorResponse(error: unknown): Response {
  if (error instanceof GitHubClientError) {
    const status =
      error.code === "configuration"
        ? 503
        : error.code === "bounds"
          ? 400
          : error.code === "remote-changed" || error.code === "branch-protected"
            ? 409
            : error.code === "not-found"
              ? 404
              : error.code === "authentication" || error.code === "forbidden"
                ? 403
                : 502;
    return jsonError(safeGitHubErrorMessage(error.code), status, error.code);
  }
  return jsonError("GitHub sync failed", 500);
}

function safeGitHubErrorMessage(code: GitHubClientError["code"]): string {
  switch (code) {
    case "configuration":
      return "GitHub App is not configured";
    case "authentication":
      return "GitHub authentication failed";
    case "forbidden":
      return "GitHub repository access was denied";
    case "not-found":
      return "GitHub repository or branch was not found";
    case "remote-changed":
      return "GitHub changed after the preview";
    case "branch-protected":
      return "GitHub rejected the direct branch update";
    case "bounds":
      return "GitHub content exceeds supported bounds";
    case "invalid-response":
      return "GitHub returned an invalid response";
  }
}

function jsonError(error: string, status: number, code?: string): Response {
  return Response.json({ ...(code ? { code } : {}), error }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
