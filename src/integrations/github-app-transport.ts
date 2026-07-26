import { createAppAuth } from "@octokit/auth-app";
import * as v from "valibot";
import { parseResponseJson, readBoundedResponseText } from "./bounded-response";

export interface GitHubAppConfig {
  readonly appId: string;
  readonly privateKey: string;
  readonly apiBase?: string;
}

type GitHubClientErrorCode =
  | "configuration"
  | "authentication"
  | "forbidden"
  | "not-found"
  | "remote-changed"
  | "branch-protected"
  | "invalid-response"
  | "bounds";

export class GitHubClientError extends Error {
  readonly code: GitHubClientErrorCode;
  readonly status: number | null;

  constructor(code: GitHubClientErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "GitHubClientError";
    this.code = code;
    this.status = status;
  }
}

export type GitHubInstallationRequest = (path: string, init?: RequestInit) => Promise<unknown>;
type FetchExternal = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const maximumJsonBytes = 8 * 1024 * 1024;
const githubApiVersion = "2022-11-28";
const positiveIntegerSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1));
const installationTokenSchema = v.object({ token: v.pipe(v.string(), v.minLength(20)) });
const providerErrorSchema = v.object({ message: v.pipe(v.string(), v.maxLength(500)) });

export class GitHubAppTransport {
  readonly #config: GitHubAppConfig;
  readonly #fetch: FetchExternal;
  readonly #auth: ReturnType<typeof createAppAuth>;

  constructor(config: GitHubAppConfig, fetchExternal: FetchExternal = (input, init) => fetch(input, init)) {
    this.#config = validateConfig(config);
    this.#fetch = fetchExternal;
    this.#auth = createAppAuth({
      appId: this.#config.appId,
      privateKey: this.#config.privateKey,
    });
  }

  async forInstallation(installationId: number, repositoryId?: number): Promise<GitHubInstallationRequest> {
    if (!v.is(positiveIntegerSchema, installationId)) throw new GitHubClientError("bounds", "GitHub installation id is invalid");
    if (repositoryId !== undefined && !v.is(positiveIntegerSchema, repositoryId)) {
      throw new GitHubClientError("bounds", "GitHub repository id is invalid");
    }
    let jwt: string;
    try {
      jwt = (await this.#auth({ type: "app" })).token;
    } catch {
      throw new GitHubClientError("configuration", "GitHub App private key is invalid");
    }
    const value = await this.#request(jwt, `/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      ...(repositoryId === undefined ? {} : { body: JSON.stringify({ repository_ids: [repositoryId] }) }),
    });
    if (!v.is(installationTokenSchema, value)) {
      throw new GitHubClientError("authentication", "GitHub installation token response is invalid");
    }
    const token = value.token;
    return (path, init) => this.#request(token, path, init);
  }

  async #request(token: string, path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.#fetch(`${this.#config.apiBase ?? "https://api.github.com"}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "Kirjolab-GitHub-App",
        "x-github-api-version": githubApiVersion,
        ...headersRecord(init.headers),
      },
    });
    const body = await readBoundedResponseText(
      response,
      maximumJsonBytes,
      () => new GitHubClientError("bounds", "GitHub response exceeds bounds"),
    );
    if (!response.ok) throw githubResponseError(response.status, body);
    return parseResponseJson(body, () => invalidResponse("GitHub returned invalid JSON"));
  }
}

export function invalidResponse(message: string): GitHubClientError {
  return new GitHubClientError("invalid-response", message);
}

function validateConfig(config: GitHubAppConfig): GitHubAppConfig {
  if (!/^\d{1,20}$/u.test(config.appId.trim()) || !config.privateKey.trim()) {
    throw new GitHubClientError("configuration", "GitHub App credentials are not configured");
  }
  const apiBase = config.apiBase?.replace(/\/+$/u, "");
  if (apiBase && !/^https?:\/\//u.test(apiBase)) throw new GitHubClientError("configuration", "GitHub API base URL is invalid");
  return { appId: config.appId.trim(), privateKey: config.privateKey, ...(apiBase ? { apiBase } : {}) };
}

function githubResponseError(status: number, body: string): GitHubClientError {
  let message = "GitHub request failed";
  try {
    const value: unknown = JSON.parse(body);
    if (v.is(providerErrorSchema, value)) message = value.message;
  } catch {
    // Keep the bounded generic message for non-JSON error bodies.
  }
  const code: GitHubClientErrorCode =
    status === 401 ? "authentication" : status === 403 ? "forbidden" : status === 404 ? "not-found" : "invalid-response";
  return new GitHubClientError(code, message, status);
}

function headersRecord(value: HeadersInit | undefined): Record<string, string> {
  if (!value) return {};
  return Object.fromEntries(new Headers(value).entries());
}
