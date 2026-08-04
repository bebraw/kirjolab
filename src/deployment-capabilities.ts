import { isSecretEncryptionKey } from "./security/secret-box";
import { isGitHubAppPrivateKey } from "./integrations/github-app-transport";

export interface GitHubDeploymentEnvironment {
  readonly GITHUB_APP_ID?: string;
  readonly GITHUB_APP_CLIENT_ID?: string;
  readonly GITHUB_APP_SLUG?: string;
  readonly GITHUB_APP_PRIVATE_KEY?: string;
  readonly GITHUB_APP_CLIENT_SECRET?: string;
  readonly GITHUB_CONNECTION_ENCRYPTION_KEY?: string;
}

export interface DeploymentCapabilities {
  readonly github: boolean;
}

const githubAppId = /^\d{1,20}$/u;
const githubClientId = /^[A-Za-z0-9._-]{10,100}$/u;
const githubAppSlug = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/u;

export function deploymentCapabilities(env: GitHubDeploymentEnvironment | undefined): DeploymentCapabilities {
  return { github: gitHubIntegrationAvailable(env) };
}

export function gitHubIntegrationAvailable(env: GitHubDeploymentEnvironment | undefined): boolean {
  return (
    githubAppId.test(env?.GITHUB_APP_ID?.trim() ?? "") &&
    githubClientId.test(env?.GITHUB_APP_CLIENT_ID?.trim() ?? "") &&
    githubAppSlug.test(env?.GITHUB_APP_SLUG?.trim() ?? "") &&
    isGitHubAppPrivateKey(env?.GITHUB_APP_PRIVATE_KEY ?? "") &&
    (env?.GITHUB_APP_CLIENT_SECRET?.trim().length ?? 0) >= 20 &&
    isSecretEncryptionKey(env?.GITHUB_CONNECTION_ENCRYPTION_KEY ?? "")
  );
}
