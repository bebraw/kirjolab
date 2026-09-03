import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import strykerConfig from "../stryker.config.mjs";

import {
  affectsMutationCiRouting,
  changedMutationFiles,
  changedMutationLineRanges,
  coalesceLineRanges,
  mutationCanarySource,
  mutationCiCommandArguments,
  mutationCiPlan,
  mutationCiRefs,
  mutationDiffArguments,
  mutationLineDiffArguments,
  parseChangedFiles,
  parseChangedLineDiff,
  parseChangedLineRanges,
  runCiMutation,
  validateMutationCommitSha,
  validateMutationPatternPath,
} from "./run-ci-mutation.mjs";

const baseSha = "1".repeat(40);
const headSha = "a".repeat(40);
const workspaceSource = "src/domain/workspace/workspace.ts";
const workspaceTest = "src/domain/workspace/workspace.test.ts";

test("requires explicit full commit SHAs", () => {
  assert.deepEqual(mutationCiRefs({ MUTATION_BASE_SHA: baseSha, MUTATION_HEAD_SHA: headSha }), {
    baseSha,
    headSha,
  });
  assert.equal(validateMutationCommitSha("B".repeat(64), "sha"), "B".repeat(64));
  assert.throws(() => mutationCiRefs({ MUTATION_HEAD_SHA: headSha }), /MUTATION_BASE_SHA/u);
  assert.throws(() => mutationCiRefs({ MUTATION_BASE_SHA: "main", MUTATION_HEAD_SHA: headSha }), /40- or 64-character hexadecimal/u);
});

test("runs pull-request mutation as an instrumented dry run", () => {
  assert.deepEqual(mutationCiCommandArguments({ script: "mutation:affected", sources: [workspaceSource] }), [
    "run",
    "mutation:affected",
    "--",
    "--dryRunOnly",
    "--reporters",
    "progress",
    "--mutate",
    workspaceSource,
  ]);
});

test("parses NUL-safe ACMRD statuses and retains both rename and copy paths", () => {
  assert.deepEqual(mutationDiffArguments({ baseSha, headSha }), [
    "diff",
    "--name-status",
    "--diff-filter=ACMRD",
    "-z",
    `${baseSha}...${headSha}`,
    "--",
  ]);
  assert.deepEqual(
    parseChangedFiles(
      "M\0src/modified.ts\0A\0src/added.ts\0D\0src/deleted.ts\0R087\0src/old.ts\0src/new.ts\0C100\0src/source.ts\0src/copy.ts\0",
    ),
    [
      { status: "M", path: "src/modified.ts" },
      { status: "A", path: "src/added.ts" },
      { status: "D", path: "src/deleted.ts" },
      { status: "R", score: 87, oldPath: "src/old.ts", path: "src/new.ts" },
      { status: "C", score: 100, oldPath: "src/source.ts", path: "src/copy.ts" },
    ],
  );
  assert.deepEqual(parseChangedFiles("M\0docs/a\nname.md\0"), [{ status: "M", path: "docs/a\nname.md" }]);
  assert.deepEqual(parseChangedFiles(""), []);
  assert.throws(() => parseChangedFiles("M\0src/a.ts"), /Malformed NUL-delimited/u);
  assert.throws(() => parseChangedFiles("R100\0src/a.ts\0"), /missing its old or new path/u);
  assert.throws(() => parseChangedFiles("R\0src/a.ts\0"), /Unsupported Git mutation diff status/u);
  assert.throws(() => parseChangedFiles("T\0src/a.ts\0"), /Unsupported Git mutation diff status/u);
});

test("rejects unsafe Stryker pattern paths", () => {
  assert.equal(validateMutationPatternPath(workspaceSource), workspaceSource);
  for (const file of [
    "/src/absolute.ts",
    "../src/traversal.ts",
    "src/../traversal.ts",
    "src\\windows.ts",
    "src/control\n.ts",
    "src/comma,name.ts",
    "src/colon:name.ts",
    "src/star*.ts",
    "src/question?.ts",
    "src/bracket[name].ts",
    "src/brace{name}.ts",
    "src/bang!name.ts",
    "src/extglob+(name).ts",
    "src/at@name.ts",
    "src/pipe|name.ts",
  ]) {
    assert.throws(() => validateMutationPatternPath(file), /Unsafe Stryker mutation path/u, file);
    assert.throws(() => mutationLineDiffArguments({ baseSha, headSha }, file), /Unsafe Stryker mutation path/u, file);
    assert.throws(() => mutationLineDiffArguments({ baseSha, headSha }, workspaceSource, file), /Unsafe Stryker mutation path/u, file);
  }
});

test("derives and coalesces one-based zero-context new-side line ranges", () => {
  assert.deepEqual(mutationLineDiffArguments({ baseSha, headSha }, workspaceSource), [
    "diff",
    "--unified=0",
    "--no-color",
    "--no-ext-diff",
    `${baseSha}...${headSha}`,
    "--",
    workspaceSource,
  ]);

  const parsed = parseChangedLineDiff(`
@@ -1,0 +3,2 @@ first addition
@@ -8 +10,2 @@ replacement
@@ -12 +12 @@ adjacent replacement
@@ -20,3 +21,0 @@ deletion only
@@ -30 +28 @@ separate replacement
`);
  assert.deepEqual(parsed, {
    ranges: [
      { startLine: 3, endLine: 4 },
      { startLine: 10, endLine: 12 },
      { startLine: 28, endLine: 28 },
    ],
    hasDeletionOnlyHunk: true,
  });
  assert.deepEqual(parseChangedLineRanges("Binary files a/source.ts and b/source.ts differ\n"), []);
  assert.deepEqual(
    coalesceLineRanges([
      { startLine: 8, endLine: 10 },
      { startLine: 3, endLine: 4 },
      { startLine: 5, endLine: 8 },
    ]),
    [{ startLine: 3, endLine: 10 }],
  );
  assert.throws(() => coalesceLineRanges([{ startLine: 0, endLine: 2 }]), /Unsafe mutation line range/u);
  assert.throws(() => parseChangedLineDiff("@@ malformed @@\n"), /Malformed zero-context Git hunk/u);
  assert.throws(() => parseChangedLineDiff("@@ -1 +9007199254740992 @@\n"), /Unsafe Git hunk line value/u);
});

test("verifies both commits before collecting the pull-request status diff", () => {
  const calls = [];
  const runGit = (_repoRoot, arguments_) => {
    calls.push(arguments_);
    return { status: 0, stdout: arguments_[0] === "diff" ? `M\0${workspaceTest}\0` : "" };
  };

  assert.deepEqual(changedMutationFiles(process.cwd(), { baseSha, headSha }, runGit), [{ status: "M", path: workspaceTest }]);
  assert.deepEqual(calls, [
    ["cat-file", "-e", `${baseSha}^{commit}`],
    ["cat-file", "-e", `${headSha}^{commit}`],
    mutationDiffArguments({ baseSha, headSha }),
  ]);
});

test("rejects unavailable or malformed refs before collecting changes", () => {
  assert.throws(
    () =>
      changedMutationFiles(process.cwd(), { baseSha, headSha }, (_repoRoot, arguments_) => ({
        status: arguments_[2]?.startsWith(baseSha) ? 1 : 0,
        stdout: "",
      })),
    /base mutation commit .* is not available/u,
  );

  let gitRuns = 0;
  assert.throws(
    () =>
      changedMutationFiles(process.cwd(), { baseSha: "main", headSha }, () => {
        gitRuns += 1;
        return { status: 0, stdout: "" };
      }),
    /baseSha must be a full/u,
  );
  assert.equal(gitRuns, 0);
});

test("collects line ranges only for production sources changed directly", () => {
  const calls = [];
  const changes = [
    { status: "M", path: workspaceSource },
    { status: "M", path: "src/views/home.test.ts" },
  ];
  const lineRanges = changedMutationLineRanges(process.cwd(), { baseSha, headSha }, changes, (_repoRoot, arguments_) => {
    calls.push(arguments_);
    return { status: 0, stdout: "@@ -6,2 +7,3 @@\n" };
  });

  assert.deepEqual([...lineRanges], [[workspaceSource, { ranges: [{ startLine: 7, endLine: 9 }], fullFile: false }]]);
  assert.deepEqual(calls, [mutationLineDiffArguments({ baseSha, headSha }, workspaceSource)]);
});

test("preserves production rename ancestry when collecting changed-line ranges", () => {
  const previousWorkspaceSource = "src/domain/workspace/legacy-workspace.ts";
  const changes = [
    { status: "R", score: 96, oldPath: previousWorkspaceSource, path: workspaceSource },
    { status: "M", path: "src/views/home.test.ts" },
  ];
  const calls = [];
  const lineRanges = changedMutationLineRanges(process.cwd(), { baseSha, headSha }, changes, (_repoRoot, arguments_) => {
    calls.push(arguments_);
    return { status: 0, stdout: "@@ -2 +2 @@\n" };
  });

  assert.deepEqual([...lineRanges], [[workspaceSource, { ranges: [{ startLine: 2, endLine: 2 }], fullFile: false }]]);
  assert.deepEqual(calls, [
    [
      "diff",
      "--unified=0",
      "--no-color",
      "--no-ext-diff",
      "--find-renames",
      `${baseSha}...${headSha}`,
      "--",
      previousWorkspaceSource,
      workspaceSource,
    ],
  ]);
});

test("promotes an unscopable surviving source to a full-file target", () => {
  for (const output of ["Binary files a/source.ts and b/source.ts differ\n", "@@ -10,3 +9,0 @@\n", "@@ -2 +2 @@\n@@ -10,3 +9,0 @@\n"]) {
    const lineRanges = changedMutationLineRanges(process.cwd(), { baseSha, headSha }, [{ status: "M", path: workspaceSource }], () => ({
      status: 0,
      stdout: output,
    }));
    assert.equal(lineRanges.get(workspaceSource).fullFile, true, output);
  }
});

test("keeps test-mapped sources full while directly changed sources use ranges", () => {
  assert.deepEqual(mutationCiPlan(process.cwd(), [{ status: "M", path: workspaceTest }]), {
    script: "mutation:affected",
    sources: [workspaceSource],
  });
  assert.equal(mutationCiPlan(process.cwd(), [{ status: "M", path: "docs/development.md" }]), null);
  assert.deepEqual(
    mutationCiPlan(
      process.cwd(),
      [
        { status: "M", path: workspaceSource },
        { status: "M", path: workspaceTest },
        { status: "M", path: "src/views/home.test.ts" },
      ],
      new Map([[workspaceSource, { ranges: [{ startLine: 14, endLine: 17 }], fullFile: false }]]),
    ),
    {
      script: "mutation:affected",
      sources: [`${workspaceSource}:14-17`, "src/views/home.ts"],
    },
  );
});

test("routes deleted and renamed colocated tests to surviving full sources", () => {
  assert.deepEqual(mutationCiPlan(process.cwd(), [{ status: "D", path: workspaceTest }]), {
    script: "mutation:affected",
    sources: [workspaceSource],
  });
  assert.deepEqual(
    mutationCiPlan(process.cwd(), [{ status: "R", score: 100, oldPath: "src/views/home.test.ts", path: "src/views/reviews.test.ts" }]),
    {
      script: "mutation:affected",
      sources: ["src/views/home.ts", "src/views/reviews.ts"],
    },
  );
  assert.equal(mutationCiPlan(process.cwd(), [{ status: "D", path: workspaceSource }]), null);
});

test("keeps the configuration canary full and lets it dominate direct ranges", () => {
  assert.equal(mutationCanarySource, "src/views/app-navigation.ts");
  for (const file of [
    ".github/workflows/ci.yml",
    "package.json",
    "package-lock.json",
    "scripts/affected-file-utils.mjs",
    "scripts/run-ci-mutation.mjs",
    "scripts/run-pre-push-quality.mjs",
    "stryker.config.mjs",
    "tsconfig.json",
    "vitest.config.mts",
  ]) {
    assert.equal(affectsMutationCiRouting(file), true, file);
    assert.deepEqual(mutationCiPlan(process.cwd(), [{ status: "M", path: file }]), {
      script: "mutation:affected",
      sources: [mutationCanarySource],
    });
  }
  assert.deepEqual(mutationCiPlan(process.cwd(), [{ status: "D", path: "vitest.config.mts" }]), {
    script: "mutation:affected",
    sources: [mutationCanarySource],
  });
  assert.deepEqual(
    mutationCiPlan(process.cwd(), [{ status: "R", score: 100, oldPath: ".github/workflows/ci.yml", path: "docs/old-ci.md" }]),
    { script: "mutation:affected", sources: [mutationCanarySource] },
  );
  assert.deepEqual(
    mutationCiPlan(
      process.cwd(),
      [
        { status: "M", path: "vitest.config.mts" },
        { status: "M", path: workspaceSource },
        { status: "M", path: mutationCanarySource },
      ],
      new Map([
        [workspaceSource, { ranges: [{ startLine: 4, endLine: 8 }], fullFile: false }],
        [mutationCanarySource, { ranges: [{ startLine: 12, endLine: 13 }], fullFile: false }],
      ]),
    ),
    {
      script: "mutation:affected",
      sources: [`${workspaceSource}:4-8`, mutationCanarySource],
    },
  );
});

test("skips npm when the pull-request mutation scope is empty", () => {
  const messages = [];
  let commandRuns = 0;
  const plan = runCiMutation({
    environment: { MUTATION_BASE_SHA: baseSha, MUTATION_HEAD_SHA: headSha },
    repoRoot: process.cwd(),
    runCommand: () => {
      commandRuns += 1;
    },
    runGit: (_repoRoot, arguments_) => ({
      status: 0,
      stdout: arguments_.includes("--name-status") ? "M\0docs/development.md\0" : "",
    }),
    write: (message) => messages.push(message),
  });

  assert.equal(plan, null);
  assert.equal(commandRuns, 0);
  assert.deepEqual(messages, ["Mutation compatibility check skipped: no affected Stryker inputs."]);
});

test("runs a test-mapped source as a full-file target", () => {
  const commands = [];
  const plan = runCiMutation({
    environment: { MUTATION_BASE_SHA: baseSha, MUTATION_HEAD_SHA: headSha },
    repoRoot: process.cwd(),
    runCommand: (...arguments_) => commands.push(arguments_),
    runGit: (_repoRoot, arguments_) => ({
      status: 0,
      stdout: arguments_.includes("--name-status") ? `M\0${workspaceTest}\0` : "",
    }),
    write: () => undefined,
  });

  assert.deepEqual(plan, { script: "mutation:affected", sources: [workspaceSource] });
  assert.deepEqual(commands, [
    [process.cwd(), "npm", ["run", "mutation:affected", "--", "--dryRunOnly", "--reporters", "progress", "--mutate", workspaceSource]],
  ]);
});

test("runs direct production changes only for changed new-side ranges", () => {
  const commands = [];
  const plan = runCiMutation({
    environment: { MUTATION_BASE_SHA: baseSha, MUTATION_HEAD_SHA: headSha },
    repoRoot: process.cwd(),
    runCommand: (...arguments_) => commands.push(arguments_),
    runGit: (_repoRoot, arguments_) => {
      if (arguments_.includes("--name-status")) return { status: 0, stdout: `M\0${workspaceSource}\0` };
      if (arguments_.includes("--unified=0")) return { status: 0, stdout: "@@ -4,2 +5,2 @@\n@@ -20 +21 @@\n" };
      return { status: 0, stdout: "" };
    },
    write: () => undefined,
  });

  const patterns = [`${workspaceSource}:5-6`, `${workspaceSource}:21-21`];
  assert.deepEqual(plan, { script: "mutation:affected", sources: patterns });
  assert.deepEqual(commands, [
    [process.cwd(), "npm", ["run", "mutation:affected", "--", "--dryRunOnly", "--reporters", "progress", "--mutate", patterns.join(",")]],
  ]);
});

test("promotes a surviving deletion-only source edit but omits a deleted source", () => {
  const commands = [];
  const deletionOnlyPlan = runCiMutation({
    environment: { MUTATION_BASE_SHA: baseSha, MUTATION_HEAD_SHA: headSha },
    repoRoot: process.cwd(),
    runCommand: (...arguments_) => commands.push(arguments_),
    runGit: (_repoRoot, arguments_) => {
      if (arguments_.includes("--name-status")) return { status: 0, stdout: `M\0${workspaceSource}\0` };
      if (arguments_.includes("--unified=0")) return { status: 0, stdout: "@@ -10,3 +9,0 @@\n" };
      return { status: 0, stdout: "" };
    },
    write: () => undefined,
  });
  assert.deepEqual(deletionOnlyPlan, { script: "mutation:affected", sources: [workspaceSource] });

  const deletedPlan = runCiMutation({
    environment: { MUTATION_BASE_SHA: baseSha, MUTATION_HEAD_SHA: headSha },
    repoRoot: process.cwd(),
    runCommand: (...arguments_) => commands.push(arguments_),
    runGit: (_repoRoot, arguments_) => ({
      status: 0,
      stdout: arguments_.includes("--name-status") ? `D\0${workspaceSource}\0` : "",
    }),
    write: () => undefined,
  });
  assert.equal(deletedPlan, null);
  assert.equal(commands.length, 1);
});

test("retains the bounded Stryker and TypeScript-checker contract", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(packageJson.scripts["mutation:affected"], /(?:^|\s)--ignoreStatic(?:\s|$)/u);
  assert.doesNotMatch(packageJson.scripts["mutation:affected"], /dryRunOnly/u);
  assert.match(packageJson.scripts.mutation, /scripts\/run-mutation\.mjs/u);
  assert.equal(packageJson.scripts["mutation:report"], "node ./scripts/report-mutation-results.mjs");
  assert.equal(strykerConfig.thresholds.break, 63);
  assert.deepEqual(strykerConfig.checkers, ["typescript"]);
  assert.equal(strykerConfig.clearTextReporter?.reportTests, false);
  assert.equal(strykerConfig.clearTextReporter?.reportMutants, true);
  assert.equal(strykerConfig.clearTextReporter?.maxTestsToLog, 3);
  assert.deepEqual(strykerConfig.reporters, ["progress", "html", "json"]);
  assert.equal(strykerConfig.jsonReporter?.fileName, "reports/mutation/mutation.json");
  assert.equal(strykerConfig.typescriptChecker?.prioritizePerformanceOverAccuracy, true);
});

test("keeps the GitHub mutation compatibility job bounded to pull-request changes", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const mutationJob = workflow.split("\n  quality-mutation:\n")[1];

  assert.ok(mutationJob, "quality-mutation job must exist");
  assert.match(mutationJob, /if:.*github\.event_name == 'pull_request'/u);
  assert.match(mutationJob, /timeout-minutes: 10/u);
  assert.match(mutationJob, /fetch-depth: 0/u);
  assert.match(mutationJob, /MUTATION_BASE_SHA:.*github\.event\.pull_request\.base\.sha/u);
  assert.match(mutationJob, /MUTATION_HEAD_SHA:.*github\.event\.pull_request\.head\.sha/u);
  assert.match(mutationJob, /name: Run mutation compatibility smoke/u);
  assert.match(mutationJob, /run: npm run mutation:ci/u);
  assert.doesNotMatch(mutationJob, /run: npm run mutation\s*$/mu);
});
