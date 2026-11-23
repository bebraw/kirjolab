import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";
import { pdfRuntimeCompatibilityBanner } from "./pdf-runtime-compatibility.mjs";

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

export function fingerprintedAssetName(stem, contents, extension = "js") {
  return `${stem}-${contentFingerprint(contents)}.${extension}`;
}

export async function buildBrowserShell(root = projectRoot, mode = browserShellBuildMode()) {
  const outputRoot = join(root, ".generated");
  const outputAssets = join(outputRoot, "assets");
  await mkdir(outputAssets, { recursive: true });
  const previousAssets = await readdir(outputAssets);

  const markdownAsset = await buildFingerprintedRuntime({
    entryPoint: join(root, "src/domain/manuscript/markdown.ts"),
    mode,
    outputAssets,
    stem: "markdown-module",
  });
  const pdfAsset = await buildFingerprintedRuntime({
    banner: { js: pdfRuntimeCompatibilityBanner },
    entryPoint: join(root, "node_modules/pdfjs-dist/legacy/build/pdf.mjs"),
    mode,
    outputAssets,
    stem: "pdfjs-module",
  });
  const pdfViewerAsset = await buildFingerprintedRuntime({
    entryPoint: join(root, "node_modules/pdfjs-dist/legacy/web/pdf_viewer.mjs"),
    mode,
    outputAssets,
    stem: "pdfjs-viewer",
  });
  const pdfViewerStyles = await buildFingerprintedRuntime({
    entryPoint: join(root, "src/client/pdf/pdfjs-viewer.css"),
    extension: "css",
    loader: { ".svg": "dataurl", ".gif": "dataurl" },
    mode,
    outputAssets,
    stem: "pdfjs-viewer",
  });
  const pdfViewerImages = await buildPdfAnnotationImages(root, outputAssets);
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
    __PDFJS_VIEWER_URL__: JSON.stringify(`/${pdfViewerAsset.name}`),
    __PDFJS_VIEWER_STYLES_URL__: JSON.stringify(`/${pdfViewerStyles.name}`),
    __PDFJS_VIEWER_IMAGE_PREFIX__: JSON.stringify(`/${pdfViewerImages.prefix}`),
  };
  const appOutput = join(outputRoot, "app.txt");

  await buildClient(root, appOutput, runtimeDefines, "pending", mode);
  const [provisionalApp, stylesheet] = await Promise.all([readFile(appOutput), readFile(join(outputRoot, "styles.css"))]);
  const shellVersion = contentFingerprint(
    provisionalApp,
    stylesheet,
    markdownAsset.contents,
    pdfAsset.contents,
    pdfViewerAsset.contents,
    pdfViewerStyles.contents,
    cytoscapeAsset.contents,
  );

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

  await removeSupersededRuntimeAssets(
    outputAssets,
    previousAssets,
    new Set([markdownAsset.name, pdfAsset.name, pdfViewerAsset.name, pdfViewerStyles.name, cytoscapeAsset.name, ...pdfViewerImages.names]),
  );

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

async function buildPdfAnnotationImages(root, outputAssets) {
  // PDF.js builds image URLs by appending the annotation's icon name to a shared prefix.
  const imageRoot = join(root, "node_modules/pdfjs-dist/legacy/web/images");
  const names = (await readdir(imageRoot)).filter((name) => /^annotation-[a-z]+\.svg$/u.test(name)).sort();
  const images = await Promise.all(names.map(async (name) => [name, await readFile(join(imageRoot, name))]));
  const prefix = `pdfjs-image-${contentFingerprint(...images.flat())}-`;
  const publishedNames = await Promise.all(
    images.map(async ([name, contents]) => {
      const publishedName = prefix + name;
      await publishRuntimeAsset(outputAssets, publishedName, contents);
      return publishedName;
    }),
  );
  return { prefix, names: publishedNames };
}

export async function buildFingerprintedRuntime({ banner, entryPoint, extension = "js", loader, mode, outputAssets, stem }) {
  const result = await build({
    entryPoints: [entryPoint],
    banner,
    bundle: true,
    conditions: browserShellConditions(mode),
    format: "esm",
    loader,
    target: "es2022",
    minify: true,
    outfile: join(outputAssets, `${stem}.${extension}`),
    write: false,
  });
  const contents = result.outputFiles[0].contents;
  const name = fingerprintedAssetName(stem, contents, extension);
  await publishRuntimeAsset(outputAssets, name, contents);
  return { contents, name };
}

async function publishRuntimeAsset(outputAssets, name, contents) {
  // Stage beside the asset directory so a watcher can only serve complete files.
  const temporaryPath = join(outputAssets, "..", `.${name}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, contents, { flag: "wx" });
    await rename(temporaryPath, join(outputAssets, name));
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function removeSupersededRuntimeAssets(outputAssets, previousAssets, currentAssets) {
  // A concurrent watcher may have published another generation after this build began.
  await Promise.all(
    previousAssets
      .filter(
        (name) =>
          !currentAssets.has(name) &&
          /^(?:(?:cytoscape|markdown|pdfjs)-module-[a-f0-9]{16}\.js|pdfjs-viewer-[a-f0-9]{16}\.(?:js|css)|pdfjs-image-[a-f0-9]{16}-annotation-[a-z]+\.svg)$/u.test(
            name,
          ),
      )
      .map((name) => rm(join(outputAssets, name), { force: true })),
  );
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const result = await buildBrowserShell();
  console.log(
    `[browser-shell] Lit ${result.mode}, ${result.markdownAsset}, ${result.pdfAsset}, ${result.cytoscapeAsset}, offline cache ${result.shellVersion}`,
  );
}
