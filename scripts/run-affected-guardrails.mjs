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
runJavaScriptSyntaxCheckWhenNeeded(affectedFiles);
runTypecheckWhenNeeded(affectedFiles);
runWorkerClientGuard(affectedFiles);
runAuditWhenNeeded(affectedFiles);
runTestsWhenNeeded(affectedFiles);

function runPrettier(files) {
  console.log("Checking formatting for affected files...");
  run(repoRoot, "npx", ["prettier", "--check", "--ignore-unknown", ...files]);
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

function affectsTypecheck(file) {
  return (
    /\.(?:ts|tsx|mts|cts)$/.test(file) || ["tsconfig.json", "vitest.config.ts", "playwright.config.ts", "wrangler.jsonc"].includes(file)
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
      !file.endsWith(".e2e.ts"))
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
