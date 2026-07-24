import { describe, expect, it } from "vitest";
import {
  isCreatedAnnotation,
  isGitHubBranchList,
  isGitHubConnectionState,
  isGitHubImportPreview,
  isGitHubInstallationList,
  isGitHubPublishPreview,
  isGitHubPullPreview,
  isGitHubRepositoryList,
  isGitHubSyncState,
  isLatexImportPreview,
  isWebSnapshotComparisonResponse,
} from "./app-contracts";

describe("app response contracts", () => {
  it("validates web snapshot comparisons and their hunks", () => {
    const value = {
      before: { id: "before" },
      after: { id: "after" },
      comparison: {
        identical: false,
        addedLines: 1,
        removedLines: 1,
        hunks: [{ beforeLine: 2, afterLine: 2, removed: ["old"], added: ["new"], truncated: false }],
      },
    };

    expect(isWebSnapshotComparisonResponse(value)).toBe(true);
    expect(
      isWebSnapshotComparisonResponse({
        ...value,
        comparison: { ...value.comparison, hunks: [{ ...value.comparison.hunks[0], added: [1] }] },
      }),
    ).toBe(false);
    expect(isWebSnapshotComparisonResponse(null)).toBe(false);
  });

  it("validates disconnected and connected GitHub account states", () => {
    expect(isGitHubConnectionState({ connected: false })).toBe(true);
    expect(isGitHubConnectionState({ connected: true, user: { id: "1", login: "octo" }, connectedAt: "2026-07-24" })).toBe(true);
    expect(isGitHubConnectionState({ connected: true, user: { id: "1" } })).toBe(false);
  });

  it("validates GitHub installation, repository, and branch lists", () => {
    const repository = {
      id: 1,
      owner: "openai",
      name: "kirjolab",
      fullName: "openai/kirjolab",
      private: true,
      defaultBranch: "main",
    };

    expect(
      isGitHubInstallationList({
        installations: [{ id: 1, accountId: "2", accountLogin: "openai", accountType: "Organization" }],
      }),
    ).toBe(true);
    expect(
      isGitHubInstallationList({
        installations: [{ id: 1.5, accountId: "2", accountLogin: "openai", accountType: "Team" }],
      }),
    ).toBe(false);
    expect(isGitHubRepositoryList({ repositories: [repository] })).toBe(true);
    expect(isGitHubRepositoryList({ repositories: [{ ...repository, private: "yes" }] })).toBe(false);
    expect(isGitHubBranchList({ repository, branches: [{ name: "main", protected: true }] })).toBe(true);
    expect(isGitHubBranchList({ repository, branches: [{ name: "main" }] })).toBe(false);
  });

  it("validates GitHub import and synchronization payloads", () => {
    expect(
      isGitHubImportPreview({ id: "preview", commitSha: "abc", entryPath: "paper.md", files: [{ path: "paper.md", bytes: 10 }] }),
    ).toBe(true);
    expect(isGitHubImportPreview({ id: "preview", commitSha: "abc", entryPath: "paper.md", files: [{ path: "paper.md" }] })).toBe(false);
    expect(isGitHubSyncState({ owner: "openai", repository: "kirjolab", branch: "main", rootPath: "", commitSha: "abc" })).toBe(true);
    expect(isGitHubSyncState({ owner: "openai", repository: "kirjolab", branch: "main", rootPath: "" })).toBe(false);
  });

  it("validates GitHub pull plans and conflict file contracts", () => {
    const value = {
      id: "preview",
      plan: {
        changes: [{ base: { path: "paper.md" }, remote: null }],
        blocking: [
          {
            base: { path: "paper.md", content: "base" },
            local: { path: "paper.md", content: "local" },
            remote: { path: "paper.md", content: "remote" },
          },
        ],
      },
    };

    expect(isGitHubPullPreview(value)).toBe(true);
    expect(isGitHubPullPreview({ ...value, plan: { ...value.plan, changes: [{ base: { path: 1 }, remote: null }] } })).toBe(false);
    expect(
      isGitHubPullPreview({ ...value, plan: { ...value.plan, blocking: [{ base: null, local: { path: "paper.md" }, remote: null }] } }),
    ).toBe(false);
  });

  it("validates GitHub publish plans", () => {
    const value = {
      id: "preview",
      expectedRemoteHead: "abc",
      plan: { changes: [{ path: "paper.md", content: "text" }], skippedLocalPaths: ["notes.txt"], blocking: [] },
    };

    expect(isGitHubPublishPreview(value)).toBe(true);
    expect(isGitHubPublishPreview({ ...value, plan: { ...value.plan, changes: [{ path: "paper.md", content: 1 }] } })).toBe(false);
    expect(isGitHubPublishPreview({ ...value, expectedRemoteHead: 1 })).toBe(false);
  });

  it("validates LaTeX archive previews with and without conversion", () => {
    const archive = { files: [{ path: "paper.tex", kind: "tex", bytes: 10 }], rootCandidates: ["paper.tex"] };
    const value = {
      digest: "a".repeat(64),
      archive,
      conversion: {
        seed: { files: [{ path: "paper.md", content: "# Paper" }], bibliography: "" },
        assets: [{ path: "figure.png", mediaType: "image/png", bytes: 20 }],
        report: {
          rootPath: "paper.tex",
          bibliographyPath: null,
          diagnostics: [{ severity: "info", message: "Converted" }],
        },
      },
    };

    expect(isLatexImportPreview(value)).toBe(true);
    expect(isLatexImportPreview({ digest: "b".repeat(64), archive, conversion: null })).toBe(true);
    expect(isLatexImportPreview({ ...value, digest: "not-a-digest" })).toBe(false);
    expect(isLatexImportPreview({ ...value, archive: { ...archive, files: [{ path: "paper.tex", kind: "tex", bytes: -1 }] } })).toBe(false);
    expect(
      isLatexImportPreview({
        ...value,
        conversion: { ...value.conversion, assets: [{ path: "figure.png", mediaType: "image/png", bytes: 0 }] },
      }),
    ).toBe(false);
    expect(
      isLatexImportPreview({
        ...value,
        conversion: { ...value.conversion, report: { ...value.conversion.report, diagnostics: [{ severity: "fatal", message: "No" }] } },
      }),
    ).toBe(false);
  });

  it("validates created annotation resources", () => {
    const value = {
      id: "annotation",
      pdfId: "pdf",
      page: 1,
      quote: "quoted",
      prefix: "",
      suffix: "",
      comment: "",
      rects: [],
      fragments: [],
      createdAt: "2026-07-24",
      updatedAt: "2026-07-24",
    };

    expect(isCreatedAnnotation(value)).toBe(true);
    expect(isCreatedAnnotation({ ...value, fragments: null })).toBe(false);
  });
});
