import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { loadCurrentPaperImportRelease, repositoryRoot } from "./paper-import-release-manifest.mjs";

const execute = promisify(execFile);
const stagingRoot = join(repositoryRoot, ".generated/paper-import-package");
const release = await loadCurrentPaperImportRelease();
const packDestination = parsePackDestination(process.argv.slice(2));
const nodeExecutable = await lifecycleExecutable("npm_node_execpath");
const npmEntrypoint = await lifecycleExecutable("npm_execpath");
const toolchain = await readToolchain(nodeExecutable, npmEntrypoint);

assertToolchain(release.releaseManifest, toolchain, release.releaseManifestPath);
await execute(nodeExecutable, ["./scripts/build-paper-import-package.mjs"], {
  cwd: repositoryRoot,
  maxBuffer: 20 * 1024 * 1024,
});
await mkdir(packDestination, { recursive: true });

const npmCache = await mkdtemp(join(tmpdir(), "kirjolab-paper-import-pack-cache-"));
try {
  const packed = await execute(
    nodeExecutable,
    [npmEntrypoint, "pack", "--ignore-scripts", "--json", "--cache", npmCache, "--pack-destination", packDestination, stagingRoot],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        npm_execpath: npmEntrypoint,
        npm_node_execpath: nodeExecutable,
      },
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  const packResult = parsePackResult(packed.stdout);
  const artifact = await readFile(join(packDestination, packResult.filename));
  if (packResult.size !== artifact.byteLength) {
    throw new Error(`npm reported ${packResult.size} bytes for ${packResult.filename}; read ${artifact.byteLength} bytes`);
  }
  const actualManifest = {
    schemaVersion: 1,
    name: packResult.name,
    version: packResult.version,
    filename: packResult.filename,
    bytes: artifact.byteLength,
    toolchain,
    sha256: createHash("sha256").update(artifact).digest("hex"),
  };
  assertReleaseArtifact(release.releaseManifest, actualManifest, release.releaseManifestPath);
  process.stdout.write(`${JSON.stringify(actualManifest, null, 2)}\n`);
} finally {
  await rm(npmCache, { recursive: true, force: true });
}

function parsePackDestination(arguments_) {
  if (arguments_.length === 0) return stagingRoot;
  if (arguments_.length !== 2 || arguments_[0] !== "--pack-destination" || !arguments_[1]) {
    throw new Error("Usage: npm run paper-import:pack -- [--pack-destination <directory>]");
  }
  return resolve(process.cwd(), arguments_[1]);
}

async function lifecycleExecutable(name) {
  const value = process.env[name];
  if (!value) throw new Error(`paper-import:pack must run through npm so ${name} identifies the exact release toolchain`);
  try {
    return await realpath(value);
  } catch (error) {
    throw new Error(`paper-import:pack could not resolve ${name}: ${value}`, { cause: error });
  }
}

async function readToolchain(nodeExecutable, npmEntrypoint) {
  const [nodeResult, npmResult] = await Promise.all([
    execute(nodeExecutable, ["--version"]),
    execute(nodeExecutable, [npmEntrypoint, "--version"]),
  ]);
  return {
    node: nodeResult.stdout.trim().replace(/^v/u, ""),
    npm: npmResult.stdout.trim(),
  };
}

function assertToolchain(expected, actualToolchain, manifestPath) {
  if (expected.toolchain.node === actualToolchain.node && expected.toolchain.npm === actualToolchain.npm) return;
  throw new Error(
    `Paper-import release toolchain does not match ${manifestPath}\nExpected: ${JSON.stringify(expected.toolchain)}\nActual: ${JSON.stringify(actualToolchain)}`,
  );
}

function parsePackResult(stdout) {
  const results = JSON.parse(stdout);
  if (!Array.isArray(results) || results.length !== 1) throw new Error("npm pack must return exactly one JSON result");
  return results[0];
}

function assertReleaseArtifact(expected, actual, manifestPath) {
  const matches =
    expected.name === actual.name &&
    expected.version === actual.version &&
    expected.filename === actual.filename &&
    expected.bytes === actual.bytes &&
    expected.toolchain.node === actual.toolchain.node &&
    expected.toolchain.npm === actual.toolchain.npm &&
    expected.sha256 === actual.sha256;
  if (matches) return;
  throw new Error(
    `Paper-import release artifact does not match ${manifestPath}\nExpected manifest data:\n${JSON.stringify(expected, null, 2)}\nActual manifest data:\n${JSON.stringify(actual, null, 2)}`,
  );
}
