import { describe, expect, it } from "vitest";
import {
  compareProjectRevisions,
  isProjectRevisionContent,
  isProjectRevisionDiff,
  isProjectRevisionSummaries,
  type ProjectRevisionContent,
} from "./project-history";

const base: ProjectRevisionContent = {
  revision: 3,
  title: "Paper",
  entryFileId: "main",
  source: "",
  bibliography: "",
  files: [
    { id: "main", path: "main.md", mediaType: "text/markdown", content: "::include[chapters/a.md]\n", createdAt: "t1", updatedAt: "t1" },
    { id: "chapter", path: "chapters/a.md", mediaType: "text/markdown", content: "Old claim", createdAt: "t1", updatedAt: "t1" },
  ],
  projectReferences: [],
  researchShares: [],
  pdfs: [
    {
      id: "pdf-1",
      name: "paper.pdf",
      contentType: "application/pdf",
      size: 100,
      objectKey: "private/paper.pdf",
      fingerprint: "old",
      createdAt: "t1",
    },
  ],
  publicationPdfLinks: [],
  annotations: [],
  claims: [],
  relationships: { annotationPassages: 0, claimEvidence: 0, claimPassages: 0 },
};

describe("project revision comparison", () => {
  it("tracks stable file identities across renames and compares composed source", () => {
    const after: ProjectRevisionContent = {
      ...base,
      revision: 9,
      files: [
        { ...base.files[0]!, content: "::include[chapters/renamed.md]\n" },
        { ...base.files[1]!, path: "chapters/renamed.md", content: "New claim" },
        { id: "appendix", path: "appendix.md", mediaType: "text/markdown", content: "Appendix", createdAt: "t2", updatedAt: "t2" },
      ],
      pdfs: [{ ...base.pdfs[0]!, size: 120, fingerprint: "new" }],
    };

    const comparison = compareProjectRevisions(base, after);
    expect(comparison).toMatchObject({
      fromRevision: 3,
      toRevision: 9,
      composed: { addedLines: 1, removedLines: 1, beforeWords: 2, afterWords: 2, wordDelta: 0 },
      files: [
        { id: "appendix", status: "added", beforePath: null, afterPath: "appendix.md" },
        { id: "chapter", status: "renamed", beforePath: "chapters/a.md", afterPath: "chapters/renamed.md" },
        { id: "main", status: "modified" },
      ],
      binaries: [{ id: "pdf-1", status: "modified", before: { size: 100, fingerprint: "old" }, after: { size: 120, fingerprint: "new" } }],
    });
  });

  it("reports removed text and unchanged binary identity", () => {
    const after: ProjectRevisionContent = { ...base, revision: 4, files: [base.files[0]!], pdfs: base.pdfs };
    expect(compareProjectRevisions(base, after)).toEqual({
      fromRevision: 3,
      toRevision: 4,
      files: [
        {
          id: "chapter",
          status: "removed",
          beforePath: "chapters/a.md",
          afterPath: null,
          addedLines: 0,
          removedLines: 1,
          hunks: [{ beforeLine: 1, afterLine: 1, removed: ["Old claim"], added: [], truncated: false }],
        },
        {
          id: "main",
          status: "unchanged",
          beforePath: "main.md",
          afterPath: "main.md",
          addedLines: 0,
          removedLines: 0,
          hunks: [],
        },
      ],
      composed: {
        addedLines: 0,
        removedLines: 1,
        beforeWords: 2,
        afterWords: 0,
        wordDelta: -2,
        hunks: [{ beforeLine: 1, afterLine: 1, removed: ["Old claim"], added: [], truncated: false }],
      },
      binaries: [
        {
          id: "pdf-1",
          status: "unchanged",
          before: { name: "paper.pdf", contentType: "application/pdf", size: 100, fingerprint: "old" },
          after: { name: "paper.pdf", contentType: "application/pdf", size: 100, fingerprint: "old" },
        },
      ],
    });
  });

  it("distinguishes added, removed, and each modified binary identity field", () => {
    const added = { ...base.pdfs[0]!, id: "pdf-2", name: "added.pdf" };
    const mixed = compareProjectRevisions(base, { ...base, revision: 4, pdfs: [added] });
    expect(mixed.binaries).toEqual([
      {
        id: "pdf-1",
        status: "removed",
        before: { name: "paper.pdf", contentType: "application/pdf", size: 100, fingerprint: "old" },
        after: null,
      },
      {
        id: "pdf-2",
        status: "added",
        before: null,
        after: { name: "added.pdf", contentType: "application/pdf", size: 100, fingerprint: "old" },
      },
    ]);
    for (const pdf of [
      { ...base.pdfs[0]!, name: "renamed.pdf" },
      { ...base.pdfs[0]!, contentType: "application/pdf" as const, size: 101 },
      { ...base.pdfs[0]!, fingerprint: "different" },
    ]) {
      expect(compareProjectRevisions(base, { ...base, revision: 4, pdfs: [pdf] }).binaries[0]?.status).toBe("modified");
    }
  });

  it("falls back to retained composed source when an entry file is unavailable", () => {
    const before = { ...base, entryFileId: "missing", files: [], source: "Old fallback" };
    const after = { ...before, revision: 4, source: "New fallback" };
    expect(compareProjectRevisions(before, after).composed).toEqual({
      addedLines: 1,
      removedLines: 1,
      beforeWords: 2,
      afterWords: 2,
      wordDelta: 0,
      hunks: [{ beforeLine: 1, afterLine: 1, removed: ["Old fallback"], added: ["New fallback"], truncated: false }],
    });
  });

  it("validates public history boundaries", () => {
    const comparison = compareProjectRevisions(base, { ...base, revision: 4 });
    const summary = {
      revision: 4,
      title: "Paper",
      reason: "document-edit",
      createdAt: "2026-07-12T10:00:00.000Z",
      fileCount: 2,
      milestones: [{ id: "tag", revision: 4, name: "submitted", description: "", createdAt: "now" }],
    };
    expect(isProjectRevisionContent(base)).toBe(true);
    for (const change of [
      { revision: -1 },
      { title: null },
      { entryFileId: null },
      { source: null },
      { bibliography: null },
      { files: null },
      { projectReferences: null },
      { researchShares: null },
      { pdfs: null },
      { publicationPdfLinks: null },
      { annotations: null },
      { claims: null },
      { relationships: null },
      { relationships: { ...base.relationships, annotationPassages: 1.5 } },
      { relationships: { ...base.relationships, claimEvidence: "1" } },
      { relationships: { ...base.relationships, claimPassages: null } },
    ]) {
      expect(isProjectRevisionContent({ ...base, ...change }), JSON.stringify(change)).toBe(false);
    }
    for (const [field, invalid] of Object.entries({
      id: null,
      path: null,
      mediaType: "text/html",
      content: null,
      createdAt: null,
      updatedAt: null,
    })) {
      expect(isProjectRevisionContent({ ...base, files: [{ ...base.files[0], [field]: invalid }] }), field).toBe(false);
    }
    expect(isProjectRevisionContent(null)).toBe(false);
    expect(isProjectRevisionContent([])).toBe(false);
    expect(isProjectRevisionDiff(comparison)).toBe(true);
    for (const change of [
      { fromRevision: -1 },
      { toRevision: -1 },
      { files: null },
      { composed: null },
      { composed: { ...comparison.composed, addedLines: 1.5 } },
      { composed: { ...comparison.composed, removedLines: "0" } },
      { composed: { ...comparison.composed, beforeWords: 1.5 } },
      { composed: { ...comparison.composed, beforeWords: -1 } },
      { composed: { ...comparison.composed, afterWords: "0" } },
      { composed: { ...comparison.composed, wordDelta: null } },
      { composed: { ...comparison.composed, wordDelta: comparison.composed.wordDelta + 1 } },
      { composed: { ...comparison.composed, hunks: null } },
      { binaries: null },
    ]) {
      expect(isProjectRevisionDiff({ ...comparison, ...change }), JSON.stringify(change)).toBe(false);
    }
    const validFileDiff = comparison.files[0]!;
    for (const [field, invalid] of Object.entries({ id: null, status: "moved", addedLines: 1.5, removedLines: "0", hunks: null })) {
      expect(isProjectRevisionDiff({ ...comparison, files: [{ ...validFileDiff, [field]: invalid }] }), field).toBe(false);
    }
    expect(isProjectRevisionDiff(null)).toBe(false);

    expect(isProjectRevisionSummaries([summary])).toBe(true);
    expect(isProjectRevisionSummaries([])).toBe(true);
    expect(isProjectRevisionSummaries(null)).toBe(false);
    for (const change of [
      { revision: -1 },
      { title: null },
      { reason: null },
      { createdAt: null },
      { fileCount: -1 },
      { fileCount: 1.5 },
      { milestones: null },
    ]) {
      expect(isProjectRevisionSummaries([{ ...summary, ...change }]), JSON.stringify(change)).toBe(false);
    }
    for (const [field, invalid] of Object.entries({ id: null, revision: -1, name: null, description: null, createdAt: null })) {
      expect(isProjectRevisionSummaries([{ ...summary, milestones: [{ ...summary.milestones[0], [field]: invalid }] }]), field).toBe(false);
    }
    expect(isProjectRevisionSummaries([null])).toBe(false);
  });
});
