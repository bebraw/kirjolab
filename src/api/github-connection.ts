import { GitHubUserClient, GitHubUserError, type GitHubUserInstallation, type GitHubUserToken } from "../integrations/github-user";
import type { GitHubRepositorySelection } from "../integrations/github-app";
import { decryptSecret, encryptSecret } from "../security/secret-box";
import type { AuthIdentity } from "../security/auth";

interface GitHubConnectionSecrets {
  readonly GITHUB_APP_CLIENT_SECRET?: string;
  readonly GITHUB_CONNECTION_ENCRYPTION_KEY?: string;
}

type WorkspaceCatalogStub = DurableObjectStub<import("../durable-objects/workspace-catalog").WorkspaceCatalog>;

export interface GitHubUserRemoteClient {
  authorizationUrl(redirectUri: string, state: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<GitHubUserToken>;
  refreshAccessToken(refreshToken: string): Promise<GitHubUserToken>;
  getUser(accessToken: string): Promise<{ readonly id: string; readonly login: string }>;
  listInstallations(accessToken: string): Promise<GitHubUserInstallation[]>;
  listRepositories(
    accessToken: string,
    installationId: number,
  ): Promise<
    readonly {
      readonly id: number;
      readonly owner: string;
      readonly name: string;
      readonly fullName: string;
      readonly private: boolean;
      readonly defaultBranch: string;
    }[]
  >;
  listBranches(
    accessToken: string,
    owner: string,
    repository: string,
  ): Promise<readonly { readonly name: string; readonly protected: boolean }[]>;
}

export async function handleGitHubConnectionApi(
  request: Request,
  env: Env,
  identity: AuthIdentity,
  client: GitHubUserRemoteClient = githubUserClient(env),
  encryptionKey?: string,
): Promise<Response> {
  const url = new URL(request.url);
  const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
  try {
    if (url.pathname === "/api/github/connection" && request.method === "GET") {
      const connection = await catalog.getGitHubConnection();
      return Response.json(
        connection
          ? { connected: true, user: { id: connection.githubUserId, login: connection.githubLogin }, connectedAt: connection.connectedAt }
          : { connected: false },
        privateResponse(),
      );
    }
    if (url.pathname === "/api/github/connection" && request.method === "DELETE") {
      await catalog.deleteGitHubConnection();
      return new Response(null, { status: 204, headers: privateHeaders() });
    }
    if (url.pathname === "/api/github/connect" && request.method === "GET") {
      const returnPath = safeReturnPath(url.searchParams.get("returnTo"));
      const state = await catalog.createGitHubFlowState("connect", returnPath);
      return redirect(client.authorizationUrl(callbackUrl(url), state));
    }
    if (url.pathname === "/api/github/callback" && request.method === "GET") {
      return await completeAuthorization(url, env, identity, catalog, client, encryptionKey);
    }
    if (url.pathname === "/api/github/install" && request.method === "GET") {
      if (!(await catalog.getGitHubConnection())) return jsonError("Connect GitHub before installing the app", 409);
      const state = await catalog.createGitHubFlowState("install", safeReturnPath(url.searchParams.get("returnTo")));
      const slug = env.GITHUB_APP_SLUG.trim();
      if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/u.test(slug)) {
        throw new GitHubUserError("configuration", "GitHub App slug is not configured");
      }
      const installationUrl = new URL(`/apps/${slug}/installations/new`, "https://github.com");
      installationUrl.searchParams.set("state", state);
      return redirect(installationUrl.href);
    }
    if (url.pathname === "/api/github/setup" && request.method === "GET") {
      return await completeInstallation(url, env, identity, catalog, client, encryptionKey);
    }
    if (url.pathname === "/api/github/installations" && request.method === "GET") {
      const { token } = await githubUserAccessToken(env, identity, client, encryptionKey);
      return Response.json({ installations: await client.listInstallations(token) }, privateResponse());
    }
    const repositoryList = /^\/api\/github\/installations\/(\d+)\/repositories$/u.exec(url.pathname);
    if (repositoryList?.[1] && request.method === "GET") {
      const installationId = Number(repositoryList[1]);
      const { token } = await githubUserAccessToken(env, identity, client, encryptionKey);
      await requireInstallation(client, token, installationId);
      return Response.json({ repositories: await client.listRepositories(token, installationId) }, privateResponse());
    }
    const branchList = /^\/api\/github\/installations\/(\d+)\/repositories\/(\d+)\/branches$/u.exec(url.pathname);
    if (branchList?.[1] && branchList[2] && request.method === "GET") {
      const installationId = Number(branchList[1]);
      const repositoryId = Number(branchList[2]);
      const { token } = await githubUserAccessToken(env, identity, client, encryptionKey);
      await requireInstallation(client, token, installationId);
      const repositories = await client.listRepositories(token, installationId);
      const repository = repositories.find((candidate) => candidate.id === repositoryId);
      if (!repository) return jsonError("GitHub repository is not accessible to the connected user", 403);
      const branches = await client.listBranches(token, repository.owner, repository.name);
      return Response.json({ repository, branches }, privateResponse());
    }
    return jsonError("GitHub connection route not found", 404);
  } catch (error) {
    return connectionErrorResponse(error);
  }
}

async function requireInstallation(client: GitHubUserRemoteClient, token: string, installationId: number): Promise<void> {
  if (!Number.isSafeInteger(installationId) || installationId <= 0)
    throw new GitHubUserError("bounds", "GitHub installation id is invalid");
  if (!(await client.listInstallations(token)).some((installation) => installation.id === installationId)) {
    throw new GitHubUserError("forbidden", "GitHub installation is not accessible to the connected user");
  }
}

async function githubUserAccessToken(
  env: Env,
  identity: AuthIdentity,
  client: GitHubUserRemoteClient = githubUserClient(env),
  configuredEncryptionKey?: string,
): Promise<{ readonly token: string; readonly login: string }> {
  const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
  const connection = await catalog.getGitHubConnection();
  if (!connection) throw new GitHubUserError("authorization", "GitHub is not connected");
  const encryptionKey = configuredEncryptionKey ?? githubEncryptionKey(env);
  const context = tokenContext(identity.ownerKey);
  if (connection.accessExpiresAt === null || Date.parse(connection.accessExpiresAt) > Date.now() + 60_000) {
    return { token: await decryptSecret(connection.encryptedAccessToken, encryptionKey, context), login: connection.githubLogin };
  }
  if (
    !connection.encryptedRefreshToken ||
    (connection.refreshExpiresAt !== null && Date.parse(connection.refreshExpiresAt) <= Date.now() + 60_000)
  ) {
    throw new GitHubUserError("authorization", "GitHub connection has expired; reconnect GitHub");
  }
  const refreshToken = await decryptSecret(connection.encryptedRefreshToken, encryptionKey, context);
  const refreshed = await client.refreshAccessToken(refreshToken);
  const stored = await encryptedConnectionTokens(refreshed, encryptionKey, context, refreshToken, connection.refreshExpiresAt);
  await catalog.setGitHubConnection({
    githubUserId: connection.githubUserId,
    githubLogin: connection.githubLogin,
    ...stored,
  });
  return { token: refreshed.accessToken, login: connection.githubLogin };
}

export async function authorizeGitHubSelection(
  identity: AuthIdentity,
  env: Env,
  selection: GitHubRepositorySelection,
  client: GitHubUserRemoteClient = githubUserClient(env),
  configuredEncryptionKey?: string,
): Promise<GitHubRepositorySelection> {
  const { token } = await githubUserAccessToken(env, identity, client, configuredEncryptionKey);
  const installations = await client.listInstallations(token);
  if (!installations.some((installation) => installation.id === selection.installationId)) {
    throw new GitHubUserError("forbidden", "GitHub installation is not accessible to the connected user");
  }
  const repositories = await client.listRepositories(token, selection.installationId);
  const repository = repositories.find(
    (candidate) =>
      candidate.owner.toLocaleLowerCase() === selection.owner.toLocaleLowerCase() &&
      candidate.name.toLocaleLowerCase() === selection.repository.toLocaleLowerCase(),
  );
  if (!repository) throw new GitHubUserError("forbidden", "GitHub repository is not accessible to the connected user");
  if (selection.repositoryId !== undefined && selection.repositoryId !== repository.id) {
    throw new GitHubUserError("forbidden", "GitHub repository identity changed");
  }
  return { ...selection, repositoryId: repository.id, owner: repository.owner, repository: repository.name };
}

async function completeAuthorization(
  url: URL,
  env: Env,
  identity: AuthIdentity,
  catalog: WorkspaceCatalogStub,
  client: GitHubUserRemoteClient,
  configuredEncryptionKey?: string,
): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  const flow = await catalog.consumeGitHubFlowState(state, "connect");
  if (!flow) return jsonError("GitHub authorization state is invalid or expired", 400);
  const code = url.searchParams.get("code") ?? "";
  const token = await client.exchangeCode(code, callbackUrl(url));
  const user = await client.getUser(token.accessToken);
  const encryptionKey = configuredEncryptionKey ?? githubEncryptionKey(env);
  await catalog.setGitHubConnection({
    githubUserId: user.id,
    githubLogin: user.login,
    ...(await encryptedConnectionTokens(token, encryptionKey, tokenContext(identity.ownerKey))),
  });
  return resultRedirect(url, flow.returnPath, "connected");
}

async function completeInstallation(
  url: URL,
  env: Env,
  identity: AuthIdentity,
  catalog: WorkspaceCatalogStub,
  client: GitHubUserRemoteClient,
  configuredEncryptionKey?: string,
): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  const flow = await catalog.consumeGitHubFlowState(state, "install");
  if (!flow) return jsonError("GitHub installation state is invalid or expired", 400);
  const installationId = Number(url.searchParams.get("installation_id"));
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return jsonError("GitHub installation is invalid", 400);
  const { token } = await githubUserAccessToken(env, identity, client, configuredEncryptionKey);
  const installations = await client.listInstallations(token);
  if (!installations.some((installation) => installation.id === installationId)) {
    return jsonError("GitHub installation is not accessible to the connected user", 403);
  }
  return resultRedirect(url, flow.returnPath, "installed");
}

async function encryptedConnectionTokens(
  token: GitHubUserToken,
  encryptionKey: string,
  context: string,
  fallbackRefreshToken: string | null = null,
  fallbackRefreshExpiresAt: string | null = null,
): Promise<{
  encryptedAccessToken: string;
  accessExpiresAt: string | null;
  encryptedRefreshToken: string | null;
  refreshExpiresAt: string | null;
}> {
  const refreshToken = token.refreshToken ?? fallbackRefreshToken;
  return {
    encryptedAccessToken: await encryptSecret(token.accessToken, encryptionKey, context),
    accessExpiresAt: token.accessExpiresAt,
    encryptedRefreshToken: refreshToken ? await encryptSecret(refreshToken, encryptionKey, context) : null,
    refreshExpiresAt: token.refreshExpiresAt ?? fallbackRefreshExpiresAt,
  };
}

function githubUserClient(env: Env): GitHubUserClient {
  const secrets = env as Env & GitHubConnectionSecrets;
  return new GitHubUserClient({
    clientId: env.GITHUB_APP_CLIENT_ID,
    clientSecret: secrets.GITHUB_APP_CLIENT_SECRET ?? "",
  });
}

function githubEncryptionKey(env: Env): string {
  const key = (env as Env & GitHubConnectionSecrets).GITHUB_CONNECTION_ENCRYPTION_KEY?.trim() ?? "";
  if (!key) throw new GitHubUserError("configuration", "GitHub connection encryption is not configured");
  return key;
}

function tokenContext(ownerKey: string): string {
  return `github-user:${ownerKey}`;
}

function callbackUrl(url: URL): string {
  return `${url.origin}/api/github/callback`;
}

function safeReturnPath(value: string | null): string {
  if (!value || value.length > 500 || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://kirjolab.invalid");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function resultRedirect(requestUrl: URL, returnPath: string, result: "connected" | "installed"): Response {
  const target = new URL(returnPath, requestUrl.origin);
  target.searchParams.set("github", result);
  return redirect(target.href);
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location, ...privateHeaders() } });
}

function privateResponse(): ResponseInit {
  return { headers: privateHeaders() };
}

function privateHeaders(): Record<string, string> {
  return { "cache-control": "no-store", "referrer-policy": "no-referrer" };
}

function connectionErrorResponse(error: unknown): Response {
  if (error instanceof GitHubUserError) {
    const status = error.code === "configuration" ? 503 : error.code === "authorization" ? 401 : error.code === "forbidden" ? 403 : 502;
    return jsonError(error.message, status);
  }
  if (error instanceof TypeError) return jsonError("GitHub connection storage is unavailable", 503);
  console.error(
    JSON.stringify({
      event: "github-connection-unexpected-error",
      error: error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError" },
    }),
  );
  return jsonError("GitHub connection failed", 500);
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: privateHeaders() });
}
