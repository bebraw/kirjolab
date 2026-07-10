import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const sourceFiles = collectFiles("src", isRuntimeSourceFile);
const testFiles = collectFiles("src", isUnitTestFile);

if (sourceFiles.length === 0) {
  console.log("Coverage gate skipped: no source files found under src/.");
  process.exit(0);
}

if (testFiles.length === 0) {
  console.error("Coverage gate failed: src/ contains source files, but no unit test files were found under src/.");
  console.error("Add unit tests and rerun `npm run test:coverage`.");
  process.exit(1);
}

const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vitest", "run", "--coverage", "--passWithNoTests"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

function collectFiles(root, predicate) {
  try {
    return walk(root).filter(predicate);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function walk(root) {
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (entry.isFile() || statSync(fullPath).isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function isRuntimeSourceFile(path) {
  return (
    sourceExtensions.has(extname(path)) &&
    !path.endsWith(".d.ts") &&
    !isTestSupportFile(path) &&
    !isUnitTestFile(path) &&
    !isEndToEndTestFile(path)
  );
}

function isUnitTestFile(path) {
  return /\.(test)\.[cm]?[jt]sx?$/.test(path);
}

function isEndToEndTestFile(path) {
  return /\.(e2e)\.[cm]?[jt]sx?$/.test(path);
}

function isTestSupportFile(path) {
  return /(^|\/)test-support\.[cm]?[jt]sx?$/.test(path);
}
