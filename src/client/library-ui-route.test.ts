import { describe, expect, it } from "vitest";
import { libraryPdfRoute, readLibraryUiRoute } from "./library-ui-route";

describe("Library UI routes", () => {
  it("reads the Library root and optional addressed reference", () => {
    expect(readLibraryUiRoute(new URL("https://example.test/library"))).toEqual({ kind: "library", referenceId: null });
    expect(readLibraryUiRoute(new URL("https://example.test/library?reference=reference%3A1"))).toEqual({
      kind: "library",
      referenceId: "reference:1",
    });
  });

  it("reads an encoded PDF artifact and bounded page", () => {
    expect(readLibraryUiRoute(new URL("https://example.test/library/pdfs/library%2Fpdf?page=3"))).toEqual({
      artifactId: "library/pdf",
      kind: "pdf",
      page: 3,
    });
    expect(readLibraryUiRoute(new URL("https://example.test/library/pdfs/library%2Fpdf?page=-2"))).toMatchObject({ page: 1 });
  });

  it("retains a malformed PDF route as an unresolved artifact", () => {
    expect(readLibraryUiRoute(new URL("https://example.test/library/pdfs/%E0%A4%A"))).toEqual({
      artifactId: null,
      kind: "pdf",
      page: 1,
    });
  });

  it("writes canonical encoded PDF routes", () => {
    expect(libraryPdfRoute("library/pdf", 1)).toBe("/library/pdfs/library%2Fpdf");
    expect(libraryPdfRoute("library/pdf", 4)).toBe("/library/pdfs/library%2Fpdf?page=4");
  });
});
