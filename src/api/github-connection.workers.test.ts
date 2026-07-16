import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { GitHubUserInstallation, GitHubUserToken } from "../integrations/github-user";
import type { AuthIdentity } from "../security/auth";
import { authorizeGitHubSelection, handleGitHubConnectionApi, type GitHubUserRemoteClient } from "./github-connection";

const encryptionKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("GitHub user connection API in the Workers runtime", () => {
  it("binds OAuth and installation callbacks to one Kirjolab owner", async () => {
    const identity = testIdentity();
    const client = new FakeGitHubUserClient();

    const connect = await handleGitHubConnectionApi(
      new Request("https://kirjolab.test/api/github/connect?returnTo=%2F%3Fnew%3Dgithub"),
      env,
      identity,
      client,
      encryptionKey,
    );
    expect(connect.status).toBe(302);
    const authorization = new URL(connect.headers.get("location")!);
    const state = authorization.searchParams.get("state")!;

    const callback = await handleGitHubConnectionApi(
      new Request(`https://kirjolab.test/api/github/callback?code=oauth-code&state=${state}`),
      env,
      identity,
      client,
      encryptionKey,
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("https://kirjolab.test/?new=github&github=connected");

    const status = await handleGitHubConnectionApi(
      new Request("https://kirjolab.test/api/github/connection"),
      env,
      identity,
      client,
      encryptionKey,
    );
    await expect(status.json()).resolves.toEqual({
      connected: true,
      user: { id: "42", login: "researcher" },
      connectedAt: expect.any(String),
    });
    const stored = await env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).getGitHubConnection();
    expect(stored?.encryptedAccessToken).not.toContain("access-token");
    await expect(
      authorizeGitHubSelection(
        identity,
        env,
        { installationId: 7, owner: "researcher", repository: "manuscript", branch: "main", rootPath: "" },
        client,
        encryptionKey,
      ),
    ).resolves.toMatchObject({ installationId: 7, repositoryId: 99, owner: "researcher", repository: "manuscript" });
    const installations = await handleGitHubConnectionApi(
      new Request("https://kirjolab.test/api/github/installations"),
      env,
      identity,
      client,
      encryptionKey,
    );
    await expect(installations.json()).resolves.toMatchObject({ installations: [{ id: 7, accountLogin: "researcher" }] });
    const repositories = await handleGitHubConnectionApi(
      new Request("https://kirjolab.test/api/github/installations/7/repositories"),
      env,
      identity,
      client,
      encryptionKey,
    );
    await expect(repositories.json()).resolves.toMatchObject({ repositories: [{ id: 99, fullName: "researcher/manuscript" }] });
    const branches = await handleGitHubConnectionApi(
      new Request("https://kirjolab.test/api/github/installations/7/repositories/99/branches"),
      env,
      identity,
      client,
      encryptionKey,
    );
    await expect(branches.json()).resolves.toMatchObject({ repository: { id: 99 }, branches: [{ name: "main" }] });

    const install = await handleGitHubConnectionApi(
      new Request("https://kirjolab.test/api/github/install?returnTo=%2F%3Fnew%3Dgithub"),
      env,
      identity,
      client,
      encryptionKey,
    );
    const installation = new URL(install.headers.get("location")!);
    expect(installation.pathname).toBe("/apps/kirjolab-sync-bebraw/installations/new");
    const installState = installation.searchParams.get("state")!;
    const setup = await handleGitHubConnectionApi(
      new Request(`https://kirjolab.test/api/github/setup?installation_id=7&state=${installState}`),
      env,
      identity,
      client,
      encryptionKey,
    );
    expect(setup.status).toBe(302);
    expect(setup.headers.get("location")).toBe("https://kirjolab.test/?new=github&github=installed");
  });

  it("rejects spoofed installation ids and deletes only the current owner's connection", async () => {
    const identity = testIdentity();
    const client = new FakeGitHubUserClient();
    await connectIdentity(identity, client);
    const install = await handleGitHubConnectionApi(
      new Request("https://kirjolab.test/api/github/install"),
      env,
      identity,
      client,
      encryptionKey,
    );
    const state = new URL(install.headers.get("location")!).searchParams.get("state")!;
    const spoofed = await handleGitHubConnectionApi(
      new Request(`https://kirjolab.test/api/github/setup?installation_id=8&state=${state}`),
      env,
      identity,
      client,
      encryptionKey,
    );
    expect(spoofed.status).toBe(403);

    const disconnected = await handleGitHubConnectionApi(
      new Request("https://kirjolab.test/api/github/connection", { method: "DELETE" }),
      env,
      identity,
      client,
      encryptionKey,
    );
    expect(disconnected.status).toBe(204);
    expect(await env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).getGitHubConnection()).toBeNull();
  });
});

class FakeGitHubUserClient implements GitHubUserRemoteClient {
  authorizationUrl(redirectUri: string, state: string): string {
    const url = new URL("https://github.test/login/oauth/authorize");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.href;
  }

  async exchangeCode(): Promise<GitHubUserToken> {
    return {
      accessToken: "access-token-at-least-twenty-characters",
      accessExpiresAt: "2099-01-01T00:00:00.000Z",
      refreshToken: "refresh-token-at-least-twenty-characters",
      refreshExpiresAt: "2099-07-01T00:00:00.000Z",
    };
  }

  async refreshAccessToken(): Promise<GitHubUserToken> {
    throw new Error("Token should not expire in this test");
  }

  async getUser(): Promise<{ id: string; login: string }> {
    return { id: "42", login: "researcher" };
  }

  async listInstallations(): Promise<GitHubUserInstallation[]> {
    return [{ id: 7, accountId: "42", accountLogin: "researcher", accountType: "User" }];
  }

  async listRepositories(): Promise<
    { id: number; owner: string; name: string; fullName: string; private: boolean; defaultBranch: string }[]
  > {
    return [{ id: 99, owner: "researcher", name: "manuscript", fullName: "researcher/manuscript", private: true, defaultBranch: "main" }];
  }

  async listBranches(): Promise<{ name: string; protected: boolean }[]> {
    return [{ name: "main", protected: false }];
  }
}

function testIdentity(): AuthIdentity {
  const suffix = crypto.randomUUID();
  return { subject: `local:${suffix}`, email: `${suffix}@example.test`, ownerKey: `github-connection-${suffix}`, mode: "local" };
}

async function connectIdentity(identity: AuthIdentity, client: GitHubUserRemoteClient): Promise<void> {
  const connect = await handleGitHubConnectionApi(
    new Request("https://kirjolab.test/api/github/connect"),
    env,
    identity,
    client,
    encryptionKey,
  );
  const state = new URL(connect.headers.get("location")!).searchParams.get("state")!;
  const callback = await handleGitHubConnectionApi(
    new Request(`https://kirjolab.test/api/github/callback?code=oauth-code&state=${state}`),
    env,
    identity,
    client,
    encryptionKey,
  );
  expect(callback.status).toBe(302);
}
