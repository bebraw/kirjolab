import { describe, expect, it } from "vitest";
import { isSha256Hex, sha256Text } from "./sha256";

describe("SHA-256 text primitives", () => {
  it("hashes UTF-8 text into lowercase hexadecimal", async () => {
    await expect(sha256Text("abc")).resolves.toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    await expect(sha256Text("å")).resolves.toBe("e83979df9d36090142f23051f8e8d7ad48e5c20dff5c9e7b92ca3454f67469f9");
  });

  it("recognizes only exact lowercase SHA-256 hexadecimal", () => {
    const digest = "a".repeat(64);
    expect(isSha256Hex(digest)).toBe(true);
    for (const value of [null, 42, "", "a".repeat(63), "a".repeat(65), `x${digest}`, `${digest}x`, digest.toUpperCase()]) {
      expect(isSha256Hex(value)).toBe(false);
    }
  });
});
