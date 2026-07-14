import process from "node:process";
import { getAffectedFiles, getRepoRoot, normalizeFiles, run } from "./affected-file-utils.mjs";

const repoRoot = getRepoRoot();
const affectedFiles = normalizeFiles(getAffectedFiles(repoRoot));

if (affectedFiles.length === 0) {
  console.log("Affected guardrails skipped: no affected files found.");
  process.exit(0);
}

console.log(`Affected guardrails checking ${affectedFiles.length} file(s).`);

runPrettier(affectedFiles);
runOxlint(affectedFiles);
runJavaScriptSyntaxCheckWhenNeeded(affectedFiles);
runTypecheckWhenNeeded(affectedFiles);
runWorkerClientGuard(affectedFiles);
runAuditWhenNeeded(affectedFiles);
runTestsWhenNeeded(affectedFiles);
runWorkersTestsWhenNeeded(affectedFiles);

function runPrettier(files) {
  console.log("Checking formatting for affected files...");
  run(repoRoot, "npx", ["prettier", "--check", "--ignore-unknown", ...files]);
}

function runOxlint(files) {
  const lintFiles = files.filter((file) => /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/.test(file));

  if (lintFiles.length === 0) {
    console.log("Oxlint skipped: no affected JavaScript or TypeScript files.");
    return;
  }

  console.log("Running Oxlint for affected JavaScript and TypeScript files...");
  run(repoRoot, "npx", ["oxlint", "--max-warnings", "0", ...lintFiles]);
}

function runTypecheckWhenNeeded(files) {
  if (!files.some(affectsTypecheck)) {
    console.log("Typecheck skipped: no affected TypeScript or typed tooling files.");
    return;
  }

  console.log("Running project typecheck for affected typed files...");
  run(repoRoot, "npm", ["run", "typecheck"]);
}

function runJavaScriptSyntaxCheckWhenNeeded(files) {
  const syntaxCheckFiles = files.filter(affectsJavaScriptSyntax);

  if (syntaxCheckFiles.length === 0) {
    console.log("JavaScript syntax check skipped: no affected JavaScript files.");
    return;
  }

  console.log("Running JavaScript syntax checks for affected files...");

  for (const file of syntaxCheckFiles) {
    run(repoRoot, "node", ["--check", file]);
  }
}

function runWorkerClientGuard(files) {
  const guardFiles = files.filter(isWorkerClientGuardFile);

  if (guardFiles.length === 0) {
    console.log("Worker client guard skipped: no affected Worker view files.");
    return;
  }

  console.log("Running Worker client guard for affected Worker view files...");
  run(repoRoot, "npm", ["run", "worker:client-guard", "--", ...guardFiles]);
}

function runAuditWhenNeeded(files) {
  if (!files.some((file) => file === "package.json" || file === "package-lock.json")) {
    console.log("Security audit skipped: package files unchanged.");
    return;
  }

  console.log("Running security audit because package files changed...");
  run(repoRoot, "npm", ["run", "security:audit"]);
}

function runTestsWhenNeeded(files) {
  if (!files.some(affectsUnitCoverage)) {
    console.log("Affected tests skipped: no affected runtime, unit test, or test environment files.");
    return;
  }

  console.log("Running affected tests because affected files include runtime, unit test, or test environment code...");
  run(repoRoot, "npm", ["run", "test:affected", "--", ...files]);
}

function runWorkersTestsWhenNeeded(files) {
  if (!files.some(affectsWorkersTests)) {
    console.log("Workers runtime tests skipped: no affected Durable Object or Workers test inputs.");
    return;
  }

  console.log("Running Workers runtime tests for affected Durable Object or test environment files...");
  run(repoRoot, "npm", ["run", "test:workers"]);
}

function affectsTypecheck(file) {
  return (
    /\.(?:ts|tsx|mts|cts)$/.test(file) ||
    [
      "tsconfig.json",
      "tsconfig.workers-test.json",
      "vitest.config.ts",
      "vitest.workers.config.mts",
      "playwright.config.ts",
      "wrangler.jsonc",
    ].includes(file)
  );
}

function affectsJavaScriptSyntax(file) {
  return /\.(?:js|jsx|mjs|cjs)$/.test(file);
}

function isWorkerClientGuardFile(file) {
  return (
    (file === "src/worker.ts" || file.startsWith("src/views/")) &&
    file.endsWith(".ts") &&
    !file.endsWith(".test.ts") &&
    !file.endsWith(".e2e.ts") &&
    !file.endsWith(".d.ts")
  );
}

function affectsUnitCoverage(file) {
  return (
    affectsTestEnvironment(file) ||
    (file.startsWith("src/") &&
      /\.(?:test\.)?(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file) &&
      !file.endsWith(".d.ts") &&
      !file.endsWith(".e2e.ts") &&
      !file.endsWith(".workers.test.ts"))
  );
}

function affectsWorkersTests(file) {
  return affectsWorkersTestEnvironment(file) || file.endsWith(".workers.test.ts") || isWorkersRuntimeSource(file);
}

function isWorkersRuntimeSource(file) {
  return (
    file.startsWith("src/") &&
    !file.startsWith("src/client/") &&
    !file.startsWith("src/test-support") &&
    /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file) &&
    !file.endsWith(".d.ts") &&
    !file.endsWith(".test.ts") &&
    !file.endsWith(".e2e.ts")
  );
}

function affectsTestEnvironment(file) {
  return [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "vitest.config.ts",
    "scripts/run-coverage-gate.mjs",
    "scripts/run-affected-tests.mjs",
    "scripts/affected-file-utils.mjs",
  ].includes(file);
}

function affectsWorkersTestEnvironment(file) {
  return [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.workers-test.json",
    "vitest.workers.config.mts",
    "worker-configuration.d.ts",
    "wrangler.jsonc",
  ].includes(file);
}
