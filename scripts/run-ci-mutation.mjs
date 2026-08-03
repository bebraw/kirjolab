import process from "node:process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { getRepoRoot, run, spawn } from "./affected-file-utils.mjs";
import { affectedMutationSources, isMutationConfigurationFile, mutationCanarySource } from "./run-pre-push-quality.mjs";

export { mutationCanarySource };

export const mutationPrConfigFile = "stryker.pr.config.mjs";
export const mutationPrReportPath = "reports/mutation/pull-request.json";

const fullCommitShaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
const mutationPatternMagicCharacters = ",:*?[]{}!()@+|";
const mutationPrCoverageThreshold = 90;
const mutationPrCoveredScoreThreshold = 68;
const mutationPrStatusFields = new Map([
  ["Killed", "killed"],
  ["Timeout", "timeout"],
  ["Survived", "survived"],
  ["NoCoverage", "noCoverage"],
  ["CompileError", "compileError"],
  ["Ignored", "ignored"],
]);
const rejectedMutationPrStatuses = new Set(["Pending", "RuntimeError"]);
const mutationCiRoutingFiles = new Set([
  ".github/workflows/ci.yml",
  "scripts/affected-file-utils.mjs",
  "scripts/run-ci-mutation.mjs",
  "scripts/run-pre-push-quality.mjs",
  mutationPrConfigFile,
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
  return ["diff", "--name-status", "--diff-filter=ACMRD", "-z", `${baseSha}...${headSha}`, "--"];
}

export function mutationLineDiffArguments({ baseSha, headSha }, file, previousFile) {
  validateMutationCommitSha(baseSha, "baseSha");
  validateMutationCommitSha(headSha, "headSha");
  validateMutationPatternPath(file);
  if (previousFile === undefined) {
    return ["diff", "--unified=0", "--no-color", "--no-ext-diff", `${baseSha}...${headSha}`, "--", file];
  }

  validateMutationPatternPath(previousFile);
  return ["diff", "--unified=0", "--no-color", "--no-ext-diff", "--find-renames", `${baseSha}...${headSha}`, "--", previousFile, file];
}

export function validateMutationPatternPath(file) {
  const hasUnsafeSyntax =
    typeof file !== "string" ||
    file.length === 0 ||
    file.startsWith("/") ||
    file.includes("\\") ||
    /\p{Cc}/u.test(file) ||
    [...file].some((character) => mutationPatternMagicCharacters.includes(character)) ||
    file.split("/").some((part) => part === "" || part === "." || part === "..");
  if (hasUnsafeSyntax) throw new Error(`Unsafe Stryker mutation path: ${JSON.stringify(file)}`);
  return file;
}

function requiredGitStatusPath(iterator, statusToken) {
  const result = iterator.next();
  if (result.done || result.value.length === 0) throw new Error(`Git ${statusToken} status is missing its old or new path.`);
  return result.value;
}

function parseGitStatusChange(statusToken, fields) {
  if (/^[AMD]$/u.test(statusToken)) {
    return { status: statusToken, path: requiredGitStatusPath(fields, statusToken) };
  }

  const similarityMatch = /^([CR])(\d{1,3})$/u.exec(statusToken);
  if (!similarityMatch || Number.parseInt(similarityMatch[2], 10) > 100) {
    throw new Error(`Unsupported Git mutation diff status: ${JSON.stringify(statusToken)}`);
  }
  return {
    status: similarityMatch[1],
    score: Number.parseInt(similarityMatch[2], 10),
    oldPath: requiredGitStatusPath(fields, statusToken),
    path: requiredGitStatusPath(fields, statusToken),
  };
}

export function parseChangedFiles(output) {
  if (output === "") return [];
  if (!output.endsWith("\0")) throw new Error("Malformed NUL-delimited Git name-status output.");

  const fields = output.slice(0, -1).split("\0")[Symbol.iterator]();
  const changes = [];
  for (let status = fields.next(); !status.done; status = fields.next()) {
    changes.push(parseGitStatusChange(status.value, fields));
  }
  return changes;
}

export function coalesceLineRanges(ranges) {
  for (const { startLine, endLine } of ranges) {
    if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine <= 0 || endLine < startLine) {
      throw new Error("Unsafe mutation line range.");
    }
  }
  const sortedRanges = [...ranges].sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
  const result = [];

  for (const range of sortedRanges) {
    const previous = result.at(-1);
    if (previous && range.startLine <= previous.endLine + 1) {
      previous.endLine = Math.max(previous.endLine, range.endLine);
    } else {
      result.push({ ...range });
    }
  }

  return result;
}

function parseHunkValue(value, fallback = 1) {
  const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Unsafe Git hunk line value.");
  return parsed;
}

function assertValidHunkPosition(startLine, lineCount) {
  if (lineCount > 0 && startLine === 0) throw new Error("Invalid Git hunk line range.");
  const endLine = startLine + Math.max(lineCount - 1, 0);
  if (!Number.isSafeInteger(endLine)) throw new Error("Unsafe Git hunk line value.");
}

function parseHunkHeader(line) {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/u.exec(line);
  if (!match) throw new Error(`Malformed zero-context Git hunk header: ${JSON.stringify(line)}`);

  const oldStart = parseHunkValue(match[1]);
  const oldCount = parseHunkValue(match[2]);
  const startLine = parseHunkValue(match[3]);
  const lineCount = parseHunkValue(match[4]);
  assertValidHunkPosition(oldStart, oldCount);
  assertValidHunkPosition(startLine, lineCount);
  if (oldCount === 0 && lineCount === 0) throw new Error("Invalid Git hunk line range.");
  return { startLine, lineCount };
}

export function parseChangedLineDiff(output) {
  const ranges = [];
  let hasDeletionOnlyHunk = false;

  for (const rawLine of output.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith("@@")) continue;
    const { startLine, lineCount } = parseHunkHeader(line);
    if (lineCount === 0) {
      hasDeletionOnlyHunk = true;
      continue;
    }
    ranges.push({ startLine, endLine: startLine + lineCount - 1 });
  }

  return { ranges: coalesceLineRanges(ranges), hasDeletionOnlyHunk };
}

export function parseChangedLineRanges(output) {
  return parseChangedLineDiff(output).ranges;
}

export function affectsMutationCiRouting(file) {
  return mutationCiRoutingFiles.has(file) || isMutationConfigurationFile(file);
}

export function mutationAffectedPaths(changes) {
  return changes.flatMap((change) => {
    if (change.status === "R") return [change.oldPath, change.path];
    return [change.path];
  });
}

export function mutationSourceInputPaths(changes) {
  return changes.flatMap((change) => {
    if (change.status === "D") return change.path.endsWith(".test.ts") ? [change.path] : [];
    if (change.status === "R" && change.oldPath.endsWith(".test.ts")) return [change.oldPath, change.path];
    return [change.path];
  });
}

export function directlyChangedMutationSources(repoRoot, changes) {
  const survivingChangedPaths = changes.filter((change) => change.status !== "D").map((change) => change.path);
  const survivingPathSet = new Set(survivingChangedPaths);
  return affectedMutationSources(repoRoot, survivingChangedPaths).filter((source) => survivingPathSet.has(source));
}

export function mutationCiPlan(repoRoot, changes, changedLineRanges = new Map()) {
  const affectedPaths = mutationAffectedPaths(changes);
  const routesThroughCanary = affectedPaths.some(affectsMutationCiRouting);
  const sourceInputs = mutationSourceInputPaths(changes);
  const inputs = routesThroughCanary ? [...sourceInputs, mutationCanarySource] : sourceInputs;
  const sources = affectedMutationSources(repoRoot, inputs);
  const directlyChangedSources = new Set(directlyChangedMutationSources(repoRoot, changes));
  const mutationPatterns = sources.flatMap((source) => {
    validateMutationPatternPath(source);
    if (!directlyChangedSources.has(source) || (routesThroughCanary && source === mutationCanarySource)) return [source];

    const lineSelection = changedLineRanges.get(source);
    if (!lineSelection || lineSelection.fullFile || lineSelection.ranges.length === 0) return [source];
    return coalesceLineRanges(lineSelection.ranges).map(({ startLine, endLine }) => `${source}:${startLine}-${endLine}`);
  });
  return mutationPatterns.length > 0 ? { script: "mutation:affected", sources: mutationPatterns } : null;
}

export function mutationPrCommandArguments(plan) {
  if (!Array.isArray(plan.sources) || plan.sources.length === 0)
    throw new Error("PR mutation command requires an explicit mutation scope.");
  return ["run", plan.script, "--", mutationPrConfigFile, "--reporters", "progress,json", "--mutate", plan.sources.join(",")];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mutationPrReportMutants(report) {
  if (!isRecord(report) || !isRecord(report.files)) throw new Error("Malformed PR mutation report: expected a files object.");
  return Object.entries(report.files).flatMap(([file, fileResult]) => {
    if (!isRecord(fileResult) || !Array.isArray(fileResult.mutants)) {
      throw new Error(`Malformed PR mutation report entry for ${JSON.stringify(file)}.`);
    }
    return fileResult.mutants;
  });
}

function mutationPrStatusField(mutant, index) {
  if (!isRecord(mutant) || typeof mutant.status !== "string") {
    throw new Error(`Malformed PR mutation result at index ${index}.`);
  }
  if (rejectedMutationPrStatuses.has(mutant.status)) throw new Error(`Incomplete PR mutation result status: ${mutant.status}.`);
  const field = mutationPrStatusFields.get(mutant.status);
  if (!field) throw new Error(`Unknown PR mutation result status: ${JSON.stringify(mutant.status)}.`);
  return field;
}

export function countMutationPrResults(report) {
  const counts = { killed: 0, timeout: 0, survived: 0, noCoverage: 0, compileError: 0, ignored: 0 };
  for (const [index, mutant] of mutationPrReportMutants(report).entries()) {
    const field = mutationPrStatusField(mutant, index);
    counts[field] += 1;
  }
  return counts;
}

function meetsPercentThreshold(numerator, denominator, threshold) {
  return BigInt(numerator) * 100n >= BigInt(denominator) * BigInt(threshold);
}

export function evaluateMutationPrReport(report) {
  const counts = countMutationPrResults(report);
  const detected = counts.killed + counts.timeout;
  const covered = detected + counts.survived;
  const valid = covered + counts.noCoverage;
  if (valid === 0) {
    return { passed: true, coveragePassed: true, coveredScorePassed: true, detected, covered, valid, counts };
  }

  const coveragePassed = meetsPercentThreshold(covered, valid, mutationPrCoverageThreshold);
  const coveredScorePassed = covered > 0 && meetsPercentThreshold(detected, covered, mutationPrCoveredScoreThreshold);
  return { passed: coveragePassed && coveredScorePassed, coveragePassed, coveredScorePassed, detected, covered, valid, counts };
}

function formatMutationPercent(numerator, denominator) {
  return denominator === 0 ? "n/a" : `${((numerator * 100) / denominator).toFixed(2)}%`;
}

export function formatMutationPrResult(result) {
  const { counts } = result;
  return [
    "PR mutation result:",
    `valid=${result.valid}`,
    `killed=${counts.killed}`,
    `timeout=${counts.timeout}`,
    `survived=${counts.survived}`,
    `noCoverage=${counts.noCoverage}`,
    `compileError=${counts.compileError}`,
    `ignored=${counts.ignored}`,
    `coverage=${formatMutationPercent(result.covered, result.valid)}`,
    `covered-score=${formatMutationPercent(result.detected, result.covered)}`,
  ].join(" ");
}

export function assertMutationPrReport(report, write = console.log) {
  const result = evaluateMutationPrReport(report);
  write(formatMutationPrResult(result));
  if (!result.passed) {
    const failures = [];
    if (!result.coveragePassed) failures.push(`coverage must be at least ${mutationPrCoverageThreshold}%`);
    if (!result.coveredScorePassed) failures.push(`covered score must be at least ${mutationPrCoveredScoreThreshold}%`);
    throw new Error(`PR mutation result gate failed: ${failures.join(" and ")}.`);
  }
  return result;
}

export function removeMutationPrReport(repoRoot) {
  rmSync(join(repoRoot, mutationPrReportPath), { force: true });
}

export function readMutationPrReport(repoRoot) {
  const reportPath = join(repoRoot, mutationPrReportPath);
  let source;
  try {
    source = readFileSync(reportPath, "utf8");
  } catch (cause) {
    throw new Error(`PR mutation report is missing or unreadable at ${mutationPrReportPath}.`, { cause });
  }
  try {
    return JSON.parse(source);
  } catch (cause) {
    throw new Error(`PR mutation report contains malformed JSON at ${mutationPrReportPath}.`, { cause });
  }
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
  return parseChangedFiles(result.stdout);
}

export function changedMutationLineRanges(repoRoot, refs, changes, runGit = git) {
  const directlyChangedSources = directlyChangedMutationSources(repoRoot, changes);
  const changesByPath = new Map(changes.map((change) => [change.path, change]));
  return new Map(
    directlyChangedSources.map((source) => {
      const change = changesByPath.get(source);
      const previousSource = change?.status === "R" ? change.oldPath : undefined;
      const result = runGit(repoRoot, mutationLineDiffArguments(refs, source, previousSource));
      const { ranges, hasDeletionOnlyHunk } = parseChangedLineDiff(result.stdout);
      return [source, { ranges, fullFile: hasDeletionOnlyHunk || ranges.length === 0 }];
    }),
  );
}

export function runCiMutation({
  environment = process.env,
  readReport = readMutationPrReport,
  removeReport = removeMutationPrReport,
  repoRoot = getRepoRoot(),
  runCommand = run,
  runGit = git,
  write = console.log,
} = {}) {
  const refs = mutationCiRefs(environment);
  const changes = changedMutationFiles(repoRoot, refs, runGit);
  const changedLineRanges = changedMutationLineRanges(repoRoot, refs, changes, runGit);
  const plan = mutationCiPlan(repoRoot, changes, changedLineRanges);

  if (!plan) {
    write("Mutation quality gate skipped: no affected Stryker inputs.");
    return null;
  }

  write(`Running mutation tests for ${plan.sources.length} pull-request mutation target(s)...`);
  removeReport(repoRoot);
  runCommand(repoRoot, "npm", mutationPrCommandArguments(plan));
  assertMutationPrReport(readReport(repoRoot), write);
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
