import process from "node:process";
import { getAffectedFiles, getRepoRoot, normalizeFiles, run, spawn } from "./affected-file-utils.mjs";

const repoRoot = getRepoRoot();
const affectedFiles = getInputFiles();

if (affectedFiles.length === 0) {
  console.log("Affected tests skipped: no affected files found.");
  process.exit(0);
}

console.log(`Affected tests checking ${affectedFiles.length} file(s).`);

if (affectedFiles.some(affectsTestEnvironment)) {
  console.log("Running unit coverage because affected files include test environment inputs.");
  run(repoRoot, "npm", ["run", "test:coverage"]);
  process.exit(0);
}

const sourceFiles = affectedFiles.filter(isRuntimeSourceFile);
const testFiles = affectedFiles.filter(isUnitTestFile);

if (sourceFiles.length === 0 && testFiles.length === 0) {
  console.log("Affected tests skipped: no affected runtime or unit test files.");
  process.exit(0);
}

if (sourceFiles.length > 0) {
  runRelatedTests(sourceFiles, testFiles.length === 0);
}

if (testFiles.length > 0) {
  console.log("Running affected unit test files...");
  run(repoRoot, "npx", ["vitest", "run", ...testFiles]);
}

function getInputFiles() {
  const cliFiles = process.argv.slice(2).filter((arg) => arg !== "--pre-push");

  if (cliFiles.length > 0) {
    return normalizeFiles(cliFiles);
  }

  return normalizeFiles(getAffectedFiles(repoRoot));
}

function runRelatedTests(files, requireRelatedTests) {
  console.log("Running tests related to affected runtime files...");

  const result = spawn(repoRoot, "npx", ["vitest", "related", "--run", "--no-color", ...files], {
    encoding: "utf8",
    allowFailure: true,
  });

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }

  if (requireRelatedTests && /No test files found/.test(`${result.stdout}\n${result.stderr}`)) {
    console.log("Running unit coverage because no related tests were found for affected runtime files.");
    run(repoRoot, "npm", ["run", "test:coverage"]);
  }
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

function isRuntimeSourceFile(file) {
  return (
    file.startsWith("src/") &&
    /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file) &&
    !file.endsWith(".d.ts") &&
    !file.endsWith(".test.ts") &&
    !file.endsWith(".e2e.ts") &&
    file !== "src/test-support.ts"
  );
}

function isUnitTestFile(file) {
  return file.startsWith("src/") && /\.(?:test\.)?(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file) && file.endsWith(".test.ts");
}
