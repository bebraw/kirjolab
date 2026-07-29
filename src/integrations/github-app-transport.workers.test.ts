import { createPrivateKey } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GitHubAppTransport } from "./github-app-transport";

let pkcs1PrivateKey = "";

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer;
  pkcs1PrivateKey = createPrivateKey({ key: Buffer.from(pkcs8), format: "der", type: "pkcs8" })
    .export({ type: "pkcs1", format: "pem" })
    .toString();
});

describe("GitHub App transport in the Workers runtime", () => {
  it("normalizes an escaped PKCS#1 App key before Octokit signs with Web Crypto", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/u);
      return Response.json({ token: "t".repeat(20) });
    });
    const transport = new GitHubAppTransport(
      {
        appId: "12345",
        privateKey: pkcs1PrivateKey.replaceAll("\n", "\\n"),
        apiBase: "https://github.test",
      },
      fetcher,
    );

    await expect(transport.forInstallation(7, 99)).resolves.toEqual(expect.any(Function));
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
