import { describe, expect, it } from "vitest";
import { isValidCitationKey, isValidDoi, normalizePublicationDoi, suggestCitationKey } from "./publication-intake";

describe("publication DOI intake", () => {
  it("normalizes plain DOI values, labels, and resolver URLs compatibly with bibliography normalization", () => {
    expect(normalizePublicationDoi(" 10.1234/Example.Item ")).toBe("10.1234/example.item");
    expect(normalizePublicationDoi("DOI: 10.1234/Example.Item")).toBe("10.1234/example.item");
    expect(normalizePublicationDoi("https://doi.org/10.1234/Example.Item")).toBe("10.1234/example.item");
    expect(normalizePublicationDoi("HTTP://DX.DOI.ORG/10.1234/Example.Item")).toBe("10.1234/example.item");
  });

  it("accepts bounded DOI prefixes and suffix punctuation", () => {
    expect(isValidDoi("10.1234/example")).toBe(true);
    expect(isValidDoi("10.123456789/example:part_(2).v1")).toBe(true);
    expect(isValidDoi("https://doi.org/10.5555/ABC-123_(test)")).toBe(true);
    expect(isValidDoi(`10.1234/${"x".repeat(247)}`)).toBe(true);
  });

  it("rejects malformed, whitespace-bearing, controlled, and oversized DOI input", () => {
    const invalid = [
      "",
      "doi:",
      "not-a-doi",
      "11.1234/example",
      "10.123/example",
      "10.1234567890/example",
      "10.1234/",
      "10.1234/has space",
      "10.1234/line\nbreak",
      "10.1234/control\u0000value",
      `10.1234/${"x".repeat(248)}`,
      `10.1234/${"x".repeat(504)}`,
    ];

    for (const value of invalid) expect(isValidDoi(value), value).toBe(false);
  });
});

describe("publication citation-key intake", () => {
  it("validates the citation-key grammar and boundary used by BibTeX parsing", () => {
    for (const value of ["doe2026", "Doe:2026", "key.with_under-score+part"]) expect(isValidCitationKey(value), value).toBe(true);
    for (const value of ["", "has space", "has,comma", "has[bracket]", `a${"b".repeat(200)}`]) {
      expect(isValidCitationKey(value), value).toBe(false);
    }
    expect(isValidCitationKey("a".repeat(200))).toBe(true);
  });

  it("suggests lowercased ASCII family and year keys", () => {
    expect(suggestCitationKey({ authors: ["García Márquez, Gabriel"], year: "2026" }, [])).toBe("garciamarquez2026");
    expect(suggestCitationKey({ authors: ["Jane Østergård"], year: "2025" }, [])).toBe("ostergard2025");
    expect(suggestCitationKey({ authors: ["L'Œuf, François"], year: "2024" }, [])).toBe("loeuf2024");
    expect(suggestCitationKey({ authors: ["Groß, Ada"], year: "2023" }, [])).toBe("gross2023");
  });

  it("falls back deterministically when author or year metadata is missing", () => {
    expect(suggestCitationKey({ authors: [], year: "2026" }, [])).toBe("reference2026");
    expect(suggestCitationKey({ authors: ["Doe, Jane"], year: "" }, [])).toBe("doe");
    expect(suggestCitationKey({ authors: ["", "Roe, Richard"], year: "forthcoming" }, [])).toBe("roe");
    expect(suggestCitationKey({ authors: ["王, 小明"], year: "" }, [])).toBe("reference");
  });

  it("uses the first available stable alphabetic suffix for case-insensitive collisions", () => {
    expect(suggestCitationKey({ authors: ["Doe, Jane"], year: "2026" }, ["DOE2026"])).toBe("doe2026a");
    expect(suggestCitationKey({ authors: ["Doe, Jane"], year: "2026" }, ["doe2026b", " Doe2026 ", "DOE2026A"])).toBe("doe2026c");

    const throughZ = ["doe2026", ...Array.from({ length: 26 }, (_, index) => `doe2026${String.fromCharCode(97 + index)}`)];
    expect(suggestCitationKey({ authors: ["Doe, Jane"], year: "2026" }, throughZ)).toBe("doe2026aa");
  });

  it("is stable across reserved-key order and keeps suffixed keys within the parser bound", () => {
    const metadata = { authors: [`${"A".repeat(220)}, Researcher`], year: "2026" };
    const base = suggestCitationKey(metadata, []);
    expect(base).toHaveLength(200);
    expect(isValidCitationKey(base)).toBe(true);

    const forward = suggestCitationKey(metadata, [base, `${base.slice(0, 199)}a`]);
    const reverse = suggestCitationKey(metadata, [`${base.slice(0, 199)}a`, base]);
    expect(forward).toBe(`${base.slice(0, 199)}b`);
    expect(reverse).toBe(forward);
    expect(isValidCitationKey(forward)).toBe(true);
  });
});
