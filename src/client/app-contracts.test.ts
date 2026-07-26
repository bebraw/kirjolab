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
  isLatexImportResult,
  isShareLinkStatus,
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

  it("validates created LaTeX workspace navigation", () => {
    expect(isLatexImportResult({ workspace: { href: "/editor/project" } })).toBe(true);
    expect(isLatexImportResult({ workspace: { href: 1 } })).toBe(false);
    expect(isLatexImportResult({ workspace: null })).toBe(false);
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

  it("validates share-link status payloads", () => {
    expect(isShareLinkStatus({ active: true, createdAt: "2026-07-24", href: "/shared/token" })).toBe(true);
    expect(isShareLinkStatus({ active: false, createdAt: null, href: null })).toBe(true);
    expect(isShareLinkStatus({ active: true, createdAt: 1, href: null })).toBe(false);
    expect(isShareLinkStatus({ active: "yes", createdAt: null, href: null })).toBe(false);
  });

  it("rejects each malformed comparison scalar and hunk field independently", () => {
    const hunk = { beforeLine: 2, afterLine: 3, removed: ["old"], added: ["new"], truncated: false };
    const value = {
      before: { id: "before" },
      after: { id: "after" },
      comparison: { identical: false, addedLines: 1, removedLines: 1, hunks: [hunk] },
    };
    for (const changed of [
      { ...value, before: null },
      { ...value, before: { id: 1 } },
      { ...value, after: { id: 1 } },
      { ...value, comparison: { ...value.comparison, identical: "false" } },
      { ...value, comparison: { ...value.comparison, addedLines: "1" } },
      { ...value, comparison: { ...value.comparison, removedLines: "1" } },
      { ...value, comparison: { ...value.comparison, hunks: null } },
    ]) {
      expect(isWebSnapshotComparisonResponse(changed)).toBe(false);
    }
    for (const changed of [
      null,
      { ...hunk, beforeLine: "2" },
      { ...hunk, afterLine: "3" },
      { ...hunk, removed: null },
      { ...hunk, removed: [1] },
      { ...hunk, added: null },
      { ...hunk, added: [1] },
      { ...hunk, truncated: "false" },
    ]) {
      expect(isWebSnapshotComparisonResponse({ ...value, comparison: { ...value.comparison, hunks: [changed] } })).toBe(false);
    }
  });

  it("rejects each malformed GitHub option and branch field independently", () => {
    const installation = { id: 1, accountId: "2", accountLogin: "openai", accountType: "User" };
    expect(isGitHubInstallationList({ installations: [{ ...installation, accountType: "Organization" }] })).toBe(true);
    for (const changed of [
      null,
      { ...installation, id: "1" },
      { ...installation, id: 1.5 },
      { ...installation, accountId: 2 },
      { ...installation, accountLogin: 2 },
      { ...installation, accountType: "Team" },
    ]) {
      expect(isGitHubInstallationList({ installations: [changed] })).toBe(false);
    }
    expect(isGitHubInstallationList(null)).toBe(false);
    expect(isGitHubInstallationList({ installations: null })).toBe(false);

    const repository = {
      id: 1,
      owner: "openai",
      name: "kirjolab",
      fullName: "openai/kirjolab",
      private: true,
      defaultBranch: "main",
    };
    for (const changed of [
      null,
      { ...repository, id: "1" },
      { ...repository, id: 1.5 },
      { ...repository, owner: 1 },
      { ...repository, name: 1 },
      { ...repository, fullName: 1 },
      { ...repository, private: "true" },
      { ...repository, defaultBranch: 1 },
    ]) {
      expect(isGitHubRepositoryList({ repositories: [changed] })).toBe(false);
    }
    expect(isGitHubRepositoryList({ repositories: null })).toBe(false);
    for (const branch of [null, { name: 1, protected: true }, { name: "main", protected: "true" }]) {
      expect(isGitHubBranchList({ repository, branches: [branch] })).toBe(false);
    }
    expect(isGitHubBranchList({ repository: null, branches: [] })).toBe(false);
    expect(isGitHubBranchList({ repository, branches: null })).toBe(false);
  });

  it("rejects each malformed import, sync, pull, and publish field independently", () => {
    const imported = { id: "preview", commitSha: "abc", entryPath: "paper.md", files: [{ path: "paper.md", bytes: 10 }] };
    for (const changed of [
      null,
      { ...imported, id: 1 },
      { ...imported, commitSha: 1 },
      { ...imported, entryPath: 1 },
      { ...imported, files: null },
      { ...imported, files: [null] },
      { ...imported, files: [{ path: 1, bytes: 10 }] },
      { ...imported, files: [{ path: "paper.md", bytes: "10" }] },
    ]) {
      expect(isGitHubImportPreview(changed)).toBe(false);
    }
    const sync = { owner: "openai", repository: "kirjolab", branch: "main", rootPath: "", commitSha: "abc" };
    for (const field of ["owner", "repository", "branch", "rootPath", "commitSha"] as const) {
      expect(isGitHubSyncState({ ...sync, [field]: 1 })).toBe(false);
    }

    const conflictFile = { path: "paper.md", content: "text" };
    const pull = {
      id: "preview",
      plan: {
        changes: [{ base: { path: "paper.md" }, remote: { path: "remote.md" } }],
        blocking: [{ base: conflictFile, local: conflictFile, remote: conflictFile }],
      },
    };
    expect(isGitHubPullPreview({ ...pull, plan: { ...pull.plan, changes: [{ base: null, remote: null }] } })).toBe(true);
    for (const changed of [
      null,
      { ...pull, id: 1 },
      { ...pull, plan: null },
      { ...pull, plan: { ...pull.plan, changes: null } },
      { ...pull, plan: { ...pull.plan, changes: [null] } },
      { ...pull, plan: { ...pull.plan, changes: [{ base: { path: 1 }, remote: null }] } },
      { ...pull, plan: { ...pull.plan, changes: [{ base: null, remote: { path: 1 } }] } },
      { ...pull, plan: { ...pull.plan, blocking: null } },
      { ...pull, plan: { ...pull.plan, blocking: [{ base: { path: "a", content: 1 }, local: null, remote: null }] } },
    ]) {
      expect(isGitHubPullPreview(changed)).toBe(false);
    }

    const publish = {
      id: "preview",
      expectedRemoteHead: "abc",
      plan: { changes: [{ path: "paper.md", content: null }], skippedLocalPaths: ["notes"], blocking: [] },
    };
    for (const changed of [
      null,
      { ...publish, id: 1 },
      { ...publish, expectedRemoteHead: 1 },
      { ...publish, plan: null },
      { ...publish, plan: { ...publish.plan, changes: null } },
      { ...publish, plan: { ...publish.plan, changes: [null] } },
      { ...publish, plan: { ...publish.plan, changes: [{ path: 1, content: null }] } },
      { ...publish, plan: { ...publish.plan, changes: [{ path: "a.md", content: 1 }] } },
      { ...publish, plan: { ...publish.plan, skippedLocalPaths: null } },
      { ...publish, plan: { ...publish.plan, skippedLocalPaths: [1] } },
      { ...publish, plan: { ...publish.plan, blocking: null } },
    ]) {
      expect(isGitHubPublishPreview(changed)).toBe(false);
    }
  });

  it("rejects each malformed LaTeX archive, conversion, asset, and diagnostic field", () => {
    const archive = { files: [{ path: "paper.tex", kind: "tex", bytes: 0 }], rootCandidates: ["paper.tex"] };
    const conversion = {
      seed: { files: [{ path: "paper.md", content: "# Paper" }], bibliography: "" },
      assets: [{ path: "figure.png", mediaType: "image/png", bytes: 1 }],
      report: {
        rootPath: "paper.tex",
        bibliographyPath: "refs.bib",
        diagnostics: [
          { severity: "error", message: "Error" },
          { severity: "warning", message: "Warning" },
          { severity: "info", message: "Info" },
        ],
      },
    };
    const value = { digest: "a".repeat(64), archive, conversion };
    for (const changed of [
      null,
      { ...value, digest: "A".repeat(64) },
      { ...value, archive: null },
      { ...value, archive: { ...archive, files: null } },
      { ...value, archive: { ...archive, files: [null] } },
      { ...value, archive: { ...archive, files: [{ path: 1, kind: "tex", bytes: 0 }] } },
      { ...value, archive: { ...archive, files: [{ path: "a", kind: 1, bytes: 0 }] } },
      { ...value, archive: { ...archive, files: [{ path: "a", kind: "tex", bytes: 0.5 }] } },
      { ...value, archive: { ...archive, rootCandidates: null } },
      { ...value, archive: { ...archive, rootCandidates: [1] } },
      { ...value, conversion: {} },
      { ...value, conversion: { ...conversion, seed: null } },
      { ...value, conversion: { ...conversion, seed: { ...conversion.seed, files: [null] } } },
      { ...value, conversion: { ...conversion, seed: { ...conversion.seed, files: [{ path: 1, content: "" }] } } },
      { ...value, conversion: { ...conversion, seed: { ...conversion.seed, files: [{ path: "a", content: 1 }] } } },
      { ...value, conversion: { ...conversion, seed: { ...conversion.seed, bibliography: 1 } } },
      { ...value, conversion: { ...conversion, assets: null } },
      { ...value, conversion: { ...conversion, assets: [{ path: 1, mediaType: "image/png", bytes: 1 }] } },
      { ...value, conversion: { ...conversion, assets: [{ path: "a", mediaType: 1, bytes: 1 }] } },
      { ...value, conversion: { ...conversion, assets: [{ path: "a", mediaType: "image/png", bytes: 1.5 }] } },
      { ...value, conversion: { ...conversion, report: { ...conversion.report, rootPath: 1 } } },
      { ...value, conversion: { ...conversion, report: { ...conversion.report, bibliographyPath: 1 } } },
      { ...value, conversion: { ...conversion, report: { ...conversion.report, diagnostics: null } } },
      { ...value, conversion: { ...conversion, report: { ...conversion.report, diagnostics: [null] } } },
      { ...value, conversion: { ...conversion, report: { ...conversion.report, diagnostics: [{ severity: "info", message: 1 }] } } },
    ]) {
      expect(isLatexImportPreview(changed)).toBe(false);
    }
  });

  it("rejects each malformed annotation and nullable share-link field", () => {
    const annotation = {
      id: "annotation",
      pdfId: "pdf",
      page: 1,
      quote: "quote",
      prefix: "",
      suffix: "",
      comment: "",
      rects: [],
      fragments: [],
      createdAt: "created",
      updatedAt: "updated",
    };
    for (const field of ["id", "pdfId", "quote", "prefix", "suffix", "comment", "createdAt", "updatedAt"] as const) {
      expect(isCreatedAnnotation({ ...annotation, [field]: 1 })).toBe(false);
    }
    expect(isCreatedAnnotation({ ...annotation, page: "1" })).toBe(false);
    expect(isCreatedAnnotation({ ...annotation, rects: null })).toBe(false);
    expect(isCreatedAnnotation({ ...annotation, fragments: null })).toBe(false);
    expect(isShareLinkStatus(null)).toBe(false);
    expect(isShareLinkStatus({ active: true, createdAt: null, href: 1 })).toBe(false);
  });
});
