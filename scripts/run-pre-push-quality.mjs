import process from "node:process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getAffectedFiles, getRepoRoot, normalizeFiles, run } from "./affected-file-utils.mjs";

const mutationConfigurationFiles = new Set([
  "package.json",
  "package-lock.json",
  "stryker.config.mjs",
  "tsconfig.json",
  "vitest.config.ts",
]);
const mutationSourcePattern =
  /^src\/(?!api\/|durable-objects\/|test-support(?:\.ts$|\/))(?!.*(?:\.d|\.test|\.e2e|\.workers\.test)\.ts$).*\.ts$/u;
const excludedMutationSources = new Set([
  "src/client/app.ts",
  "src/client/markdown-runtime.ts",
  "src/client/pdf-viewer.ts",
  "src/client/pdfjs-runtime.ts",
  "src/client/review-study.ts",
  "src/client/service-worker.ts",
]);

export function affectsFallow(file) {
  return (
    /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/.test(file) ||
    file === ".fallowrc.json" ||
    file === "package.json" ||
    file === "package-lock.json"
  );
}

export function isMutationSource(file) {
  return mutationSourcePattern.test(file) && !excludedMutationSources.has(file);
}

export function affectedMutationSources(repoRoot, files) {
  const sources = new Set(files.filter((file) => isMutationSource(file) && existsSync(join(repoRoot, file))));
  for (const file of files) {
    if (!file.endsWith(".test.ts") || file.endsWith(".workers.test.ts")) continue;
    const source = file.replace(/\.test\.ts$/u, ".ts");
    if (isMutationSource(source) && existsSync(join(repoRoot, source))) sources.add(source);
  }
  return [...sources].sort();
}

export function mutationPlan(repoRoot, files) {
  if (files.some((file) => mutationConfigurationFiles.has(file))) {
    return { script: "mutation:incremental:refresh", sources: [] };
  }
  const sources = affectedMutationSources(repoRoot, files);
  return sources.length > 0 ? { script: "mutation:affected", sources } : null;
}

function runPrePushQuality(repoRoot, affectedFiles) {
  if (affectedFiles.some(affectsFallow)) {
    console.log("Running Fallow codebase diagnostics before push...");
    run(repoRoot, "npm", ["run", "diagnostics:codebase"]);
  } else {
    console.log("Fallow diagnostics skipped: no affected codebase inputs.");
  }

  const plan = mutationPlan(repoRoot, affectedFiles);
  if (plan?.script === "mutation:incremental:refresh") {
    console.log("Refreshing incremental mutation results because mutation configuration changed...");
    run(repoRoot, "npm", ["run", plan.script]);
  } else if (plan) {
    console.log(`Running mutation tests for ${plan.sources.length} affected source file(s) before push...`);
    run(repoRoot, "npm", ["run", plan.script, "--", "--mutate", plan.sources.join(",")]);
  } else {
    console.log("Incremental mutation tests skipped: no affected Stryker inputs.");
  }
}

function main() {
  const repoRoot = getRepoRoot();
  const affectedFiles = normalizeFiles(getAffectedFiles(repoRoot));
  if (affectedFiles.length === 0) {
    console.log("Pre-push deep checks skipped: no affected files found.");
    return;
  }
  runPrePushQuality(repoRoot, affectedFiles);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
