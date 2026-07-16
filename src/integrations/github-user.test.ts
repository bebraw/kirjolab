import { describe, expect, it, vi } from "vitest";
import { GitHubUserClient } from "./github-user";

const config = {
  clientId: "Iv1.1234567890abcdef",
  clientSecret: "client-secret-at-least-twenty-characters",
  apiBase: "https://api.github.test",
  oauthBase: "https://github.test",
};

describe("GitHub user authorization client", () => {
  it("builds an authorization URL and exchanges an expiring code", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        access_token: "access-token-at-least-twenty-characters",
        expires_in: 28_800,
        refresh_token: "refresh-token-at-least-twenty-characters",
        refresh_token_expires_in: 15_897_600,
      }),
    );
    const client = new GitHubUserClient(config, fetchMock);
    const authorization = new URL(client.authorizationUrl("https://kirjolab.test/api/github/callback", "secure-state"));
    expect(authorization.origin).toBe("https://github.test");
    expect(authorization.searchParams.get("state")).toBe("secure-state");

    const token = await client.exchangeCode("authorization-code", "https://kirjolab.test/api/github/callback", 0);
    expect(token).toEqual({
      accessToken: "access-token-at-least-twenty-characters",
      accessExpiresAt: "1970-01-01T08:00:00.000Z",
      refreshToken: "refresh-token-at-least-twenty-characters",
      refreshExpiresAt: "1970-07-04T00:00:00.000Z",
    });
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(String(request?.body)).not.toContain("secure-state");
  });

  it("lists only validated installations and repositories", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/user/installations?")) {
        return Response.json({
          installations: [{ id: 7, account: { id: 8, login: "bebraw", type: "User" } }],
        });
      }
      return Response.json({
        repositories: [
          {
            id: 99,
            owner: { login: "bebraw" },
            name: "kirjolab",
            full_name: "bebraw/kirjolab",
            private: true,
            default_branch: "main",
          },
        ],
      });
    });
    const client = new GitHubUserClient(config, fetchMock);

    await expect(client.listInstallations("user-token")).resolves.toEqual([
      { id: 7, accountId: "8", accountLogin: "bebraw", accountType: "User" },
    ]);
    await expect(client.listRepositories("user-token", 7)).resolves.toEqual([
      { id: 99, owner: "bebraw", name: "kirjolab", fullName: "bebraw/kirjolab", private: true, defaultBranch: "main" },
    ]);
  });

  it("bounds remote JSON before parsing", async () => {
    const client = new GitHubUserClient(
      config,
      async () => new Response("x", { headers: { "content-length": String(2 * 1024 * 1024 + 1) } }),
    );
    await expect(client.getUser("user-token")).rejects.toThrow("exceeds bounds");
  });
});
