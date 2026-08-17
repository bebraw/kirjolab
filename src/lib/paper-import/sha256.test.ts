import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

describe("paper-import SHA-256", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"],
  ])("matches the standard SHA-256 vector for %j", (value, expected) => {
    expect(sha256Hex(new TextEncoder().encode(value))).toBe(expected);
  });
});
