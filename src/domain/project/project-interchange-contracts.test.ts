import { describe, expect, it } from "vitest";
import { projectArchiveFixture } from "../../test-support/project-archive";
import { projectArchiveSummary } from "./project-archive";
import { isProjectArchiveSummary, isProjectImportPreview, isProjectImportResult } from "./project-interchange-contracts";
describe("project interchange response contracts", () => {
  it("requires valid bounded counts, scope, hashes and canonical navigation", () => {
    const summary = projectArchiveSummary(projectArchiveFixture());
    const preview = {
      kind: "native",
      summary,
      archiveSha256: "a".repeat(64),
      previewDigest: "b".repeat(64),
      reusedReferences: 0,
      newReferences: 2,
    };
    expect(isProjectImportPreview(preview)).toBe(true);
    expect(isProjectImportPreview({ ...preview, kind: "legacy", previewDigest: null })).toBe(true);
    const source = {
      ...preview,
      kind: "source",
      source: { entryCandidates: ["main.md"], bibliographyCandidates: [], bibliographyPath: "", includePdfs: true, skippedEntries: 1_100 },
    };
    expect(isProjectImportPreview(source)).toBe(true);
    expect(isProjectImportPreview({ ...source, source: null })).toBe(false);
    expect(isProjectImportPreview({ ...source, source: { ...source.source, entryCandidates: [] } })).toBe(false);
    for (const value of [
      null,
      {},
      { ...preview, kind: "unknown" },
      { ...preview, summary: null },
      { ...preview, archiveSha256: "bad" },
      { ...preview, previewDigest: null },
      { ...preview, reusedReferences: -1 },
      { ...preview, newReferences: 0.5 },
      { ...preview, kind: "legacy" },
    ])
      expect(isProjectImportPreview(value)).toBe(false);
    expect(isProjectArchiveSummary({ ...summary, exclusions: ["x".repeat(2_001)] })).toBe(false);
    expect(isProjectImportResult({ workspace: { href: "/editor/new-project" } })).toBe(true);
    for (const value of [null, {}, { workspace: null }, { workspace: { href: 123 } }, { workspace: { href: "//evil.test" } }])
      expect(isProjectImportResult(value)).toBe(false);
  });
});
