import {
  GitHubAppClient,
  GitHubClientError,
  type GitHubRepositorySelection,
  type GitHubRepositorySnapshot,
} from "../integrations/github-app";
import { GitHubUserError, type GitHubUserErrorCode } from "../integrations/github-user";
import type { AuthIdentity } from "../security/auth";

interface GitHubSecretEnvironment {
  readonly GITHUB_APP_PRIVATE_KEY?: string;
}

const githubUserErrorStatuses = {
  configuration: 503,
  authorization: 401,
  forbidden: 403,
  "not-found": 502,
  "invalid-response": 502,
  bounds: 502,
} satisfies Record<GitHubUserErrorCode, number>;
const githubUserErrorMessages = {
  configuration: "GitHub user connection is not configured",
  authorization: "Connect GitHub to continue",
  forbidden: "GitHub installation or repository access was denied",
  "not-found": "GitHub user authorization failed",
  "invalid-response": "GitHub user authorization failed",
  bounds: "GitHub user authorization failed",
} satisfies Record<GitHubUserErrorCode, string>;
const githubClientErrorStatuses = {
  configuration: 503,
  bounds: 400,
  "remote-changed": 409,
  "branch-protected": 409,
  "not-found": 404,
  authentication: 403,
  forbidden: 403,
  "invalid-response": 502,
} satisfies Record<GitHubClientError["code"], number>;
const githubClientErrorMessages = {
  configuration: "GitHub App is not configured",
  authentication: "GitHub authentication failed",
  forbidden: "GitHub repository access was denied",
  "not-found": "GitHub repository or branch was not found",
  "remote-changed": "GitHub changed after the preview",
  "branch-protected": "GitHub rejected the direct branch update",
  bounds: "GitHub content exceeds supported bounds",
  "invalid-response": "GitHub returned an invalid response",
} satisfies Record<GitHubClientError["code"], string>;

export interface GitHubSyncRemoteClient {
  readMarkdownSnapshot(selection: GitHubRepositorySelection): Promise<GitHubRepositorySnapshot>;
  createCommit(
    selection: GitHubRepositorySelection,
    expectedHead: string,
    message: string,
    changes: readonly { readonly path: string; readonly content: string | null }[],
  ): Promise<string>;
}

export type GitHubSelectionAuthorizer = (
  identity: AuthIdentity,
  env: Env,
  selection: GitHubRepositorySelection,
) => Promise<GitHubRepositorySelection>;

export function githubClient(env: Env): GitHubAppClient {
  const privateKey = (env as Env & GitHubSecretEnvironment).GITHUB_APP_PRIVATE_KEY ?? "";
  return new GitHubAppClient({ appId: env.GITHUB_APP_ID, privateKey });
}

export function githubErrorResponse(error: unknown): Response {
  if (error instanceof GitHubUserError) {
    return jsonError(githubUserErrorMessages[error.code], githubUserErrorStatuses[error.code], error.code);
  }
  if (error instanceof GitHubClientError) {
    return jsonError(githubClientErrorMessages[error.code], githubClientErrorStatuses[error.code], error.code);
  }
  console.error(
    JSON.stringify({
      event: "github-sync-unexpected-error",
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { type: typeof error },
    }),
  );
  return jsonError("GitHub sync failed", 500);
}

export function jsonError(error: string, status: number, code?: string): Response {
  return Response.json({ ...(code ? { code } : {}), error }, { status });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const githubOperationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
