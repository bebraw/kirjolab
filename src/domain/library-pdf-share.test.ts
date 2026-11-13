import { describe, expect, it } from "vitest";
import { isLibraryPdfShare } from "./library-pdf-share";

describe("annotated PDF share contracts", () => {
  const share = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "paper-annotated.pdf",
    createdAt: "2026-11-13T12:00:00.000Z",
    href: `/share/pdf/${"a".repeat(43)}`,
  };

  it("accepts an owner-facing snapshot link", () => {
    expect(isLibraryPdfShare(share)).toBe(true);
  });

  it("accepts boundary-length filenames and the full URL-safe token alphabet", () => {
    expect(
      isLibraryPdfShare({
        ...share,
        id: "ABCDEF12-3456-4ABC-8DEF-123456789ABC",
        name: "x".repeat(200),
        href: `/share/pdf/${"AZaz09_-".repeat(5)}Bz9`,
      }),
    ).toBe(true);
    expect(isLibraryPdfShare({ ...share, name: "x" })).toBe(true);
  });

  it.each([null, [], {}, false, "share"])("rejects a value that is not a complete record: %j", (value) => {
    expect(isLibraryPdfShare(value)).toBe(false);
  });

  it.each(["id", "name", "createdAt", "href"] as const)("requires the %s field", (field) => {
    const incomplete: Record<string, unknown> = { ...share };
    delete incomplete[field];
    expect(isLibraryPdfShare(incomplete)).toBe(false);
  });

  it.each([
    { field: "id", value: null },
    { field: "id", value: [share.id] },
    { field: "name", value: null },
    { field: "name", value: [share.name] },
    { field: "createdAt", value: 2026 },
    { field: "createdAt", value: [share.createdAt] },
    { field: "href", value: null },
    { field: "href", value: [share.href] },
  ])("rejects a non-string $field", ({ field, value }) => {
    expect(isLibraryPdfShare({ ...share, [field]: value })).toBe(false);
  });

  it.each(["", "x".repeat(201)])("rejects an empty or overlong filename", (name) => {
    expect(isLibraryPdfShare({ ...share, name })).toBe(false);
  });

  it.each(["bad", "", "2026-13-13T12:00:00.000Z"])("rejects an invalid creation date: %s", (createdAt) => {
    expect(isLibraryPdfShare({ ...share, createdAt })).toBe(false);
  });

  it.each(["a".repeat(35), "a".repeat(37), "g".repeat(36), `prefix-${share.id}`, `${share.id}-suffix`])(
    "rejects an invalid share identifier: %s",
    (id) => {
      expect(isLibraryPdfShare({ ...share, id })).toBe(false);
    },
  );

  it.each([
    `https://other.example${share.href}`,
    `/other/pdf/${"a".repeat(43)}`,
    `/share/manuscript/${"a".repeat(43)}`,
    `/share/pdf/${"a".repeat(42)}`,
    `/share/pdf/${"a".repeat(44)}`,
    `/share/pdf/${"a".repeat(42)}+`,
    `/share/pdf/${"a".repeat(42)}/`,
    `/share/pdf/${"a".repeat(42)}=`,
    `/prefix${share.href}`,
    `${share.href}/document.pdf`,
    `${share.href}?redirect=https://other.example`,
  ])("rejects a URL outside the exact opaque PDF-link route: %s", (href) => {
    expect(isLibraryPdfShare({ ...share, href })).toBe(false);
  });
});
