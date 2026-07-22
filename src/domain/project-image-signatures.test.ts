import { describe, expect, it } from "vitest";
import { hasProjectImageSignature } from "./project-image-signatures";

describe("project image signatures", () => {
  it("recognizes every supported project image format", () => {
    const ascii = (value: string): Uint8Array => new TextEncoder().encode(value);
    const png = [137, 80, 78, 71, 13, 10, 26, 10];
    expect(hasProjectImageSignature("image/png", new Uint8Array(png))).toBe(true);
    expect(hasProjectImageSignature("image/png", new Uint8Array(png.slice(0, 7)))).toBe(false);
    for (const index of png.keys()) {
      const invalidPng = [...png];
      invalidPng[index] = 0;
      expect(hasProjectImageSignature("image/png", new Uint8Array(invalidPng))).toBe(false);
    }
    expect(hasProjectImageSignature("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]))).toBe(true);
    expect(hasProjectImageSignature("image/jpeg", new Uint8Array([0x00, 0xd8, 0xff]))).toBe(false);
    expect(hasProjectImageSignature("image/jpeg", new Uint8Array([0xff, 0x00, 0xff]))).toBe(false);
    expect(hasProjectImageSignature("image/jpeg", new Uint8Array([0xff, 0xd8, 0x00]))).toBe(false);
    expect(hasProjectImageSignature("image/gif", ascii("GIF87a"))).toBe(true);
    expect(hasProjectImageSignature("image/gif", ascii("GIF89a"))).toBe(true);
    expect(hasProjectImageSignature("image/gif", ascii("GIF90a"))).toBe(false);
    expect(hasProjectImageSignature("image/webp", ascii("RIFFsizeWEBP"))).toBe(true);
    expect(hasProjectImageSignature("image/webp", ascii("NOPEsizeWEBP"))).toBe(false);
    expect(hasProjectImageSignature("image/webp", ascii("RIFFsizeNOPE"))).toBe(false);
    expect(hasProjectImageSignature("image/avif", ascii("sizeftypavif"))).toBe(true);
    expect(hasProjectImageSignature("image/avif", ascii("sizeftypavis"))).toBe(true);
    expect(hasProjectImageSignature("image/avif", ascii("sizeNOPEavif"))).toBe(false);
    expect(hasProjectImageSignature("image/avif", ascii("sizeftypheic"))).toBe(false);
    expect(hasProjectImageSignature("image/svg+xml", ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(true);
    expect(hasProjectImageSignature("image/svg+xml", ascii("not svg"))).toBe(false);
  });
});
