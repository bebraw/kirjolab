import process from "node:process";
import { pathToFileURL } from "node:url";

import { getRepoRoot, run, spawn } from "./affected-file-utils.mjs";
import {
  affectedMutationSources,
  isMutationConfigurationFile,
  mutationCanarySource,
  mutationCommandArguments,
} from "./run-pre-push-quality.mjs";

export { mutationCanarySource };

const fullCommitShaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
const mutationCiRoutingFiles = new Set([
  ".github/workflows/ci.yml",
  "scripts/affected-file-utils.mjs",
  "scripts/run-ci-mutation.mjs",
  "scripts/run-pre-push-quality.mjs",
]);

export function validateMutationCommitSha(value, variableName) {
  if (!value || !fullCommitShaPattern.test(value)) {
    throw new Error(`${variableName} must be a full 40- or 64-character hexadecimal commit SHA.`);
  }
  return value;
}

export function mutationCiRefs(environment = process.env) {
  return {
    baseSha: validateMutationCommitSha(environment.MUTATION_BASE_SHA, "MUTATION_BASE_SHA"),
    headSha: validateMutationCommitSha(environment.MUTATION_HEAD_SHA, "MUTATION_HEAD_SHA"),
  };
}

export function mutationDiffArguments({ baseSha, headSha }) {
  validateMutationCommitSha(baseSha, "baseSha");
  validateMutationCommitSha(headSha, "headSha");
  return ["diff", "--name-only", "--diff-filter=ACMR", "-z", `${baseSha}...${headSha}`, "--"];
}

export function parseChangedPaths(output) {
  return [...new Set(output.split("\0").filter(Boolean))].sort();
}

export function affectsMutationCiRouting(file) {
  return mutationCiRoutingFiles.has(file) || isMutationConfigurationFile(file);
}

export function mutationCiPlan(repoRoot, changedFiles) {
  const inputs = changedFiles.some(affectsMutationCiRouting) ? [...changedFiles, mutationCanarySource] : changedFiles;
  const sources = affectedMutationSources(repoRoot, inputs);
  return sources.length > 0 ? { script: "mutation:affected", sources } : null;
}

function git(repoRoot, arguments_, options = {}) {
  return spawn(repoRoot, "git", arguments_, { ...options, encoding: "utf8" });
}

export function changedMutationFiles(repoRoot, refs, runGit = git) {
  const diffArguments = mutationDiffArguments(refs);
  for (const [label, sha] of [
    ["base", refs.baseSha],
    ["head", refs.headSha],
  ]) {
    const result = runGit(repoRoot, ["cat-file", "-e", `${sha}^{commit}`], { allowFailure: true });
    if ((result.status ?? 1) !== 0) {
      throw new Error(`The ${label} mutation commit ${sha} is not available in this checkout.`);
    }
  }

  const result = runGit(repoRoot, diffArguments);
  return parseChangedPaths(result.stdout);
}

export function runCiMutation({
  environment = process.env,
  repoRoot = getRepoRoot(),
  runCommand = run,
  runGit = git,
  write = console.log,
} = {}) {
  const refs = mutationCiRefs(environment);
  const changedFiles = changedMutationFiles(repoRoot, refs, runGit);
  const plan = mutationCiPlan(repoRoot, changedFiles);

  if (!plan) {
    write("Mutation quality gate skipped: no affected Stryker inputs.");
    return null;
  }

  write(`Running mutation tests for ${plan.sources.length} pull-request source file(s)...`);
  runCommand(repoRoot, "npm", mutationCommandArguments(plan));
  return plan;
}

function main() {
  try {
    runCiMutation();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
