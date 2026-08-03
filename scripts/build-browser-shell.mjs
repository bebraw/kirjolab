import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const fingerprintLength = 16;
const browserShellModeVariable = "KIRJOLAB_BROWSER_SHELL_MODE";

export function browserShellBuildMode(environment = process.env) {
  const value = environment[browserShellModeVariable]?.trim() || "production";
  if (value === "development" || value === "production") return value;
  throw new Error(`${browserShellModeVariable} must be development or production`);
}

export function browserShellConditions(mode) {
  return [mode, "module"];
}

export function assertLitBuildMode(metafile, mode, label, { required = true } = {}) {
  const litInputs = Object.keys(metafile.inputs).filter((path) =>
    /(?:^|[\\/])node_modules[\\/](?:lit-html|lit-element|@lit[\\/]reactive-element)[\\/]/u.test(path),
  );
  if (litInputs.length === 0) {
    if (required) throw new Error(`[browser-shell] ${label} did not bundle the Lit runtime`);
    return;
  }
  const developmentInputs = litInputs.filter((path) => /[\\/]development[\\/]/u.test(path));
  if (mode === "development" && developmentInputs.length === 0) {
    throw new Error(`[browser-shell] ${label} did not resolve Lit development inputs`);
  }
  if (mode === "production" && developmentInputs.length > 0) {
    throw new Error(`[browser-shell] ${label} resolved Lit development inputs in production mode`);
  }
}

export function contentFingerprint(...contents) {
  const hash = createHash("sha256");
  for (const content of contents) hash.update(content);
  return hash.digest("hex").slice(0, fingerprintLength);
}

export function fingerprintedAssetName(stem, contents) {
  return `${stem}-${contentFingerprint(contents)}.js`;
}

export async function buildBrowserShell(root = projectRoot, mode = browserShellBuildMode()) {
  const outputRoot = join(root, ".generated");
  const outputAssets = join(outputRoot, "assets");
  await mkdir(outputAssets, { recursive: true });
  await removeSupersededRuntimeAssets(outputAssets);

  const markdownAsset = await buildFingerprintedRuntime({
    entryPoint: join(root, "src/domain/manuscript/markdown.ts"),
    mode,
    outputAssets,
    stem: "markdown-module",
  });
  const pdfAsset = await buildFingerprintedRuntime({
    entryPoint: join(root, "node_modules/pdfjs-dist/legacy/build/pdf.mjs"),
    mode,
    outputAssets,
    stem: "pdfjs-module",
  });
  const cytoscapeAsset = await buildFingerprintedRuntime({
    entryPoint: join(root, "node_modules/cytoscape/dist/cytoscape.esm.mjs"),
    mode,
    outputAssets,
    stem: "cytoscape-module",
  });
  const runtimeDefines = {
    __CYTOSCAPE_RUNTIME_URL__: JSON.stringify(`/${cytoscapeAsset.name}`),
    __MARKDOWN_RUNTIME_URL__: JSON.stringify(`/${markdownAsset.name}`),
    __PDFJS_RUNTIME_URL__: JSON.stringify(`/${pdfAsset.name}`),
  };
  const appOutput = join(outputRoot, "app.txt");

  await buildClient(root, appOutput, runtimeDefines, "pending", mode);
  const [provisionalApp, stylesheet] = await Promise.all([readFile(appOutput), readFile(join(outputRoot, "styles.css"))]);
  const shellVersion = contentFingerprint(provisionalApp, stylesheet, markdownAsset.contents, pdfAsset.contents, cytoscapeAsset.contents);

  await buildClient(root, appOutput, runtimeDefines, shellVersion, mode);
  const reviewResult = await build({
    entryPoints: [join(root, "src/client/review-app.ts")],
    bundle: true,
    conditions: browserShellConditions(mode),
    format: "esm",
    metafile: true,
    target: "es2022",
    minify: true,
    outfile: join(outputRoot, "review-app.txt"),
  });
  assertLitBuildMode(reviewResult.metafile, mode, "review application", { required: false });
  await build({
    entryPoints: [join(root, "src/client/service-worker.ts")],
    bundle: true,
    conditions: browserShellConditions(mode),
    format: "iife",
    target: "es2022",
    minify: true,
    outfile: join(outputRoot, "service-worker.txt"),
    define: {
      ...runtimeDefines,
      __OFFLINE_SHELL_CACHE_NAME__: JSON.stringify(`kirjolab-offline-shell-${shellVersion}`),
    },
  });
  await build({
    entryPoints: [join(root, "src/browser/pdf-artifact-analyzer.ts")],
    bundle: true,
    conditions: browserShellConditions(mode),
    format: "iife",
    target: "es2022",
    minify: true,
    outfile: join(outputRoot, "pdf-artifact-analyzer.txt"),
  });

  return { cytoscapeAsset: cytoscapeAsset.name, markdownAsset: markdownAsset.name, mode, pdfAsset: pdfAsset.name, shellVersion };
}

async function buildClient(root, outfile, runtimeDefines, shellVersion, mode) {
  const result = await build({
    entryPoints: [join(root, "src/client/app.ts")],
    bundle: true,
    conditions: browserShellConditions(mode),
    format: "esm",
    metafile: true,
    target: "es2022",
    minify: true,
    outfile,
    define: {
      ...runtimeDefines,
      __OFFLINE_SHELL_CACHE_NAME__: JSON.stringify(`kirjolab-offline-shell-${shellVersion}`),
    },
  });
  assertLitBuildMode(result.metafile, mode, "workspace application");
}

async function buildFingerprintedRuntime({ entryPoint, mode, outputAssets, stem }) {
  const pending = join(outputAssets, `${stem}.pending.js`);
  await build({
    entryPoints: [entryPoint],
    bundle: true,
    conditions: browserShellConditions(mode),
    format: "esm",
    target: "es2022",
    minify: true,
    outfile: pending,
  });
  const contents = await readFile(pending);
  const name = fingerprintedAssetName(stem, contents);
  await rename(pending, join(outputAssets, name));
  return { contents, name };
}

async function removeSupersededRuntimeAssets(outputAssets) {
  const names = await readdir(outputAssets).catch((error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  });
  await Promise.all(
    names
      .filter((name) => /^(?:cytoscape-module|markdown-module|pdfjs-module)-.+\.js$/u.test(name))
      .map(async (name) => await rm(join(outputAssets, name))),
  );
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const result = await buildBrowserShell();
  console.log(
    `[browser-shell] Lit ${result.mode}, ${result.markdownAsset}, ${result.pdfAsset}, ${result.cytoscapeAsset}, offline cache ${result.shellVersion}`,
  );
}
