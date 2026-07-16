import { describe, expect, it } from "vitest";
import { buildGitHubPublishPlan, compareGitHubSync, type GitHubSyncBaseFile } from "./github-sync";

const base: readonly GitHubSyncBaseFile[] = [
  { fileId: "main", path: "main.md", blobSha: "a", content: "base" },
  { fileId: "chapter", path: "chapter.md", blobSha: "b", content: "chapter" },
];

describe("GitHub three-way sync", () => {
  it("classifies unchanged, local-only, remote-only, identical, and conflicting edits", () => {
    expect(kinds([local("base"), local("chapter", "chapter")], [remote("base"), remote("chapter", "chapter")])).toEqual([
      "unchanged",
      "unchanged",
    ]);
    expect(kinds([local("local"), local("chapter", "chapter")], [remote("base"), remote("chapter", "chapter")])).toEqual([
      "unchanged",
      "local-only",
    ]);
    expect(kinds([local("base"), local("chapter", "chapter")], [remote("remote"), remote("chapter", "chapter")])).toEqual([
      "unchanged",
      "remote-only",
    ]);
    expect(kinds([local("same"), local("chapter", "chapter")], [remote("same"), remote("chapter", "chapter")])).toEqual([
      "unchanged",
      "identical",
    ]);
    expect(kinds([local("local"), local("chapter", "chapter")], [remote("remote"), remote("chapter", "chapter")])).toEqual([
      "unchanged",
      "conflict",
    ]);
  });

  it("preserves identities across unique unchanged remote renames", () => {
    const comparison = compareGitHubSync(
      base,
      [local("base"), local("chapter", "chapter")],
      [{ path: "renamed.md", blobSha: "a", content: "base" }, remote("chapter", "chapter")],
    );
    expect(comparison.map((change) => [change.kind, change.base?.path, change.remote?.path])).toEqual([
      ["unchanged", "chapter.md", "chapter.md"],
      ["remote-only", "main.md", "renamed.md"],
    ]);
  });

  it("treats concurrent additions by path as identical or conflicting", () => {
    const identical = compareGitHubSync(
      [],
      [{ fileId: "new", path: "new.md", content: "same" }],
      [{ path: "new.md", blobSha: "c", content: "same" }],
    );
    expect(identical[0]?.kind).toBe("identical");
    const conflict = compareGitHubSync(
      [],
      [{ fileId: "new", path: "new.md", content: "local" }],
      [{ path: "new.md", blobSha: "c", content: "remote" }],
    );
    expect(conflict[0]?.kind).toBe("conflict");
  });

  it("builds a confined publish plan while skipping untracked local files", () => {
    const comparison = compareGitHubSync(
      base,
      [
        { fileId: "main", path: "renamed.md", content: "updated" },
        { fileId: "chapter", path: "chapter.md", content: "chapter" },
        { fileId: "draft", path: "notes.md", content: "local only" },
      ],
      [remote("base"), remote("chapter", "chapter")],
    );
    expect(buildGitHubPublishPlan(comparison)).toEqual({
      changes: [
        { path: "main.md", content: null },
        { path: "renamed.md", content: "updated" },
      ],
      skippedLocalPaths: ["notes.md"],
      blocking: [],
    });
  });

  it("blocks publish when the remote side moved or conflicts", () => {
    const comparison = compareGitHubSync(
      base,
      [local("local"), local("chapter", "chapter")],
      [remote("remote"), remote("chapter", "remote chapter")],
    );
    const plan = buildGitHubPublishPlan(comparison);
    expect(plan.changes).toEqual([]);
    expect(plan.blocking.map((change) => change.kind)).toEqual(["remote-only", "conflict"]);
  });

  it("rejects ambiguous identities", () => {
    expect(() => compareGitHubSync([base[0]!, { ...base[1]!, fileId: "main" }], [], [])).toThrow("base file id");
    expect(() =>
      compareGitHubSync(
        [],
        [
          { fileId: "one", path: "same.md", content: "" },
          { fileId: "two", path: "same.md", content: "" },
        ],
        [],
      ),
    ).toThrow("local path");
  });
});

function local(content: string, chapterContent?: string) {
  return chapterContent === undefined
    ? { fileId: "main", path: "main.md", content }
    : { fileId: "chapter", path: "chapter.md", content: chapterContent };
}

function remote(content: string, chapterContent?: string) {
  return chapterContent === undefined
    ? { path: "main.md", blobSha: content === "base" ? "a" : "remote-sha", content }
    : { path: "chapter.md", blobSha: content === "chapter" ? "b" : "remote-chapter-sha", content: chapterContent };
}

function kinds(localFiles: ReturnType<typeof local>[], remoteFiles: ReturnType<typeof remote>[]) {
  return compareGitHubSync(base, localFiles, remoteFiles).map((change) => change.kind);
}
