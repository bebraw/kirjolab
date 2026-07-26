import * as v from "valibot";
import { parseResponseJson, readBoundedResponseText } from "./bounded-response";

export interface GitHubUserClientConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly apiBase?: string;
  readonly oauthBase?: string;
}

export interface GitHubUserToken {
  readonly accessToken: string;
  readonly accessExpiresAt: string | null;
  readonly refreshToken: string | null;
  readonly refreshExpiresAt: string | null;
}

export interface GitHubUserIdentity {
  readonly id: string;
  readonly login: string;
}

export interface GitHubUserInstallation {
  readonly id: number;
  readonly accountId: string;
  readonly accountLogin: string;
  readonly accountType: "Organization" | "User";
}

export interface GitHubUserRepository {
  readonly id: number;
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly defaultBranch: string;
}

export interface GitHubRepositoryBranch {
  readonly name: string;
  readonly protected: boolean;
}

type FetchExternal = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const maximumJsonBytes = 2 * 1024 * 1024;
const maximumPages = 5;
const githubApiVersion = "2022-11-28";
const positiveIntegerSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1));
const gitHubIdSchema = v.union([positiveIntegerSchema, v.pipe(v.string(), v.regex(/^\d{1,30}$/u))]);
const loginSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u));
const repositoryNameSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_.-]{1,100}$/u));
const branchNameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(255));
const userIdentitySchema = v.object({ id: gitHubIdSchema, login: loginSchema });
const installationSchema = v.object({
  id: positiveIntegerSchema,
  account: v.object({ id: gitHubIdSchema, login: loginSchema, type: v.picklist(["Organization", "User"]) }),
});
const repositorySchema = v.object({
  id: positiveIntegerSchema,
  owner: v.object({ login: loginSchema }),
  name: repositoryNameSchema,
  full_name: v.string(),
  private: v.boolean(),
  default_branch: branchNameSchema,
});
const branchSchema = v.object({ name: branchNameSchema, protected: v.boolean() });
const installationListSchema = v.object({ installations: v.array(installationSchema) });
const repositoryListSchema = v.object({ repositories: v.array(repositorySchema) });

export class GitHubUserClient {
  readonly #config: GitHubUserClientConfig;
  readonly #fetch: FetchExternal;

  constructor(config: GitHubUserClientConfig, fetchExternal: FetchExternal = (input, init) => fetch(input, init)) {
    this.#config = normalizeConfig(config);
    this.#fetch = fetchExternal;
  }

  authorizationUrl(redirectUri: string, state: string): string {
    requireOAuthConfiguration(this.#config);
    const url = new URL("/login/oauth/authorize", this.#config.oauthBase ?? "https://github.com");
    url.searchParams.set("client_id", this.#config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.href;
  }

  async exchangeCode(code: string, redirectUri: string, now = Date.now()): Promise<GitHubUserToken> {
    if (!code || code.length > 512) throw new GitHubUserError("authorization", "GitHub authorization code is invalid");
    return await this.#tokenRequest({ code, redirect_uri: redirectUri }, now);
  }

  async refreshAccessToken(refreshToken: string, now = Date.now()): Promise<GitHubUserToken> {
    if (!refreshToken || refreshToken.length > 1_024) throw new GitHubUserError("authorization", "GitHub refresh token is invalid");
    return await this.#tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, now);
  }

  async getUser(accessToken: string): Promise<GitHubUserIdentity> {
    const value = await this.#apiRequest(accessToken, "/user");
    const parsed = v.safeParse(userIdentitySchema, value);
    if (!parsed.success) throw new GitHubUserError("invalid-response", "GitHub user response is invalid");
    return { id: String(parsed.output.id), login: parsed.output.login };
  }

  async listInstallations(accessToken: string): Promise<GitHubUserInstallation[]> {
    const installations: GitHubUserInstallation[] = [];
    for (let page = 1; page <= maximumPages; page += 1) {
      const value = await this.#apiRequest(accessToken, `/user/installations?per_page=100&page=${page}`);
      const parsed = v.safeParse(installationListSchema, value);
      if (!parsed.success) throw new GitHubUserError("invalid-response", "GitHub installation response is invalid");
      for (const installation of parsed.output.installations) {
        installations.push({
          id: installation.id,
          accountId: String(installation.account.id),
          accountLogin: installation.account.login,
          accountType: installation.account.type,
        });
      }
      if (parsed.output.installations.length < 100) return installations;
    }
    throw new GitHubUserError("bounds", "GitHub installation list exceeds supported bounds");
  }

  async listRepositories(accessToken: string, installationId: number): Promise<GitHubUserRepository[]> {
    if (!v.is(positiveIntegerSchema, installationId)) throw new GitHubUserError("bounds", "GitHub installation id is invalid");
    const repositories: GitHubUserRepository[] = [];
    for (let page = 1; page <= maximumPages; page += 1) {
      const value = await this.#apiRequest(accessToken, `/user/installations/${installationId}/repositories?per_page=100&page=${page}`);
      const parsed = v.safeParse(repositoryListSchema, value);
      if (!parsed.success) throw new GitHubUserError("invalid-response", "GitHub repository response is invalid");
      repositories.push(
        ...parsed.output.repositories.map((repository) => ({
          id: repository.id,
          owner: repository.owner.login,
          name: repository.name,
          fullName: repository.full_name,
          private: repository.private,
          defaultBranch: repository.default_branch,
        })),
      );
      if (parsed.output.repositories.length < 100) return repositories;
    }
    throw new GitHubUserError("bounds", "GitHub repository list exceeds supported bounds");
  }

  async listBranches(accessToken: string, owner: string, repository: string): Promise<GitHubRepositoryBranch[]> {
    if (!v.is(loginSchema, owner) || !v.is(repositoryNameSchema, repository)) {
      throw new GitHubUserError("bounds", "GitHub repository identity is invalid");
    }
    const branches: GitHubRepositoryBranch[] = [];
    for (let page = 1; page <= maximumPages; page += 1) {
      const value = await this.#apiRequest(
        accessToken,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/branches?per_page=100&page=${page}`,
      );
      const parsed = v.safeParse(v.array(branchSchema), value);
      if (!parsed.success) throw new GitHubUserError("invalid-response", "GitHub branch response is invalid");
      branches.push(...parsed.output);
      if (parsed.output.length < 100) return branches;
    }
    throw new GitHubUserError("bounds", "GitHub branch list exceeds supported bounds");
  }

  async #tokenRequest(parameters: Record<string, string>, now: number): Promise<GitHubUserToken> {
    requireOAuthConfiguration(this.#config);
    const body = new URLSearchParams({ client_id: this.#config.clientId, client_secret: this.#config.clientSecret, ...parameters });
    const response = await this.#fetch(new URL("/login/oauth/access_token", this.#config.oauthBase ?? "https://github.com"), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const value = await responseJson(response);
    if (!response.ok) throw responseError(response.status, value);
    if (!isRecord(value) || typeof value.access_token !== "string" || value.access_token.length < 20) {
      throw new GitHubUserError("invalid-response", "GitHub token response is invalid");
    }
    const expiresIn = optionalPositiveNumber(value.expires_in);
    const refreshExpiresIn = optionalPositiveNumber(value.refresh_token_expires_in);
    const refreshToken = typeof value.refresh_token === "string" && value.refresh_token ? value.refresh_token : null;
    return {
      accessToken: value.access_token,
      accessExpiresAt: expiresIn === null ? null : new Date(now + expiresIn * 1_000).toISOString(),
      refreshToken,
      refreshExpiresAt: refreshExpiresIn === null ? null : new Date(now + refreshExpiresIn * 1_000).toISOString(),
    };
  }

  async #apiRequest(accessToken: string, path: string): Promise<unknown> {
    if (!accessToken) throw new GitHubUserError("authorization", "GitHub user access token is unavailable");
    const response = await this.#fetch(`${this.#config.apiBase ?? "https://api.github.com"}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${accessToken}`,
        "user-agent": "Kirjolab-GitHub-User",
        "x-github-api-version": githubApiVersion,
      },
    });
    const value = await responseJson(response);
    if (!response.ok) throw responseError(response.status, value);
    return value;
  }
}

export type GitHubUserErrorCode = "configuration" | "authorization" | "forbidden" | "not-found" | "invalid-response" | "bounds";

export class GitHubUserError extends Error {
  readonly code: GitHubUserErrorCode;
  readonly status: number | null;

  constructor(code: GitHubUserErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "GitHubUserError";
    this.code = code;
    this.status = status;
  }
}

function normalizeConfig(config: GitHubUserClientConfig): GitHubUserClientConfig {
  const apiBase = config.apiBase?.replace(/\/+$/u, "");
  const oauthBase = config.oauthBase?.replace(/\/+$/u, "");
  if (apiBase && !/^https?:\/\//u.test(apiBase)) throw new GitHubUserError("configuration", "GitHub API base URL is invalid");
  if (oauthBase && !/^https?:\/\//u.test(oauthBase)) throw new GitHubUserError("configuration", "GitHub OAuth base URL is invalid");
  return {
    clientId: config.clientId.trim(),
    clientSecret: config.clientSecret,
    ...(apiBase ? { apiBase } : {}),
    ...(oauthBase ? { oauthBase } : {}),
  };
}

function requireOAuthConfiguration(config: GitHubUserClientConfig): void {
  if (!/^[A-Za-z0-9._-]{10,100}$/u.test(config.clientId) || config.clientSecret.length < 20) {
    throw new GitHubUserError("configuration", "GitHub user authorization is not configured");
  }
}

async function responseJson(response: Response): Promise<unknown> {
  const text = await readBoundedResponseText(
    response,
    maximumJsonBytes,
    () => new GitHubUserError("bounds", "GitHub response exceeds bounds"),
  );
  return parseResponseJson(text, () => new GitHubUserError("invalid-response", "GitHub returned invalid JSON"));
}

function responseError(status: number, value: unknown): GitHubUserError {
  const message =
    isRecord(value) && typeof value.error_description === "string" ? value.error_description.slice(0, 500) : "GitHub request failed";
  const code: GitHubUserErrorCode =
    status === 401 ? "authorization" : status === 403 ? "forbidden" : status === 404 ? "not-found" : "invalid-response";
  return new GitHubUserError(code, message, status);
}

function optionalPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
