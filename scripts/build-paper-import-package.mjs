import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadCurrentPaperImportRelease } from "./paper-import-release-manifest.mjs";

const execute = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "src/lib/paper-import");
const metadataRoot = join(repositoryRoot, "packaging/paper-import");
const stagingRoot = join(repositoryRoot, ".generated/paper-import-package");
const metadataFiles = ["CHANGELOG.md", "README.md", "SECURITY.md", "package.json"];
const allowedBareImports = new Set(["fflate"]);
const release = await loadCurrentPaperImportRelease();

validatePackageMetadata(release.packageManifest, release.releaseManifest);
await validateSourceBoundary();
await rm(stagingRoot, { recursive: true, force: true });
await mkdir(stagingRoot, { recursive: true });
await execute(process.execPath, ["./scripts/run-typescript-7.mjs", "-p", "tsconfig.paper-import-package.json"], {
  cwd: repositoryRoot,
});
await Promise.all(metadataFiles.map((path) => cp(join(metadataRoot, path), join(stagingRoot, path))));
await cp(join(repositoryRoot, "LICENSE"), join(stagingRoot, "LICENSE"));
await validateEmittedPackage();

function validatePackageMetadata(manifest, releaseManifest) {
  const identityMessage = `Paper-import package identity must remain private ${releaseManifest.name}@${releaseManifest.version}`;
  assertPackageMetadata(manifest.name === releaseManifest.name, identityMessage);
  assertPackageMetadata(manifest.version === releaseManifest.version, identityMessage);
  assertPackageMetadata(manifest.private === true, identityMessage);
  const runtimeMessage = `Paper-import package must remain ESM on the release Node ${releaseManifest.toolchain.node} runtime`;
  assertPackageMetadata(manifest.type === "module", runtimeMessage);
  assertPackageMetadata(manifest.engines?.node === releaseManifest.toolchain.node, runtimeMessage);
  const currentNode = process.version.replace(/^v/u, "");
  assertPackageMetadata(
    currentNode === releaseManifest.toolchain.node,
    `Paper-import package build requires Node ${releaseManifest.toolchain.node}; received ${currentNode}`,
  );
  assertPackageMetadata(
    JSON.stringify(manifest.dependencies) === JSON.stringify({ fflate: "0.8.3" }),
    "fflate@0.8.3 must remain the only paper-import runtime dependency",
  );
  const expectedExports = { ".": "./dist/index.js", "./conformance": "./dist/conformance.js" };
  assertPackageMetadata(
    JSON.stringify(manifest.exports) === JSON.stringify(expectedExports),
    "Paper-import package exports must remain limited to . and ./conformance",
  );
}

function assertPackageMetadata(condition, message) {
  if (!condition) throw new Error(message);
}

async function validateSourceBoundary() {
  const sourceFiles = (await readdir(sourceRoot)).filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts")).sort(compareText);
  const sourceFileSet = new Set(sourceFiles);
  const violationGroups = await Promise.all(sourceFiles.map(async (path) => await sourceFileBoundaryViolations(path, sourceFileSet)));
  const violations = violationGroups.flat();
  const mainEntry = await readFile(join(sourceRoot, "index.ts"), "utf8");
  if (mainEntry.includes("conformance")) violations.push("index.ts: conformance must stay outside the main entry");
  if (violations.length > 0) throw new Error(`Paper-import source boundary violations:\n${violations.join("\n")}`);
}

async function sourceFileBoundaryViolations(path, sourceFileSet) {
  const source = await readFile(join(sourceRoot, path), "utf8");
  const targets = [...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/gu)].map((match) => match[1] ?? "");
  return targets.flatMap((target) => importBoundaryViolations(path, target, sourceFileSet));
}

function importBoundaryViolations(path, target, sourceFileSet) {
  if (!target.startsWith(".")) return allowedBareImports.has(target) ? [] : [`${path}: forbidden package import: ${target}`];
  const violations = [];
  if (!target.endsWith(".js")) violations.push(`${path}: relative import lacks .js suffix: ${target}`);
  const resolvedTarget = resolve(dirname(join(sourceRoot, path)), target);
  const relativeTarget = relative(sourceRoot, resolvedTarget);
  if (relativeTarget === ".." || relativeTarget.startsWith("../")) {
    violations.push(`${path}: relative import leaves the paper-import boundary: ${target}`);
  } else if (target.endsWith(".js") && !sourceFileSet.has(relativeTarget.replace(/\.js$/u, ".ts"))) {
    violations.push(`${path}: relative import has no production source: ${target}`);
  }
  return violations;
}

async function validateEmittedPackage() {
  const entries = await recursivelyListFiles(join(stagingRoot, "dist"));
  if (!entries.includes("index.js") || !entries.includes("index.d.ts")) {
    throw new Error("Paper-import build did not emit the main JavaScript and declaration entrypoints");
  }
  if (!entries.includes("conformance.js") || !entries.includes("conformance.d.ts")) {
    throw new Error("Paper-import build did not emit the conformance JavaScript and declaration entrypoints");
  }
  const emittedMain = await readFile(join(stagingRoot, "dist/index.js"), "utf8");
  if (/\brequire\s*\(/u.test(emittedMain) || emittedMain.includes("conformance")) {
    throw new Error("Paper-import main entry must remain ESM and exclude conformance fixtures");
  }
}

async function recursivelyListFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) paths.push(...(await recursivelyListFiles(join(directory, entry.name), path)));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export { repositoryRoot, stagingRoot };
