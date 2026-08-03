import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import strykerConfig from "../stryker.config.mjs";

import {
  affectsMutationCiRouting,
  changedMutationFiles,
  mutationCanarySource,
  mutationCiPlan,
  mutationCiRefs,
  mutationDiffArguments,
  parseChangedPaths,
  runCiMutation,
  validateMutationCommitSha,
} from "./run-ci-mutation.mjs";

const baseSha = "1".repeat(40);
const headSha = "a".repeat(40);

test("requires explicit full commit SHAs", () => {
  assert.deepEqual(mutationCiRefs({ MUTATION_BASE_SHA: baseSha, MUTATION_HEAD_SHA: headSha }), {
    baseSha,
    headSha,
  });
  assert.equal(validateMutationCommitSha("B".repeat(64), "sha"), "B".repeat(64));
  assert.throws(() => mutationCiRefs({ MUTATION_HEAD_SHA: headSha }), /MUTATION_BASE_SHA/u);
  assert.throws(() => mutationCiRefs({ MUTATION_BASE_SHA: "main", MUTATION_HEAD_SHA: headSha }), /40- or 64-character hexadecimal/u);
});

test("derives changed ACMR paths from the pull-request merge base", () => {
  assert.deepEqual(mutationDiffArguments({ baseSha, headSha }), [
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    "-z",
    `${baseSha}...${headSha}`,
    "--",
  ]);
  assert.deepEqual(parseChangedPaths("src/z.ts\0src/a.ts\0src/z.ts\0"), ["src/a.ts", "src/z.ts"]);
});

test("verifies both commits before collecting the pull-request diff", () => {
  const calls = [];
  const runGit = (_repoRoot, arguments_) => {
    calls.push(arguments_);
    return { status: 0, stdout: arguments_[0] === "diff" ? "src/views/app-navigation.test.ts\0" : "" };
  };

  assert.deepEqual(changedMutationFiles(process.cwd(), { baseSha, headSha }, runGit), ["src/views/app-navigation.test.ts"]);
  assert.deepEqual(calls, [
    ["cat-file", "-e", `${baseSha}^{commit}`],
    ["cat-file", "-e", `${headSha}^{commit}`],
    mutationDiffArguments({ baseSha, headSha }),
  ]);
});

test("rejects a commit that is unavailable in the checkout", () => {
  assert.throws(
    () =>
      changedMutationFiles(process.cwd(), { baseSha, headSha }, (_repoRoot, arguments_) => ({
        status: arguments_[2]?.startsWith(baseSha) ? 1 : 0,
        stdout: "",
      })),
    /base mutation commit .* is not available/u,
  );
});

test("rejects malformed refs before invoking Git", () => {
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

test("reuses affected source and test-to-source mutation routing", () => {
  assert.deepEqual(
    mutationCiPlan(process.cwd(), ["src/domain/workspace/workspace.test.ts", "src/api/reviews.workers.test.ts", "docs/development.md"]),
    {
      script: "mutation:affected",
      sources: ["src/domain/workspace/workspace.ts"],
    },
  );
  assert.equal(mutationCiPlan(process.cwd(), ["docs/development.md"]), null);
});

test("adds one stable canary when mutation configuration changes", () => {
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
    assert.deepEqual(mutationCiPlan(process.cwd(), [file]), {
      script: "mutation:affected",
      sources: [mutationCanarySource],
    });
  }
  assert.equal(affectsMutationCiRouting("docs/development.md"), false);
  assert.deepEqual(mutationCiPlan(process.cwd(), ["vitest.config.mts", "src/domain/workspace/workspace.ts"]), {
    script: "mutation:affected",
    sources: ["src/domain/workspace/workspace.ts", mutationCanarySource],
  });
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
    runGit: (_repoRoot, arguments_) => ({ status: 0, stdout: arguments_[0] === "diff" ? "docs/development.md\0" : "" }),
    write: (message) => messages.push(message),
  });

  assert.equal(plan, null);
  assert.equal(commandRuns, 0);
  assert.deepEqual(messages, ["Mutation quality gate skipped: no affected Stryker inputs."]);
});

test("runs the existing affected command with concise reporters and an explicit scope", () => {
  const commands = [];
  const plan = runCiMutation({
    environment: { MUTATION_BASE_SHA: baseSha, MUTATION_HEAD_SHA: headSha },
    repoRoot: process.cwd(),
    runCommand: (...arguments_) => commands.push(arguments_),
    runGit: (_repoRoot, arguments_) => ({
      status: 0,
      stdout: arguments_[0] === "diff" ? "src/domain/workspace/workspace.test.ts\0" : "",
    }),
    write: () => undefined,
  });

  assert.deepEqual(plan, {
    script: "mutation:affected",
    sources: ["src/domain/workspace/workspace.ts"],
  });
  assert.deepEqual(commands, [
    [process.cwd(), "npm", ["run", "mutation:affected", "--", "--reporters", "progress", "--mutate", "src/domain/workspace/workspace.ts"]],
  ]);
});

test("retains the bounded Stryker and TypeScript-checker contract", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(packageJson.scripts["mutation:affected"], /(?:^|\s)--ignoreStatic(?:\s|$)/u);
  assert.deepEqual(strykerConfig.checkers, ["typescript"]);
  assert.equal(strykerConfig.typescriptChecker?.prioritizePerformanceOverAccuracy, true);
});

test("keeps the GitHub mutation job bounded to pull-request changes", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const mutationJob = workflow.split("\n  quality-mutation:\n")[1];

  assert.ok(mutationJob, "quality-mutation job must exist");
  assert.match(mutationJob, /if:.*github\.event_name == 'pull_request'/u);
  assert.match(mutationJob, /timeout-minutes: 30/u);
  assert.match(mutationJob, /fetch-depth: 0/u);
  assert.match(mutationJob, /MUTATION_BASE_SHA:.*github\.event\.pull_request\.base\.sha/u);
  assert.match(mutationJob, /MUTATION_HEAD_SHA:.*github\.event\.pull_request\.head\.sha/u);
  assert.match(mutationJob, /run: npm run mutation:ci/u);
  assert.doesNotMatch(mutationJob, /run: npm run mutation\s*$/mu);
});
