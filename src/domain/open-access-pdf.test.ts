import { describe, expect, it } from "vitest";
import { isOpenAccessPdfDiscovery, isOpenAccessPdfImportInput } from "./open-access-pdf";

describe("open-access PDF contracts", () => {
  const fingerprint = `sha256:${"a".repeat(64)}`;

  it("validates bounded provider discovery and import identities", () => {
    expect(
      isOpenAccessPdfDiscovery({
        candidate: {
          provider: "openalex",
          providerRecordId: "W1",
          landingUrl: "https://example.test/work",
          pdfUrl: "https://example.test/work.pdf",
          license: "cc-by",
          version: "acceptedVersion",
          fingerprint,
        },
      }),
    ).toBe(true);
    expect(isOpenAccessPdfDiscovery({ candidate: { provider: "browser", fingerprint } })).toBe(false);
    expect(isOpenAccessPdfImportInput({ provider: "unpaywall", fingerprint })).toBe(true);
    expect(isOpenAccessPdfImportInput({ provider: "unpaywall", fingerprint: "stale" })).toBe(false);
  });
});
