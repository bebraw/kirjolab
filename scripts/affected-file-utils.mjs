import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const zeroSha = "0000000000000000000000000000000000000000";

export function getRepoRoot() {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  exitOnSpawnError(result);

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

export function getAffectedFiles(repoRoot, { prePush = process.argv.includes("--pre-push") } = {}) {
  const files = collectPrePushFiles(repoRoot, prePush ? readStdin() : "");

  for (const file of getWorktreeFiles(repoRoot)) {
    files.add(file);
  }

  if (files.size === 0) {
    for (const file of getBranchFiles(repoRoot)) {
      files.add(file);
    }
  }

  return [...files];
}

export function normalizeFiles(files) {
  return [...new Set(files)].filter((file) => existsSync(file)).sort();
}

function readStdin() {
  try {
    return process.stdin.isTTY ? "" : readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

export function run(repoRoot, command, args) {
  const result = spawn(repoRoot, command, args);

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function spawn(repoRoot, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: options.encoding ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: options.encoding,
  });

  exitOnSpawnError(result);

  if (!options.allowFailure && (result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function collectPrePushFiles(repoRoot, input) {
  const files = new Set();

  if (input.trim().length === 0) {
    return files;
  }

  for (const line of input.trim().split("\n")) {
    for (const file of getPrePushLineFiles(repoRoot, line)) {
      files.add(file);
    }
  }

  return files;
}

function getPrePushLineFiles(repoRoot, line) {
  const [, localSha, , remoteSha] = line.trim().split(/\s+/);

  if (!localSha || localSha === zeroSha) {
    return [];
  }

  return remoteSha && remoteSha !== zeroSha
    ? gitFiles(repoRoot, ["diff", "--name-only", "--diff-filter=ACMR", `${remoteSha}..${localSha}`])
    : gitFiles(repoRoot, ["diff-tree", "--no-commit-id", "--name-only", "--diff-filter=ACMR", "-r", localSha]);
}

function getWorktreeFiles(repoRoot) {
  return [
    ...gitFiles(repoRoot, ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]),
    ...gitFiles(repoRoot, ["diff", "--name-only", "--diff-filter=ACMR", "--cached"]),
    ...gitFiles(repoRoot, ["ls-files", "--others", "--exclude-standard"]),
  ];
}

function getBranchFiles(repoRoot) {
  const upstream = spawn(repoRoot, "git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
    encoding: "utf8",
    allowFailure: true,
  });

  if (upstream.status === 0) {
    return gitFiles(repoRoot, ["diff", "--name-only", "--diff-filter=ACMR", `${upstream.stdout.trim()}...HEAD`]);
  }

  const previousCommit = spawn(repoRoot, "git", ["rev-parse", "--verify", "HEAD~1"], {
    encoding: "utf8",
    allowFailure: true,
  });

  if (previousCommit.status === 0) {
    return gitFiles(repoRoot, ["diff", "--name-only", "--diff-filter=ACMR", "HEAD~1..HEAD"]);
  }

  return gitFiles(repoRoot, ["ls-files"]);
}

function gitFiles(repoRoot, args) {
  const result = spawn(repoRoot, "git", args, { encoding: "utf8" });
  return result.stdout
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
}

function exitOnSpawnError(result) {
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
}
