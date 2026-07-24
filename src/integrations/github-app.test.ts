import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPrivateKey } from "node:crypto";
import { createGitHubAppJwt, GitHubAppClient, GitHubClientError, normalizeGitHubRoot, type GitHubRepositorySelection } from "./github-app";

const commitA = "a".repeat(40);
const commitB = "b".repeat(40);
const commitC = "c".repeat(40);
const commitD = "d".repeat(40);
const commitE = "e".repeat(40);
const selection: GitHubRepositorySelection = {
  installationId: 7,
  repositoryId: 99,
  owner: "bebraw",
  repository: "scalability_book",
  branch: "main",
  rootPath: "book",
};

let privateKey = "";
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  publicKey = pair.publicKey;
  privateKey = pem("PRIVATE KEY", new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer));
});

describe("GitHub App integration", () => {
  it("creates a short-lived RS256 app JWT", async () => {
    const now = Date.UTC(2026, 6, 16, 12);
    const token = await createGitHubAppJwt("12345", privateKey, now);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const [header = "", payload = "", signature = ""] = parts;
    expect(decodeJson(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodeJson(payload)).toEqual({ iat: now / 1_000 - 60, exp: now / 1_000 + 540, iss: "12345" });
    await expect(
      crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(signature), new TextEncoder().encode(`${header}.${payload}`)),
    ).resolves.toBe(true);
  });

  it("imports the supported PKCS#1 RSA private-key form", async () => {
    const pkcs1 = createPrivateKey(privateKey).export({ type: "pkcs1", format: "pem" }).toString();
    const token = await createGitHubAppJwt("12345", pkcs1, Date.UTC(2026, 6, 16, 12));
    const [header = "", payload = "", signature = ""] = token.split(".");

    expect(decodeJson(header)).toEqual({ alg: "RS256", typ: "JWT" });
    await expect(
      crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(signature), new TextEncoder().encode(`${header}.${payload}`)),
    ).resolves.toBe(true);
  });

  it("reads only bounded Markdown blobs below the selected root", async () => {
    const markdown = "# Main\n";
    const lfsPointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${"f".repeat(64)}\nsize 10000000\n`;
    const fetcher = vi.fn(async function (this: unknown, input: RequestInfo | URL, _init?: RequestInit) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      const url = new URL(String(input));
      if (url.pathname === "/app/installations/7/access_tokens") return Response.json({ token: "t".repeat(20) });
      if (url.pathname === "/repos/bebraw/scalability_book") return Response.json({ id: 99 });
      if (url.pathname.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: commitA } });
      if (url.pathname.endsWith(`/git/commits/${commitA}`)) return Response.json({ tree: { sha: commitB }, message: "Current head" });
      if (url.pathname.endsWith(`/git/trees/${commitB}`)) {
        return Response.json({
          truncated: false,
          tree: [
            { path: "book/main.md", type: "blob", mode: "100644", sha: commitC, size: markdown.length },
            { path: "book/large.md", type: "blob", mode: "100644", sha: commitE, size: lfsPointer.length },
            { path: "book/demo.js", type: "blob", mode: "100644", sha: commitD, size: 2 },
            { path: "site.md", type: "blob", mode: "100644", sha: commitE, size: 2 },
          ],
        });
      }
      if (url.pathname.endsWith(`/git/blobs/${commitC}`)) {
        return Response.json({ encoding: "base64", content: btoa(markdown), size: markdown.length });
      }
      if (url.pathname.endsWith(`/git/blobs/${commitE}`)) {
        return Response.json({ encoding: "base64", content: btoa(lfsPointer), size: lfsPointer.length });
      }
      return new Response(null, { status: 500 });
    });
    vi.stubGlobal("fetch", fetcher);

    try {
      const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" });
      await expect(client.readMarkdownSnapshot(selection)).resolves.toEqual({
        repositoryId: 99,
        owner: "bebraw",
        repository: "scalability_book",
        branch: "main",
        rootPath: "book",
        commitSha: commitA,
        commitMessage: "Current head",
        files: [{ path: "main.md", blobSha: commitC, content: markdown }],
        skipped: [
          { path: "demo.js", reason: "unsupported-type" },
          { path: "large.md", reason: "git-lfs" },
        ],
      });
      expect(fetcher).toHaveBeenCalledTimes(7);
      expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: expect.stringMatching(/^Bearer /u) });
      expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
      expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ repository_ids: [99] }));
      expect(fetcher.mock.calls[6]?.[1]?.headers).toMatchObject({ authorization: `Bearer ${"t".repeat(20)}` });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("creates blobs and advances the branch without forcing", async () => {
    let patchBody: unknown;
    let treeBody: unknown;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/app/installations/7/access_tokens") return Response.json({ token: "t".repeat(20) });
      if (url.pathname.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: commitA } });
      if (url.pathname.endsWith(`/git/commits/${commitA}`)) return Response.json({ tree: { sha: commitB } });
      if (url.pathname.endsWith("/git/blobs")) return Response.json({ sha: commitC });
      if (url.pathname.endsWith("/git/trees")) {
        treeBody = JSON.parse(String(init?.body)) as unknown;
        return Response.json({ sha: commitD });
      }
      if (url.pathname.endsWith("/git/commits")) return Response.json({ sha: commitE });
      if (url.pathname.endsWith("/git/refs/heads/main")) {
        patchBody = JSON.parse(String(init?.body)) as unknown;
        return Response.json({});
      }
      return new Response(null, { status: 500 });
    });
    const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);

    await expect(
      client.createCommit(selection, commitA, "Publish from Kirjolab", [{ path: "main.md", content: "# Updated\n" }]),
    ).resolves.toBe(commitE);
    expect(treeBody).toEqual({
      base_tree: commitB,
      tree: [{ path: "book/main.md", mode: "100644", type: "blob", sha: commitC }],
    });
    expect(patchBody).toEqual({ sha: commitE, force: false });
  });

  it("rejects a stale branch before creating objects", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname === "/app/installations/7/access_tokens") return Response.json({ token: "t".repeat(20) });
      if (pathname.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: commitB } });
      return new Response(null, { status: 500 });
    });
    const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);
    const error = await client
      .createCommit(selection, commitA, "Publish", [{ path: "main.md", content: "changed" }])
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(GitHubClientError);
    expect((error as GitHubClientError).code).toBe("remote-changed");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("normalizes a repository root without permitting traversal", () => {
    expect(normalizeGitHubRoot(" /book/chapters/ ")).toBe("book/chapters");
    expect(normalizeGitHubRoot("/")).toBe("");
    expect(normalizeGitHubRoot("book/../site")).toBeNull();
    expect(normalizeGitHubRoot("book\\site")).toBeNull();
  });

  it("rejects invalid configuration, JWT credentials, and repository selections before network access", async () => {
    for (const config of [
      { appId: "", privateKey },
      { appId: "123", privateKey: "" },
    ]) {
      expect(() => new GitHubAppClient(config)).toThrow("GitHub App credentials are not configured");
    }
    expect(() => new GitHubAppClient({ appId: "123", privateKey, apiBase: "github.test" })).toThrow("GitHub API base URL is invalid");
    expect(() => new GitHubAppClient({ appId: "123", privateKey, apiBase: "prefix-http://github.test" })).toThrow(
      "GitHub API base URL is invalid",
    );
    await expect(createGitHubAppJwt("not-numeric", privateKey)).rejects.toMatchObject({
      name: "GitHubClientError",
      code: "configuration",
      message: "GitHub App credentials are not configured",
    });
    await expect(createGitHubAppJwt("123", "not a key")).rejects.toMatchObject({
      code: "configuration",
      message: "GitHub App private key is invalid",
    });

    const fetcher = vi.fn(async () => new Response(null, { status: 500 }));
    const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test/" }, fetcher);
    for (const changed of [
      { installationId: 0 },
      { repositoryId: 0 },
      { owner: "" },
      { owner: "bad/owner" },
      { repository: "" },
      { branch: "" },
      { branch: "x".repeat(256) },
      { rootPath: "../outside" },
    ]) {
      await expect(client.readMarkdownSnapshot({ ...selection, ...changed })).rejects.toMatchObject({
        code: "bounds",
        message: "GitHub repository selection is invalid",
      });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("validates every commit input and path boundary before authentication", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 500 }));
    const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);
    for (const [head, message, changes, expected] of [
      ["short", "Publish", [{ path: "main.md", content: "text" }], "GitHub commit input is invalid"],
      [commitA, " ", [{ path: "main.md", content: "text" }], "GitHub commit input is invalid"],
      [commitA, "x".repeat(1_001), [{ path: "main.md", content: "text" }], "GitHub commit input is invalid"],
      [commitA, "Publish", [], "GitHub commit input is invalid"],
      [commitA, "Publish", [{ path: "/main.md", content: "text" }], "GitHub commit paths are invalid or duplicated"],
      [commitA, "Publish", [{ path: "main.txt", content: "text" }], "GitHub commit paths are invalid or duplicated"],
      [
        commitA,
        "Publish",
        [
          { path: "a.md", content: "a" },
          { path: "a.md", content: "b" },
        ],
        "GitHub commit paths are invalid or duplicated",
      ],
      [commitA, "Publish", [{ path: "a/../b.md", content: "text" }], "GitHub commit paths are invalid or duplicated"],
      [
        commitA,
        "Publish",
        [{ path: "main.md", content: "x".repeat(2 * 1024 * 1024 + 1) }],
        "A GitHub commit file exceeds the Markdown bounds",
      ],
    ] as const) {
      await expect(client.createCommit(selection, head, message, changes)).rejects.toMatchObject({ code: "bounds", message: expected });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed on malformed repository, branch, commit, and tree responses", async () => {
    const cases: Array<readonly [string, () => Response, string, string]> = [
      [
        "/app/installations/7/access_tokens",
        () => Response.json({ token: "short" }),
        "authentication",
        "GitHub installation token response is invalid",
      ],
      ["/repos/bebraw/scalability_book", () => Response.json({ id: 0 }), "invalid-response", "GitHub repository metadata is invalid"],
      [
        "/repos/bebraw/scalability_book",
        () => Response.json({ id: 100 }),
        "forbidden",
        "GitHub repository is outside the authorized user selection",
      ],
      [
        "/repos/bebraw/scalability_book/git/ref/heads/main",
        () => Response.json({ object: { sha: "bad" } }),
        "invalid-response",
        "GitHub branch response is invalid",
      ],
      [
        `/repos/bebraw/scalability_book/git/commits/${commitA}`,
        () => Response.json({ tree: { sha: "bad" }, message: "Head" }),
        "invalid-response",
        "GitHub commit response is invalid",
      ],
      [
        `/repos/bebraw/scalability_book/git/commits/${commitA}`,
        () => Response.json({ tree: { sha: commitB }, message: 1 }),
        "invalid-response",
        "GitHub commit response is invalid",
      ],
      [
        `/repos/bebraw/scalability_book/git/trees/${commitB}`,
        () => Response.json({ truncated: true, tree: [] }),
        "bounds",
        "GitHub returned a truncated or invalid repository tree",
      ],
      [
        `/repos/bebraw/scalability_book/git/trees/${commitB}`,
        () => Response.json({ truncated: false, tree: [] }),
        "bounds",
        "The selected GitHub folder contains no supported Markdown files",
      ],
    ];
    for (const [path, response, code, message] of cases) {
      const fetcher = snapshotFetcher({ [path]: response });
      const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);
      await expect(client.readMarkdownSnapshot(selection)).rejects.toMatchObject({ code, message });
    }
  });

  it("validates blob metadata, base64, declared size, UTF-8, and LFS-only repositories", async () => {
    const blobPath = `/repos/bebraw/scalability_book/git/blobs/${commitC}`;
    const cases: Array<readonly [() => Response, number, string, string]> = [
      [() => Response.json({ encoding: "utf-8", content: "text", size: 7 }), 7, "invalid-response", "GitHub blob response is invalid"],
      [
        () => Response.json({ encoding: "base64", content: "***", size: 7 }),
        7,
        "invalid-response",
        "GitHub blob content is not valid base64",
      ],
      [
        () => Response.json({ encoding: "base64", content: btoa("text"), size: 7 }),
        7,
        "bounds",
        "GitHub blob content exceeds its declared bounds",
      ],
      [
        () => Response.json({ encoding: "base64", content: btoa(String.fromCodePoint(0xff)), size: 1 }),
        1,
        "bounds",
        "GitHub Markdown files must be valid UTF-8",
      ],
      [
        () => {
          const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${"f".repeat(64)}\nsize 1\n`;
          return Response.json({ encoding: "base64", content: btoa(pointer), size: pointer.length });
        },
        126,
        "bounds",
        "The selected GitHub folder contains no supported Markdown files",
      ],
    ];
    for (const [response, size, code, message] of cases) {
      const fetcher = snapshotFetcher({
        [`/repos/bebraw/scalability_book/git/trees/${commitB}`]: () =>
          Response.json({
            truncated: false,
            tree: [{ path: "book/main.md", type: "blob", mode: "100644", sha: commitC, size }],
          }),
        [blobPath]: response,
      });
      const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);
      await expect(client.readMarkdownSnapshot(selection)).rejects.toMatchObject({ code, message });
    }
  });

  it("maps bounded GitHub failures and rejects invalid successful JSON", async () => {
    for (const [status, code] of [
      [401, "authentication"],
      [403, "forbidden"],
      [404, "not-found"],
      [500, "invalid-response"],
    ] as const) {
      const fetcher = snapshotFetcher({
        "/app/installations/7/access_tokens": () => Response.json({ message: "Provider message" }, { status }),
      });
      const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);
      await expect(client.readMarkdownSnapshot(selection)).rejects.toMatchObject({ code, status, message: "Provider message" });
    }
    const invalidJson = snapshotFetcher({
      "/app/installations/7/access_tokens": () => new Response("{", { status: 200 }),
    });
    await expect(
      new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, invalidJson).readMarkdownSnapshot(selection),
    ).rejects.toMatchObject({ code: "invalid-response", message: "GitHub returned invalid JSON" });
  });

  it("maps rejected branch updates to remote-change and protection errors", async () => {
    for (const [status, changed, code, message] of [
      [422, true, "remote-changed", "The GitHub branch changed during publish"],
      [422, false, "branch-protected", "GitHub rejected the direct branch update"],
      [403, false, "branch-protected", "GitHub rejected the direct branch update"],
    ] as const) {
      let refReads = 0;
      const fetcher = commitFetcher(status, () => (refReads++ === 0 || !changed ? commitA : commitB));
      const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);
      await expect(client.createCommit(selection, commitA, " Publish ", [{ path: "main.md", content: null }])).rejects.toMatchObject({
        code,
        status,
        message,
      });
    }
  });

  it("filters malformed tree entries and sorts supported files and skip diagnostics", async () => {
    const files = {
      "a.md": "A",
      "z.md": "Z",
    };
    const fetcher = snapshotFetcher({
      [`/repos/bebraw/scalability_book/git/trees/${commitB}`]: () =>
        Response.json({
          truncated: false,
          tree: [
            null,
            { path: 1, type: "blob" },
            { path: "book", type: "tree", mode: "040000", sha: commitD, size: 0 },
            { path: "book/z.md", type: "blob", mode: "100644", sha: commitD, size: files["z.md"].length },
            { path: "book/a.md", type: "blob", mode: "100644", sha: commitC, size: files["a.md"].length },
            { path: "book/c.txt", type: "blob", mode: "100644", sha: commitE, size: 1 },
            { path: "book/b.MD", type: "tree", mode: "040000", sha: commitE, size: 0 },
            { path: "book/no-sha.md", type: "blob", mode: "100644", size: 1 },
            { path: "book/no-size.md", type: "blob", mode: "100644", sha: commitE },
            { path: "book/../unsafe.md", type: "blob", mode: "100644", sha: commitE, size: 1 },
          ],
        }),
      [`/repos/bebraw/scalability_book/git/blobs/${commitC}`]: () =>
        Response.json({ encoding: "base64", content: btoa(files["a.md"]), size: files["a.md"].length }),
      [`/repos/bebraw/scalability_book/git/blobs/${commitD}`]: () =>
        Response.json({ encoding: "base64", content: btoa(files["z.md"]), size: files["z.md"].length }),
    });
    const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);

    const result = await client.readMarkdownSnapshot(selection);

    expect(result.files).toEqual([
      { path: "a.md", blobSha: commitC, content: "A" },
      { path: "z.md", blobSha: commitD, content: "Z" },
    ]);
    expect(result.skipped).toEqual([
      { path: "b.MD", reason: "unsupported-mode" },
      { path: "c.txt", reason: "unsupported-type" },
      { path: "no-sha.md", reason: "unsupported-mode" },
      { path: "no-size.md", reason: "unsupported-mode" },
    ]);
  });

  it("enforces exact tree file-count and aggregate-byte bounds before loading blobs", async () => {
    for (const tree of [
      Array.from({ length: 513 }, (_, index) => ({
        path: `book/${index}.md`,
        type: "blob",
        mode: "100644",
        sha: commitC,
        size: 0,
      })),
      [
        { path: "book/a.md", type: "blob", mode: "100644", sha: commitC, size: 2 * 1024 * 1024 },
        { path: "book/b.md", type: "blob", mode: "100644", sha: commitD, size: 1 },
      ],
    ]) {
      const fetcher = snapshotFetcher({
        [`/repos/bebraw/scalability_book/git/trees/${commitB}`]: () => Response.json({ truncated: false, tree }),
      });
      const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);

      await expect(client.readMarkdownSnapshot(selection)).rejects.toMatchObject({
        code: "bounds",
        message: "The selected GitHub folder exceeds the Markdown import bounds",
      });
      expect(fetcher.mock.calls.some(([input]) => new URL(String(input)).pathname.includes("/git/blobs/"))).toBe(false);
    }
  });

  it("supports an installation-wide token, root repository import, and normalized selection text", async () => {
    const markdown = "Root";
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === "/app/installations/7/access_tokens") {
        expect(init?.body).toBeUndefined();
        return Response.json({ token: "t".repeat(20) });
      }
      if (path === "/repos/bebraw/scalability_book") return Response.json({ id: 101 });
      if (path.endsWith("/git/ref/heads/topic/branch")) return Response.json({ object: { sha: commitA } });
      if (path.endsWith(`/git/commits/${commitA}`)) return Response.json({ tree: { sha: commitB }, message: "" });
      if (path.endsWith(`/git/trees/${commitB}`)) {
        return Response.json({
          truncated: false,
          tree: [{ path: "main.md", type: "blob", mode: "100644", sha: commitC, size: markdown.length }],
        });
      }
      if (path.endsWith(`/git/blobs/${commitC}`)) {
        return Response.json({ encoding: "base64", content: btoa(markdown), size: markdown.length });
      }
      return new Response(null, { status: 500 });
    });
    const client = new GitHubAppClient({ appId: " 12345 ", privateKey, apiBase: "https://github.test///" }, fetcher);

    await expect(
      client.readMarkdownSnapshot({
        installationId: 7,
        owner: " bebraw ",
        repository: " scalability_book ",
        branch: " topic/branch ",
        rootPath: " / ",
      }),
    ).resolves.toMatchObject({
      repositoryId: 101,
      owner: "bebraw",
      repository: "scalability_book",
      branch: "topic/branch",
      rootPath: "",
      commitMessage: "",
      files: [{ path: "main.md", blobSha: commitC, content: "Root" }],
    });
  });

  it("creates mixed update and deletion entries with a trimmed commit message", async () => {
    const requests: Array<{ path: string; method: string; body: unknown }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      requests.push({ path, method: init?.method ?? "GET", body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null });
      if (path === "/app/installations/7/access_tokens") return Response.json({ token: "t".repeat(20) });
      if (path.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: commitA } });
      if (path.endsWith(`/git/commits/${commitA}`)) return Response.json({ tree: { sha: commitB } });
      if (path.endsWith("/git/blobs")) return Response.json({ sha: commitC });
      if (path.endsWith("/git/trees")) return Response.json({ sha: commitD });
      if (path.endsWith("/git/commits")) return Response.json({ sha: commitE });
      if (path.endsWith("/git/refs/heads/main")) return Response.json({});
      return new Response(null, { status: 500 });
    });
    const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);

    await expect(
      client.createCommit(selection, commitA, "  Publish both  ", [
        { path: "new.md", content: "new" },
        { path: "old.md", content: null },
      ]),
    ).resolves.toBe(commitE);

    expect(requests.find(({ path }) => path.endsWith("/git/trees"))?.body).toEqual({
      base_tree: commitB,
      tree: [
        { path: "book/new.md", mode: "100644", type: "blob", sha: commitC },
        { path: "book/old.md", mode: "100644", type: "blob", sha: null },
      ],
    });
    expect(requests.find(({ path }) => path.endsWith("/git/commits") && !path.endsWith(`/${commitA}`))?.body).toEqual({
      message: "Publish both",
      tree: commitD,
      parents: [commitA],
    });
  });

  it("exposes stable typed client errors", () => {
    const error = new GitHubClientError("not-found", "Missing", 404);
    expect(error).toBeInstanceOf(Error);
    expect(error).toEqual(expect.objectContaining({ name: "GitHubClientError", code: "not-found", status: 404, message: "Missing" }));
    expect(new GitHubClientError("bounds", "Bounded")).toMatchObject({ status: null });
  });

  it("accepts exact JWT and commit boundaries while rejecting adjacent values", async () => {
    const now = Date.UTC(2026, 6, 16, 12);
    await expect(createGitHubAppJwt(` ${"1".repeat(20)} `, privateKey, now)).resolves.toEqual(
      expect.stringMatching(/^[^.]+\.[^.]+\.[^.]+$/u),
    );
    await expect(createGitHubAppJwt("1".repeat(21), privateKey, now)).rejects.toMatchObject({
      code: "configuration",
      message: "GitHub App credentials are not configured",
    });

    const fetcher = commitFetcher(200, () => commitA);
    const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);
    await expect(
      client.createCommit(selection, commitA, "m".repeat(1_000), [{ path: "main.md", content: "x".repeat(2 * 1024 * 1024) }]),
    ).resolves.toBe(commitE);
    for (const head of ["a".repeat(39), "a".repeat(65), `${commitA}x`, `x${commitA}`]) {
      await expect(client.createCommit(selection, head, "Publish", [{ path: "main.md", content: "text" }])).rejects.toMatchObject({
        code: "bounds",
        message: "GitHub commit input is invalid",
      });
    }
  });

  it("validates exact commit-message and GitHub error-detail lengths", async () => {
    for (const [length, succeeds] of [
      [10_000, true],
      [10_001, false],
    ] as const) {
      const fetcher = snapshotFetcher({
        [`/repos/bebraw/scalability_book/git/commits/${commitA}`]: () =>
          Response.json({ tree: { sha: commitB }, message: "m".repeat(length) }),
      });
      const promise = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher).readMarkdownSnapshot(
        selection,
      );
      if (succeeds) await expect(promise).resolves.toMatchObject({ commitMessage: "m".repeat(length) });
      else await expect(promise).rejects.toMatchObject({ code: "invalid-response", message: "GitHub commit response is invalid" });
    }

    for (const [length, expected] of [
      [500, "x".repeat(500)],
      [501, "GitHub request failed"],
    ] as const) {
      const fetcher = snapshotFetcher({
        "/app/installations/7/access_tokens": () => Response.json({ message: "x".repeat(length) }, { status: 500 }),
      });
      await expect(
        new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher).readMarkdownSnapshot(selection),
      ).rejects.toMatchObject({ code: "invalid-response", status: 500, message: expected });
    }
  });

  it("recognizes only a complete Git LFS pointer and preserves anchored lookalikes", async () => {
    const pointer = `version https://git-lfs.github.com/spec/v1\r\noid sha256:${"f".repeat(64)}\r\nsize 1\r\n`;
    const contents = {
      "exact.md": pointer,
      "prefix.md": `prefix\n${pointer}`,
      "suffix.md": `${pointer}suffix`,
    };
    const shas = { "exact.md": commitC, "prefix.md": commitD, "suffix.md": commitE };
    const fetcher = snapshotFetcher({
      [`/repos/bebraw/scalability_book/git/trees/${commitB}`]: () =>
        Response.json({
          truncated: false,
          tree: Object.entries(contents).map(([path, content]) => ({
            path: `book/${path}`,
            type: "blob",
            mode: "100644",
            sha: shas[path as keyof typeof shas],
            size: content.length,
          })),
        }),
      ...Object.fromEntries(
        Object.entries(contents).map(([path, content]) => [
          `/repos/bebraw/scalability_book/git/blobs/${shas[path as keyof typeof shas]}`,
          () => Response.json({ encoding: "base64", content: btoa(content), size: content.length }),
        ]),
      ),
    });
    const snapshot = await new GitHubAppClient(
      { appId: "12345", privateKey, apiBase: "https://github.test" },
      fetcher,
    ).readMarkdownSnapshot(selection);

    expect(snapshot.files.map(({ path }) => path)).toEqual(["prefix.md", "suffix.md"]);
    expect(snapshot.skipped).toEqual([{ path: "exact.md", reason: "git-lfs" }]);
  });

  it("rejects every unsafe normalized root segment and overlong repository part", async () => {
    for (const root of ["a//b", "a/./b", "a/../b", "a\\b", `a\0b`]) expect(normalizeGitHubRoot(root)).toBeNull();

    const fetcher = vi.fn(async () => new Response(null, { status: 500 }));
    const client = new GitHubAppClient({ appId: "12345", privateKey, apiBase: "https://github.test" }, fetcher);
    await expect(client.readMarkdownSnapshot({ ...selection, owner: "x".repeat(101) })).rejects.toMatchObject({
      code: "bounds",
      message: "GitHub repository selection is invalid",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function pem(label: string, value: Uint8Array): string {
  const base64 = encodeBase64(value);
  return `-----BEGIN ${label}-----\n${base64.match(/.{1,64}/gu)?.join("\n") ?? base64}\n-----END ${label}-----`;
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCodePoint(byte);
  return btoa(binary);
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.codePointAt(0) ?? 0);
}

function decodeJson(value: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as unknown;
}

function snapshotFetcher(overrides: Readonly<Record<string, () => Response>> = {}) {
  const markdown = "# Main\n";
  const defaults: Record<string, () => Response> = {
    "/app/installations/7/access_tokens": () => Response.json({ token: "t".repeat(20) }),
    "/repos/bebraw/scalability_book": () => Response.json({ id: 99 }),
    "/repos/bebraw/scalability_book/git/ref/heads/main": () => Response.json({ object: { sha: commitA } }),
    [`/repos/bebraw/scalability_book/git/commits/${commitA}`]: () => Response.json({ tree: { sha: commitB }, message: "Head" }),
    [`/repos/bebraw/scalability_book/git/trees/${commitB}`]: () =>
      Response.json({
        truncated: false,
        tree: [{ path: "book/main.md", type: "blob", mode: "100644", sha: commitC, size: markdown.length }],
      }),
    [`/repos/bebraw/scalability_book/git/blobs/${commitC}`]: () =>
      Response.json({ encoding: "base64", content: btoa(markdown), size: markdown.length }),
  };
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    return (overrides[path] ?? defaults[path] ?? (() => new Response(null, { status: 500 })))();
  });
}

function commitFetcher(patchStatus: number, nextHead: () => string) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    if (path === "/app/installations/7/access_tokens") return Response.json({ token: "t".repeat(20) });
    if (path.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: nextHead() } });
    if (path.endsWith(`/git/commits/${commitA}`)) return Response.json({ tree: { sha: commitB } });
    if (path.endsWith("/git/blobs")) return Response.json({ sha: commitC });
    if (path.endsWith("/git/trees")) return Response.json({ sha: commitD });
    if (path.endsWith("/git/commits")) return Response.json({ sha: commitE });
    if (path.endsWith("/git/refs/heads/main")) return Response.json({ message: "Rejected" }, { status: patchStatus });
    return new Response(null, { status: 500 });
  });
}
