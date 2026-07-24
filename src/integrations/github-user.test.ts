import { describe, expect, it, vi } from "vitest";
import { GitHubUserClient, GitHubUserError } from "./github-user";

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
    expect(authorization.pathname).toBe("/login/oauth/authorize");
    expect(Object.fromEntries(authorization.searchParams)).toEqual({
      client_id: config.clientId,
      redirect_uri: "https://kirjolab.test/api/github/callback",
      state: "secure-state",
    });

    const token = await client.exchangeCode("authorization-code", "https://kirjolab.test/api/github/callback", 0);
    expect(token).toEqual({
      accessToken: "access-token-at-least-twenty-characters",
      accessExpiresAt: "1970-01-01T08:00:00.000Z",
      refreshToken: "refresh-token-at-least-twenty-characters",
      refreshExpiresAt: "1970-07-04T00:00:00.000Z",
    });
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(request?.headers).toEqual({ accept: "application/json", "content-type": "application/x-www-form-urlencoded" });
    expect(String(request?.body)).toContain("code=authorization-code");
    expect(String(request?.body)).toContain("redirect_uri=https%3A%2F%2Fkirjolab.test%2Fapi%2Fgithub%2Fcallback");
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
      if (url.includes("/repositories?"))
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
      return Response.json([
        { name: "main", protected: true },
        { name: "draft", protected: false },
      ]);
    });
    const client = new GitHubUserClient(config, fetchMock);

    await expect(client.listInstallations("user-token")).resolves.toEqual([
      { id: 7, accountId: "8", accountLogin: "bebraw", accountType: "User" },
    ]);
    await expect(client.listRepositories("user-token", 7)).resolves.toEqual([
      { id: 99, owner: "bebraw", name: "kirjolab", fullName: "bebraw/kirjolab", private: true, defaultBranch: "main" },
    ]);
    await expect(client.listBranches("user-token", "bebraw", "kirjolab")).resolves.toEqual([
      { name: "main", protected: true },
      { name: "draft", protected: false },
    ]);
  });

  it("bounds remote JSON before parsing", async () => {
    const client = new GitHubUserClient(
      config,
      async () => new Response("x", { headers: { "content-length": String(2 * 1024 * 1024 + 1) } }),
    );
    await expect(client.getUser("user-token")).rejects.toThrow("exceeds bounds");
  });

  it("normalizes configuration and requires complete OAuth credentials", () => {
    expect(() => new GitHubUserClient({ ...config, apiBase: "api.github.test" })).toThrow("GitHub API base URL is invalid");
    expect(() => new GitHubUserClient({ ...config, oauthBase: "github.test" })).toThrow("GitHub OAuth base URL is invalid");
    for (const changed of [{ clientId: "short" }, { clientSecret: "short" }]) {
      const client = new GitHubUserClient({ ...config, ...changed });
      expect(() => client.authorizationUrl("https://kirjolab.test/callback", "state")).toThrow(
        "GitHub user authorization is not configured",
      );
    }
  });

  it("validates authorization codes and refreshes expiring access tokens", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        access_token: "access-token-at-least-twenty-characters",
        expires_in: 60,
        refresh_token: "next-refresh-token",
        refresh_token_expires_in: 120,
      }),
    );
    const client = new GitHubUserClient(config, fetchMock);
    await expect(client.exchangeCode("", "https://kirjolab.test/callback")).rejects.toMatchObject({
      code: "authorization",
      message: "GitHub authorization code is invalid",
    });
    await expect(client.exchangeCode("x".repeat(513), "https://kirjolab.test/callback")).rejects.toThrow(
      "GitHub authorization code is invalid",
    );
    await expect(client.refreshAccessToken("")).rejects.toThrow("GitHub refresh token is invalid");
    await expect(client.refreshAccessToken("x".repeat(1_025))).rejects.toThrow("GitHub refresh token is invalid");
    await expect(client.refreshAccessToken("refresh-token", 0)).resolves.toEqual({
      accessToken: "access-token-at-least-twenty-characters",
      accessExpiresAt: "1970-01-01T00:01:00.000Z",
      refreshToken: "next-refresh-token",
      refreshExpiresAt: "1970-01-01T00:02:00.000Z",
    });
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("grant_type=refresh_token");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("refresh_token=refresh-token");
  });

  it("fails closed on malformed token responses and optional expiry values", async () => {
    for (const value of [null, {}, { access_token: "short" }, { access_token: 1 }]) {
      const client = new GitHubUserClient(config, async () => Response.json(value));
      await expect(client.exchangeCode("code", "https://kirjolab.test/callback")).rejects.toThrow("GitHub token response is invalid");
    }
    const client = new GitHubUserClient(config, async () =>
      Response.json({
        access_token: "access-token-at-least-twenty-characters",
        expires_in: 0,
        refresh_token: "",
        refresh_token_expires_in: Number.NaN,
      }),
    );
    await expect(client.exchangeCode("code", "https://kirjolab.test/callback")).resolves.toEqual({
      accessToken: "access-token-at-least-twenty-characters",
      accessExpiresAt: null,
      refreshToken: null,
      refreshExpiresAt: null,
    });
  });

  it("validates user identities with numeric and string GitHub ids", async () => {
    for (const [id, expected] of [
      [7, "7"],
      ["12345678901234567890", "12345678901234567890"],
    ] as const) {
      const client = new GitHubUserClient(config, async () => Response.json({ id, login: "bebraw" }));
      await expect(client.getUser("token")).resolves.toEqual({ id: expected, login: "bebraw" });
    }
    for (const value of [
      null,
      { id: 0, login: "bebraw" },
      { id: "not-numeric", login: "bebraw" },
      { id: 7, login: "-invalid" },
      { id: 7, login: "x".repeat(40) },
    ]) {
      const client = new GitHubUserClient(config, async () => Response.json(value));
      await expect(client.getUser("token")).rejects.toThrow("GitHub user response is invalid");
    }
    await expect(new GitHubUserClient(config, async () => Response.json({})).getUser("")).rejects.toThrow(
      "GitHub user access token is unavailable",
    );
  });

  it("rejects every malformed installation, repository, and branch field", async () => {
    const installation = { id: 7, account: { id: 8, login: "bebraw", type: "Organization" } };
    for (const value of [
      null,
      { ...installation, id: 0 },
      { ...installation, account: null },
      { ...installation, account: { ...installation.account, id: 0 } },
      { ...installation, account: { ...installation.account, login: "-bad" } },
      { ...installation, account: { ...installation.account, type: "Bot" } },
    ]) {
      const client = new GitHubUserClient(config, async () => Response.json({ installations: [value] }));
      await expect(client.listInstallations("token")).rejects.toThrow("GitHub installation response is invalid");
    }
    const repository = {
      id: 99,
      owner: { login: "bebraw" },
      name: "kirjolab",
      full_name: "bebraw/kirjolab",
      private: true,
      default_branch: "main",
    };
    for (const value of [
      null,
      { ...repository, id: 0 },
      { ...repository, owner: null },
      { ...repository, owner: { login: "-bad" } },
      { ...repository, name: "bad/name" },
      { ...repository, full_name: 1 },
      { ...repository, private: "true" },
      { ...repository, default_branch: "" },
      { ...repository, default_branch: "x".repeat(256) },
    ]) {
      const client = new GitHubUserClient(config, async () => Response.json({ repositories: [value] }));
      await expect(client.listRepositories("token", 7)).rejects.toThrow("GitHub repository response is invalid");
    }
    await expect(new GitHubUserClient(config, async () => Response.json({})).listRepositories("token", 0)).rejects.toThrow(
      "GitHub installation id is invalid",
    );
    for (const value of [
      null,
      { name: "", protected: false },
      { name: "main", protected: "false" },
      { name: "x".repeat(256), protected: false },
    ]) {
      const client = new GitHubUserClient(config, async () => Response.json([value]));
      await expect(client.listBranches("token", "bebraw", "kirjolab")).rejects.toThrow("GitHub branch response is invalid");
    }
    await expect(new GitHubUserClient(config).listBranches("token", "-bad", "repo")).rejects.toThrow(
      "GitHub repository identity is invalid",
    );
  });

  it("maps provider errors and invalid JSON without leaking unbounded descriptions", async () => {
    for (const [status, code] of [
      [401, "authorization"],
      [403, "forbidden"],
      [404, "not-found"],
      [500, "invalid-response"],
    ] as const) {
      const client = new GitHubUserClient(config, async () => Response.json({ error_description: "x".repeat(600) }, { status }));
      await expect(client.getUser("token")).rejects.toMatchObject({ code, status, message: "x".repeat(500) });
    }
    const invalid = new GitHubUserClient(config, async () => new Response("{"));
    await expect(invalid.getUser("token")).rejects.toThrow("GitHub returned invalid JSON");
  });

  it("paginates installations, repositories, and branches until a short page", async () => {
    const installation = { id: 7, account: { id: 8, login: "bebraw", type: "User" } };
    const repository = {
      id: 99,
      owner: { login: "bebraw" },
      name: "kirjolab",
      full_name: "bebraw/kirjolab",
      private: true,
      default_branch: "main",
    };
    const paths: string[] = [];
    const client = new GitHubUserClient(config, async (input) => {
      const url = new URL(String(input));
      paths.push(`${url.pathname}${url.search}`);
      const page = Number(url.searchParams.get("page"));
      if (url.pathname === "/user/installations") {
        return Response.json({
          installations: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({ ...installation, id: index + 1 })),
        });
      }
      if (url.pathname.includes("/repositories")) {
        return Response.json({
          repositories: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({ ...repository, id: index + 1 })),
        });
      }
      return Response.json(Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({ name: `branch-${index}`, protected: false })));
    });

    await expect(client.listInstallations("token")).resolves.toHaveLength(101);
    await expect(client.listRepositories("token", 7)).resolves.toHaveLength(101);
    await expect(client.listBranches("token", "owner", "repo")).resolves.toHaveLength(101);
    expect(paths).toEqual([
      "/user/installations?per_page=100&page=1",
      "/user/installations?per_page=100&page=2",
      "/user/installations/7/repositories?per_page=100&page=1",
      "/user/installations/7/repositories?per_page=100&page=2",
      "/repos/owner/repo/branches?per_page=100&page=1",
      "/repos/owner/repo/branches?per_page=100&page=2",
    ]);
  });

  it("rejects lists that fill all five supported pages", async () => {
    const installation = { id: 7, account: { id: 8, login: "bebraw", type: "User" } };
    const repository = {
      id: 99,
      owner: { login: "bebraw" },
      name: "kirjolab",
      full_name: "bebraw/kirjolab",
      private: false,
      default_branch: "main",
    };
    for (const [operation, message] of [
      [(client: GitHubUserClient) => client.listInstallations("token"), "GitHub installation list exceeds supported bounds"],
      [(client: GitHubUserClient) => client.listRepositories("token", 7), "GitHub repository list exceeds supported bounds"],
      [(client: GitHubUserClient) => client.listBranches("token", "owner", "repo"), "GitHub branch list exceeds supported bounds"],
    ] as const) {
      const client = new GitHubUserClient(config, async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === "/user/installations") return Response.json({ installations: Array.from({ length: 100 }, () => installation) });
        if (path.includes("/repositories")) return Response.json({ repositories: Array.from({ length: 100 }, () => repository) });
        return Response.json(Array.from({ length: 100 }, (_, index) => ({ name: `branch-${index}`, protected: false })));
      });
      await expect(operation(client)).rejects.toMatchObject({ code: "bounds", message });
    }
  });

  it("sends exact API headers and percent-encodes repository identities", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json([]));
    const client = new GitHubUserClient(
      { ...config, clientId: ` ${config.clientId} `, apiBase: `${config.apiBase}///`, oauthBase: `${config.oauthBase}///` },
      fetchMock,
    );

    await client.listBranches("token", "owner", "repo.name");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.github.test/repos/owner/repo.name/branches?per_page=100&page=1");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: {
        accept: "application/vnd.github+json",
        authorization: "Bearer token",
        "user-agent": "Kirjolab-GitHub-User",
        "x-github-api-version": "2022-11-28",
      },
    });
    expect(new URL(client.authorizationUrl("https://example.test/callback", "state")).searchParams.get("client_id")).toBe(config.clientId);
  });

  it("rejects streamed responses above bounds and handles empty response bodies", async () => {
    const oversized = new GitHubUserClient(
      config,
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(2 * 1024 * 1024));
              controller.enqueue(new Uint8Array([1]));
              controller.close();
            },
          }),
        ),
    );
    await expect(oversized.getUser("token")).rejects.toMatchObject({ code: "bounds", message: "GitHub response exceeds bounds" });

    const empty = new GitHubUserClient(config, async () => new Response(null, { status: 200 }));
    await expect(empty.getUser("token")).rejects.toThrow("GitHub user response is invalid");
  });

  it("accepts exact identity bounds and exposes stable typed errors", async () => {
    const login = `a${"b".repeat(38)}`;
    const repository = "r".repeat(100);
    const client = new GitHubUserClient(config, async () => Response.json([]));
    await expect(client.listBranches("token", login, repository)).resolves.toEqual([]);
    await expect(client.listBranches("token", `${login}x`, repository)).rejects.toThrow("GitHub repository identity is invalid");
    await expect(client.listBranches("token", login, `${repository}x`)).rejects.toThrow("GitHub repository identity is invalid");

    const error = new GitHubUserError("not-found", "Missing", 404);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: "GitHubUserError", code: "not-found", message: "Missing", status: 404 });
    expect(new GitHubUserError("bounds", "Bounded")).toMatchObject({ status: null });
  });
});
