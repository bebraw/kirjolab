import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = join(repositoryRoot, ".generated/paper-import-package");
const typescriptEntrypoint = join(repositoryRoot, "node_modules/typescript-7/bin/tsc");
const expectedPackedPaths = [
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "dist/conformance-corpus.d.ts",
  "dist/conformance-corpus.js",
  "dist/conformance.d.ts",
  "dist/conformance.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/latex-analysis.d.ts",
  "dist/latex-analysis.js",
  "dist/latex-archive.d.ts",
  "dist/latex-archive.js",
  "dist/latex-contracts.d.ts",
  "dist/latex-contracts.js",
  "dist/latex-conversion.d.ts",
  "dist/latex-conversion.js",
  "dist/latex-images.d.ts",
  "dist/latex-images.js",
  "dist/latex-preview-identity.d.ts",
  "dist/latex-preview-identity.js",
  "dist/latex-render-helpers.d.ts",
  "dist/latex-render-helpers.js",
  "dist/latex-render-limits.d.ts",
  "dist/latex-render-limits.js",
  "dist/latex-renderer.d.ts",
  "dist/latex-renderer.js",
  "dist/latex-semantic-limit.d.ts",
  "dist/latex-semantic-limit.js",
  "dist/latex-source.d.ts",
  "dist/latex-source.js",
  "dist/pdf-text.d.ts",
  "dist/pdf-text.js",
  "dist/portable-path.d.ts",
  "dist/portable-path.js",
  "dist/sha256.d.ts",
  "dist/sha256.js",
  "package.json",
];

test("resolves libc-qualified native canvas package names", () => {
  assert.equal(
    canvasNativePackageName(["canvas", "canvas-linux-x64-gnu", "wasm-runtime"], "linux", "x64"),
    "@napi-rs/canvas-linux-x64-gnu",
  );
  assert.equal(canvasNativePackageName(["canvas-linux-x64-musl"], "linux", "x64"), "@napi-rs/canvas-linux-x64-musl");
  assert.equal(canvasNativePackageName(["canvas-darwin-arm64"], "darwin", "arm64"), "@napi-rs/canvas-darwin-arm64");
  assert.throws(
    () => canvasNativePackageName(["canvas-linux-x64-gnu", "canvas-linux-x64-musl"], "linux", "x64"),
    /Expected one installed native canvas package for linux-x64, found 2/u,
  );
});

test("packs a reproducible private paper-import package for an isolated Node 24 consumer", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "kirjolab-paper-import-package-"));
  try {
    const rootManifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
    const nodeExecutable = await findExactNode(rootManifest.engines.node);
    const npmEntrypoint = await realpath(join(dirname(nodeExecutable), "npm"));
    const npmCache = join(temporaryRoot, "npm-cache");
    const firstPackDirectory = join(temporaryRoot, "pack-one");
    const secondPackDirectory = join(temporaryRoot, "pack-two");
    await Promise.all([mkdir(firstPackDirectory), mkdir(secondPackDirectory), mkdir(npmCache)]);

    await runBuild(nodeExecutable);
    const firstBuild = await contentSnapshot(stagingRoot);
    await runBuild(nodeExecutable);
    const secondBuild = await contentSnapshot(stagingRoot);
    assert.deepEqual(secondBuild, firstBuild, "repeated package builds must emit byte-identical staged contents");

    const dryRun = await runNpm(nodeExecutable, npmEntrypoint, npmCache, ["pack", "--ignore-scripts", "--dry-run", "--json", stagingRoot]);
    const dryRunResult = parsePackResult(dryRun.stdout);
    assert.equal(dryRunResult.id, "@kirjolab/paper-import@0.1.1");
    assert.equal(dryRunResult.entryCount, expectedPackedPaths.length);
    assert.deepEqual(
      dryRunResult.files.map((file) => file.path),
      expectedPackedPaths,
      "npm pack contents must match the reviewed allowlist",
    );
    assert.deepEqual(dryRunResult.bundled, []);

    const firstPack = parsePackResult(
      (
        await runNpm(nodeExecutable, npmEntrypoint, npmCache, [
          "pack",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          firstPackDirectory,
          stagingRoot,
        ])
      ).stdout,
    );
    const secondPack = parsePackResult(
      (
        await runNpm(nodeExecutable, npmEntrypoint, npmCache, [
          "pack",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          secondPackDirectory,
          stagingRoot,
        ])
      ).stdout,
    );
    const firstTarball = join(firstPackDirectory, firstPack.filename);
    const secondTarball = join(secondPackDirectory, secondPack.filename);
    assert.deepEqual(await readFile(secondTarball), await readFile(firstTarball), "repeated npm packs must be byte-identical");

    await verifyIsolatedConsumer({
      nodeExecutable,
      npmEntrypoint,
      npmCache,
      paperImportTarball: firstTarball,
      temporaryRoot,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function verifyIsolatedConsumer({ nodeExecutable, npmEntrypoint, npmCache, paperImportTarball, temporaryRoot }) {
  const consumerRoot = join(temporaryRoot, "consumer");
  const dependencyPacks = join(temporaryRoot, "dependency-packs");
  await Promise.all([mkdir(consumerRoot), mkdir(dependencyPacks)]);
  await writeFile(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({ name: "paper-import-isolated-consumer", private: true, type: "module" }, null, 2)}\n`,
  );

  const runtimePackages = ["fflate", "pdfjs-dist", "@napi-rs/canvas", await installedNativeCanvasPackageName()];
  const runtimeTarballs = [];
  for (const packageName of runtimePackages) {
    const packed = parsePackResult(
      (
        await runNpm(nodeExecutable, npmEntrypoint, npmCache, [
          "pack",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          dependencyPacks,
          join(repositoryRoot, "node_modules", packageName),
        ])
      ).stdout,
    );
    runtimeTarballs.push(join(dependencyPacks, packed.filename));
  }
  await runNpm(
    nodeExecutable,
    npmEntrypoint,
    npmCache,
    [
      "install",
      "--engine-strict",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--omit=optional",
      "--offline",
      "--package-lock=false",
      paperImportTarball,
      ...runtimeTarballs,
    ],
    consumerRoot,
  );
  const consumerManifest = JSON.parse(await readFile(join(consumerRoot, "package.json"), "utf8"));
  assert.equal(typeof consumerManifest.dependencies?.["pdfjs-dist"], "string");
  const canonicalConsumerRoot = await realpath(consumerRoot);
  const installedPdfRoot = await realpath(join(consumerRoot, "node_modules/pdfjs-dist"));
  assert.equal(relative(canonicalConsumerRoot, installedPdfRoot).startsWith(".."), false, "PDF.js must be owned by the isolated consumer");
  const installedPdfManifest = JSON.parse(await readFile(join(installedPdfRoot, "package.json"), "utf8"));
  assert.equal(installedPdfManifest.version, "6.2.108");

  await Promise.all([
    writeFile(join(consumerRoot, "consumer.mjs"), runtimeConsumerSource),
    writeFile(join(consumerRoot, "consumer.mts"), declarationConsumerSource),
    writeFile(
      join(consumerRoot, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            lib: ["ES2022", "DOM"],
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            types: [],
          },
          files: ["consumer.mts"],
        },
        null,
        2,
      )}\n`,
    ),
  ]);

  await execute(nodeExecutable, [typescriptEntrypoint, "-p", "tsconfig.json"], { cwd: consumerRoot });
  const runtime = await execute(nodeExecutable, ["consumer.mjs"], { cwd: consumerRoot, maxBuffer: 20 * 1024 * 1024 });
  assert.match(runtime.stdout, /paper-import consumer conformance passed/u);
}

async function installedNativeCanvasPackageName() {
  const entries = await readdir(join(repositoryRoot, "node_modules/@napi-rs"), { withFileTypes: true });
  return canvasNativePackageName(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    process.platform,
    process.arch,
  );
}

function canvasNativePackageName(packageNames, platform, architecture) {
  const prefix = `canvas-${platform}-${architecture}`;
  const matches = packageNames.filter((packageName) => packageName === prefix || packageName.startsWith(`${prefix}-`)).sort(compareText);
  assert.equal(matches.length, 1, `Expected one installed native canvas package for ${platform}-${architecture}, found ${matches.length}`);
  return `@napi-rs/${matches[0]}`;
}

async function findExactNode(version) {
  const expected = `v${version}`;
  const candidates = [process.execPath, join(homedir(), `.nvm/versions/node/v${version}/bin/node`), "/opt/homebrew/opt/node@24/bin/node"];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      const result = await execute(candidate, ["--version"]);
      if (result.stdout.trim() === expected) return candidate;
    } catch {
      // Try the next repository-supported local Node installation.
    }
  }
  throw new Error(`Node ${version} is required for the isolated paper-import consumer test`);
}

async function runBuild(nodeExecutable) {
  await execute(nodeExecutable, ["./scripts/build-paper-import-package.mjs"], { cwd: repositoryRoot });
}

async function runNpm(nodeExecutable, npmEntrypoint, npmCache, arguments_, cwd = repositoryRoot) {
  return execute(nodeExecutable, [npmEntrypoint, ...arguments_, "--cache", npmCache], {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function parsePackResult(stdout) {
  const result = JSON.parse(stdout);
  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 1);
  return result[0];
}

async function contentSnapshot(directory) {
  const files = await recursivelyListFiles(directory);
  return Promise.all(
    files.map(async (path) => ({
      path,
      sha256: createHash("sha256")
        .update(await readFile(join(directory, path)))
        .digest("hex"),
    })),
  );
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

const runtimeConsumerSource = `import assert from "node:assert/strict";
import * as paperImport from "@kirjolab/paper-import";
import {
  createPaperImportConformanceCorpusV2,
  createProseBlocksConformanceFixtureV2,
  createReviewedLatexConformanceFixtureV2,
} from "@kirjolab/paper-import/conformance";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

assert.equal("createPaperImportConformanceCorpusV2" in paperImport, false);
const fixture = createReviewedLatexConformanceFixtureV2();
const corpus = createPaperImportConformanceCorpusV2();
const inspection = await paperImport.inspectLatexArchive(fixture.archive);
const conversion = paperImport.convertLatexProject(inspection, fixture.selection);
assert.equal(conversion.options.maximumSemanticRecords > 0, true);
assert.equal(conversion.proseBlocks.length > 0, true);
assert.equal(conversion.files.every((file) => file.renderedFormat === "scholarmark-v1"), true);
for (const block of conversion.proseBlocks) {
  const original = fixture.sourceByPath[block.range.path];
  assert.equal(typeof original, "string");
  assert.equal(original.slice(block.range.start, block.range.end), block.source);
}
const identity = paperImport.createLatexPreviewIdentity({
  archive: fixture.archive,
  files: inspection.files,
  conversion,
});
assert.deepEqual(identity.options, conversion.options);
assert.equal(paperImport.digestLatexPreviewIdentity(identity), fixture.expected.identity.previewDigest);

const proseFixture = createProseBlocksConformanceFixtureV2();
const proseInspection = await paperImport.inspectLatexArchive(proseFixture.archive);
const proseConversion = paperImport.convertLatexProject(proseInspection, proseFixture.selection);
assert.deepEqual(proseConversion.proseBlocks, proseFixture.expected.blocks);
assert.deepEqual(
  {
    figures: proseConversion.figures.map(({ requestedPath, archivePath, caption }) => ({
      requestedPath,
      archivePath,
      caption: caption?.value,
    })),
    tables: proseConversion.tables.map(({ environment }) => environment),
    codeBlocks: proseConversion.codeBlocks.map(({ environment, value }) => ({ environment, value })),
    equations: proseConversion.equations.map(({ value }) => value),
  },
  proseFixture.expected.excludedEnvironmentInventories,
);
for (const block of proseConversion.proseBlocks) {
  const original = proseFixture.sourceByPath[block.range.path];
  assert.equal(typeof original, "string");
  assert.equal(original.slice(block.range.start, block.range.end), block.source);
}

const pdfFixture = corpus.pdf.twoPageNativeText;
const standardFontDataUrl = new URL("./node_modules/pdfjs-dist/standard_fonts/", import.meta.url).href;
const extractPdfText = paperImport.createPdfTextExtractor({
  getDocument({ data }) {
    const loadingTask = getDocument({ data, standardFontDataUrl });
    return {
      promise: loadingTask.promise.then((documentModel) => ({
        numPages: documentModel.numPages,
        getPage: async (pageNumber) => {
          const page = await documentModel.getPage(pageNumber);
          return {
            streamTextContent: () => page.streamTextContent(),
            cleanup: () => page.cleanup(),
          };
        },
      })),
      destroy: async () => loadingTask.destroy(),
    };
  },
});
assert.deepEqual(await extractPdfText(pdfFixture.bytes, pdfFixture.limits), pdfFixture.expected);
console.log("paper-import consumer conformance passed");
`;

const declarationConsumerSource = `import {
  convertLatexProject,
  createLatexPreviewIdentity,
  inspectLatexArchive,
  type LatexProjectConversion,
  type LatexProseBlockInventory,
} from "@kirjolab/paper-import";
import {
  createReviewedLatexConformanceFixtureV2,
  type ReviewedLatexConformanceFixtureV2,
} from "@kirjolab/paper-import/conformance";

async function consume(fixture: ReviewedLatexConformanceFixtureV2): Promise<LatexProjectConversion> {
  const inspection = await inspectLatexArchive(fixture.archive);
  const conversion = convertLatexProject(inspection, fixture.selection);
  const prose: readonly LatexProseBlockInventory[] = conversion.proseBlocks;
  const optionLimit: number = conversion.options.maximumSemanticRecords;
  const identity = createLatexPreviewIdentity({ archive: fixture.archive, files: inspection.files, conversion });
  void prose;
  void optionLimit;
  void identity.conversionManifestSha256;
  return conversion;
}

void consume(createReviewedLatexConformanceFixtureV2());
`;
