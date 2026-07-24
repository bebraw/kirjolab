import { describe, expect, it } from "vitest";
import {
  buildGitHubPublishPlan,
  buildGitHubPullPlan,
  compareGitHubSync,
  resolveGitHubPullPlan,
  summarizeGitHubSync,
  type GitHubSyncBaseFile,
} from "./github-sync";

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

  it("classifies local, remote, and matching two-sided deletions", () => {
    expect(compareGitHubSync([base[0]!], [], []).map((change) => change.kind)).toEqual(["identical"]);
    expect(compareGitHubSync([base[0]!], [], [remote("base")]).map((change) => change.kind)).toEqual(["local-only"]);
    expect(compareGitHubSync([base[0]!], [local("base")], []).map((change) => change.kind)).toEqual(["remote-only"]);
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

  it("builds a pull plan from remote-only changes and blocks conflicts", () => {
    const comparison = compareGitHubSync(
      base,
      [local("base"), local("chapter", "local chapter"), { fileId: "notes", path: "notes.md", content: "notes" }],
      [remote("remote"), remote("chapter", "remote chapter"), { path: "appendix.md", blobSha: "d", content: "appendix" }],
    );

    const plan = buildGitHubPullPlan(comparison);
    expect(plan.changes.map((change) => change.remote?.path)).toEqual(["appendix.md", "main.md"]);
    expect(plan.blocking.map((change) => change.local?.path)).toEqual(["chapter.md"]);
    expect(resolveGitHubPullPlan(plan, [{ conflict: 0, choice: "remote" }]).map((change) => change.remote?.path)).toEqual([
      "appendix.md",
      "main.md",
      "chapter.md",
    ]);
    expect(resolveGitHubPullPlan(plan, [{ conflict: 0, choice: "local" }])).toEqual(plan.changes);
    expect(() => resolveGitHubPullPlan(plan, [])).toThrow("Every GitHub pull conflict");
    expect(() => resolveGitHubPullPlan(plan, [{ conflict: 1, choice: "local" }])).toThrow("resolution is invalid");
    expect(() => resolveGitHubPullPlan(plan, [{ conflict: -1, choice: "local" }])).toThrow("resolution is invalid");
    expect(() => resolveGitHubPullPlan(plan, [{ conflict: 0.5, choice: "local" }])).toThrow("resolution is invalid");
    expect(() => resolveGitHubPullPlan(plan, [{ conflict: 0, choice: "invalid" as never }])).toThrow("resolution is invalid");

    const twoConflicts = { changes: [], blocking: [plan.blocking[0]!, plan.blocking[0]!] };
    expect(() =>
      resolveGitHubPullPlan(twoConflicts, [
        { conflict: 0, choice: "local" },
        { conflict: 0, choice: "remote" },
      ]),
    ).toThrow("resolution is invalid");
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
    expect(() => compareGitHubSync([{ ...base[0]!, path: "" }], [], [])).toThrow("base path");
    expect(() =>
      compareGitHubSync(
        [],
        [
          { fileId: "same", path: "one.md", content: "" },
          { fileId: "same", path: "two.md", content: "" },
        ],
        [],
      ),
    ).toThrow("local file id");
    expect(() =>
      compareGitHubSync(
        [],
        [],
        [
          { path: "same.md", blobSha: "a", content: "" },
          { path: "same.md", blobSha: "b", content: "" },
        ],
      ),
    ).toThrow("remote path");
  });

  it("distinguishes branch movement from tracked manuscript divergence", () => {
    const unchanged = compareGitHubSync(base, [local("base"), local("chapter", "chapter")], [remote("base"), remote("chapter", "chapter")]);
    expect(summarizeGitHubSync("a".repeat(40), "b".repeat(40), unchanged)).toMatchObject({
      relationship: "remote-changed",
      remoteHeadChanged: true,
      incomingChanges: 0,
      outgoingChanges: 0,
      conflicts: 0,
    });
    expect(summarizeGitHubSync("b".repeat(40), "b".repeat(40), unchanged).relationship).toBe("synced");
  });

  it("summarizes actionable incoming, outgoing, divergent, and conflicting states", () => {
    const summary = (localContent: string, remoteContent: string) =>
      summarizeGitHubSync(
        "a".repeat(40),
        "b".repeat(40),
        compareGitHubSync(base, [local(localContent), local("chapter", "chapter")], [remote(remoteContent), remote("chapter", "chapter")]),
      );
    expect(summary("base", "remote").relationship).toBe("github-ahead");
    expect(summary("local", "base").relationship).toBe("kirjolab-ahead");
    expect(summary("local", "remote").relationship).toBe("conflicted");

    const diverged = compareGitHubSync(
      base,
      [local("base"), local("local chapter", "local chapter")],
      [remote("remote"), remote("chapter", "chapter")],
    );
    expect(summarizeGitHubSync("a".repeat(40), "b".repeat(40), diverged)).toMatchObject({
      relationship: "diverged",
      incomingChanges: 1,
      outgoingChanges: 1,
    });
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
