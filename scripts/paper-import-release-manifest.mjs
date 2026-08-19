import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadataRoot = join(repositoryRoot, "packaging/paper-import");

async function loadCurrentPaperImportRelease() {
  const packageManifestPath = join(metadataRoot, "package.json");
  const packageManifest = await readJson(packageManifestPath);
  if (typeof packageManifest.version !== "string" || !/^\d+\.\d+\.\d+$/u.test(packageManifest.version)) {
    throw new Error(`Paper-import package version must be an exact release version in ${packageManifestPath}`);
  }

  const releaseManifestPath = join(metadataRoot, "releases", `${packageManifest.version}.json`);
  const releaseManifest = await readJson(releaseManifestPath);
  validateReleaseManifest(releaseManifest, releaseManifestPath);
  return { packageManifest, packageManifestPath, releaseManifest, releaseManifestPath };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read JSON release metadata from ${path}`, { cause: error });
  }
}

function validateReleaseManifest(manifest, path) {
  assertReleaseManifest(manifest.schemaVersion === 1, `Unsupported paper-import release manifest schema in ${path}`);
  assertReleaseManifest(manifest.name === "@kirjolab/paper-import", `Unexpected paper-import package name in ${path}`);
  assertReleaseManifest(isExactVersion(manifest.version), `Paper-import release version must be exact in ${path}`);
  assertReleaseManifest(
    manifest.filename === `kirjolab-paper-import-${manifest.version}.tgz`,
    `Paper-import release filename does not match its version in ${path}`,
  );
  assertReleaseManifest(
    hasValidByteCount(manifest.bytes),
    `Paper-import release byte count must be a non-negative safe integer in ${path}`,
  );
  assertReleaseManifest(
    hasExactToolchain(manifest.toolchain),
    `Paper-import release toolchain must name exact Node.js and npm versions in ${path}`,
  );
  assertReleaseManifest(/^[a-f0-9]{64}$/u.test(manifest.sha256), `Paper-import release SHA-256 must be lowercase hexadecimal in ${path}`);
  assertReleaseManifest(
    hasExpectedArtifactUrl(manifest),
    `Paper-import release artifact URL does not match its version and filename in ${path}`,
  );
}

function assertReleaseManifest(condition, message) {
  if (!condition) throw new Error(message);
}

function isExactVersion(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/u.test(value);
}

function hasValidByteCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasExactToolchain(toolchain) {
  return typeof toolchain?.node === "string" && typeof toolchain?.npm === "string";
}

function hasExpectedArtifactUrl(manifest) {
  return (
    manifest.artifactUrl === undefined ||
    manifest.artifactUrl === `https://github.com/bebraw/kirjolab/releases/download/paper-import-v${manifest.version}/${manifest.filename}`
  );
}

export { loadCurrentPaperImportRelease, repositoryRoot };
