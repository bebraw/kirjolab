import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deploymentCapabilities, gitHubIntegrationAvailable, type GitHubDeploymentEnvironment } from "./deployment-capabilities";

const githubPrivateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" }).toString();

const configuredGitHub = {
  GITHUB_APP_ID: "4313375",
  GITHUB_APP_CLIENT_ID: "Iv23liaAOSbgwDC77xsz",
  GITHUB_APP_SLUG: "kirjolab-sync-bebraw",
  GITHUB_APP_PRIVATE_KEY: githubPrivateKey,
  GITHUB_APP_CLIENT_SECRET: "configured-client-secret",
  GITHUB_CONNECTION_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
} satisfies GitHubDeploymentEnvironment;

const requiredGitHubConfiguration = [
  "GITHUB_APP_ID",
  "GITHUB_APP_CLIENT_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_CLIENT_SECRET",
  "GITHUB_CONNECTION_ENCRYPTION_KEY",
] as const;

describe("deployment capabilities", () => {
  it("disables optional integrations when Worker bindings are unavailable", () => {
    expect(gitHubIntegrationAvailable(undefined)).toBe(false);
    expect(deploymentCapabilities(undefined)).toEqual({ github: false });
  });

  it("enables GitHub only for a complete valid deployment configuration", () => {
    expect(gitHubIntegrationAvailable(configuredGitHub)).toBe(true);
    expect(deploymentCapabilities(configuredGitHub)).toEqual({ github: true });
  });

  it.each(requiredGitHubConfiguration)("disables GitHub when %s is missing or blank", (field) => {
    const missing = { ...configuredGitHub };
    Reflect.deleteProperty(missing, field);

    expect(gitHubIntegrationAvailable(missing)).toBe(false);
    expect(gitHubIntegrationAvailable({ ...configuredGitHub, [field]: "" })).toBe(false);
    expect(gitHubIntegrationAvailable({ ...configuredGitHub, [field]: "   " })).toBe(false);
  });

  it("rejects malformed public identifiers and encryption keys", () => {
    expect(gitHubIntegrationAvailable({ ...configuredGitHub, GITHUB_APP_ID: "not-an-id" })).toBe(false);
    expect(gitHubIntegrationAvailable({ ...configuredGitHub, GITHUB_APP_CLIENT_ID: "short" })).toBe(false);
    expect(gitHubIntegrationAvailable({ ...configuredGitHub, GITHUB_APP_SLUG: "-invalid-" })).toBe(false);
    expect(gitHubIntegrationAvailable({ ...configuredGitHub, GITHUB_APP_PRIVATE_KEY: "not-a-private-key" })).toBe(false);
    expect(gitHubIntegrationAvailable({ ...configuredGitHub, GITHUB_CONNECTION_ENCRYPTION_KEY: "AAAA" })).toBe(false);
  });
});
