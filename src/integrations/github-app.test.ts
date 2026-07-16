import { beforeAll, describe, expect, it, vi } from "vitest";
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
