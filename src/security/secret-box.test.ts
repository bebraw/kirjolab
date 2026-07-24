import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secret-box";

const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("encrypted secret storage", () => {
  it("round-trips a secret only in its owner context", async () => {
    const encrypted = await encryptSecret("github-token", key, "github:owner-one");

    expect(encrypted).not.toContain("github-token");
    await expect(decryptSecret(encrypted, key, "github:owner-one")).resolves.toBe("github-token");
    await expect(decryptSecret(encrypted, ` ${key}= `, "github:owner-one")).resolves.toBe("github-token");
    await expect(decryptSecret(encrypted, key, "github:owner-two")).rejects.toThrow("could not be opened");
  });

  it("rejects malformed keys and ciphertext", async () => {
    await expect(encryptSecret("", key, "github:owner")).rejects.toThrow("required");
    await expect(encryptSecret("token", "AAAA", "github:owner")).rejects.toThrow("32 bytes");
    await expect(decryptSecret("invalid", key, "github:owner")).rejects.toThrow("invalid");

    const encrypted = await encryptSecret("token", key, "github:owner");
    const [version, iv, ciphertext] = encrypted.split(".");
    for (const candidate of [
      `v2.${iv}.${ciphertext}`,
      `${version}..${ciphertext}`,
      `${version}.${iv}.`,
      `${encrypted}.extra`,
      `${version}.${iv?.slice(1)}.${ciphertext}`,
      `${version}.$${iv}.${ciphertext}`,
      `${version}.${iv}$.${ciphertext}`,
      `${version}.${iv}.$${ciphertext}`,
      `${version}.${iv}.${ciphertext}$`,
    ]) {
      await expect(decryptSecret(candidate, key, "github:owner"), candidate).rejects.toThrow();
    }
  });
});
