import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const fingerprintLength = 16;

export function contentFingerprint(...contents) {
  const hash = createHash("sha256");
  for (const content of contents) hash.update(content);
  return hash.digest("hex").slice(0, fingerprintLength);
}

export function fingerprintedAssetName(stem, contents) {
  return `${stem}-${contentFingerprint(contents)}.js`;
}

export async function buildBrowserShell(root = projectRoot) {
  const outputRoot = join(root, ".generated");
  const outputAssets = join(outputRoot, "assets");
  await mkdir(outputAssets, { recursive: true });
  await removeSupersededRuntimeAssets(outputAssets);

  const markdownAsset = await buildFingerprintedRuntime({
    entryPoint: join(root, "src/domain/markdown.ts"),
    outputAssets,
    stem: "markdown-module",
  });
  const pdfAsset = await buildFingerprintedRuntime({
    entryPoint: join(root, "node_modules/pdfjs-dist/legacy/build/pdf.mjs"),
    outputAssets,
    stem: "pdfjs-module",
  });
  const runtimeDefines = {
    __MARKDOWN_RUNTIME_URL__: JSON.stringify(`/${markdownAsset.name}`),
    __PDFJS_RUNTIME_URL__: JSON.stringify(`/${pdfAsset.name}`),
  };
  const appOutput = join(outputRoot, "app.txt");

  await buildClient(root, appOutput, runtimeDefines, "pending");
  const [provisionalApp, stylesheet] = await Promise.all([readFile(appOutput), readFile(join(outputRoot, "styles.css"))]);
  const shellVersion = contentFingerprint(provisionalApp, stylesheet, markdownAsset.contents, pdfAsset.contents);

  await buildClient(root, appOutput, runtimeDefines, shellVersion);
  await build({
    entryPoints: [join(root, "src/client/review-app.ts")],
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    outfile: join(outputRoot, "review-app.txt"),
  });
  await build({
    entryPoints: [join(root, "src/client/service-worker.ts")],
    bundle: true,
    format: "iife",
    target: "es2022",
    minify: true,
    outfile: join(outputRoot, "service-worker.txt"),
    define: {
      ...runtimeDefines,
      __OFFLINE_SHELL_CACHE_NAME__: JSON.stringify(`kirjolab-offline-shell-${shellVersion}`),
    },
  });

  return { markdownAsset: markdownAsset.name, pdfAsset: pdfAsset.name, shellVersion };
}

async function buildClient(root, outfile, runtimeDefines, shellVersion) {
  await build({
    entryPoints: [join(root, "src/client/app.ts")],
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    outfile,
    define: {
      ...runtimeDefines,
      __OFFLINE_SHELL_CACHE_NAME__: JSON.stringify(`kirjolab-offline-shell-${shellVersion}`),
    },
  });
}

async function buildFingerprintedRuntime({ entryPoint, outputAssets, stem }) {
  const pending = join(outputAssets, `${stem}.pending.js`);
  await build({
    entryPoints: [entryPoint],
    bundle: true,
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
    names.filter((name) => /^(?:markdown-module|pdfjs-module)-.+\.js$/u.test(name)).map(async (name) => await rm(join(outputAssets, name))),
  );
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const result = await buildBrowserShell();
  console.log(`[browser-shell] ${result.markdownAsset}, ${result.pdfAsset}, offline cache ${result.shellVersion}`);
}
