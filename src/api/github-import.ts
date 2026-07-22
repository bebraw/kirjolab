import { defaultProjectPublicationProfile } from "../domain/workspace";
import { resolveTemplateEntryPath, type ProjectTemplateSeed } from "../domain/project-templates";
import type { GitHubRepositorySelection, GitHubRepositorySnapshot } from "../integrations/github-app";
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

export async function handleGitHubImportApi(
  request: Request,
  env: Env,
  identity: AuthIdentity,
  client: GitHubSyncRemoteClient = githubClient(env),
  authorize: GitHubSelectionAuthorizer = authorizeGitHubSelection,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "POST") return jsonError("GitHub sync route not found", 404);
  try {
    if (pathname === "/api/github/import-previews") return await previewImport(request, env, identity, client, authorize);
    if (pathname === "/api/github/imports") return await confirmImport(request, env, identity, client, authorize);
    return jsonError("GitHub sync route not found", 404);
  } catch (error) {
    return githubErrorResponse(error);
  }
}

async function previewImport(
  request: Request,
  env: Env,
  identity: AuthIdentity,
  client: GitHubSyncRemoteClient,
  authorize: GitHubSelectionAuthorizer,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isImportPreviewInput(body)) return jsonError("Invalid GitHub import preview", 400);
  const selection: GitHubRepositorySelection = {
    installationId: body.installationId,
    owner: body.owner,
    repository: body.repository,
    branch: body.branch,
    rootPath: body.rootPath,
  };
  const authorizedSelection = await authorize(identity, env, selection);
  const snapshot = await client.readMarkdownSnapshot(authorizedSelection);
  if (body.entryPath !== undefined && !snapshot.files.some((file) => file.path === body.entryPath)) {
    return jsonError("GitHub import entry file is unavailable", 400);
  }
  const seed = seedFromSnapshot(snapshot, body.entryPath);
  const entryPath = resolveTemplateEntryPath(seed);
  const preview = await env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).createGitHubImportPreview(
    authorizedSelection,
    snapshot,
    entryPath,
  );
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

async function confirmImport(
  request: Request,
  env: Env,
  identity: AuthIdentity,
  client: GitHubSyncRemoteClient,
  authorize: GitHubSelectionAuthorizer,
): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.previewId !== "string" || !githubOperationId.test(body.previewId) || typeof body.title !== "string") {
    return jsonError("Invalid GitHub import confirmation", 400);
  }
  const title = body.title.trim();
  if (!title || title.length > 120) return jsonError("Invalid GitHub import confirmation", 400);
  const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
  const preview = await catalog.getGitHubImportPreview(body.previewId);
  if (!preview) return jsonError("GitHub import preview is stale", 409, "stale-preview");
  const authorizedSelection = await authorize(identity, env, preview.selection);
  const current = await client.readMarkdownSnapshot(authorizedSelection);
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
