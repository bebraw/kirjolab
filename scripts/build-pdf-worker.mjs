import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { pdfRuntimeCompatibilityBanner } from "./pdf-runtime-compatibility.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = join(projectRoot, ".generated");

await mkdir(outputRoot, { recursive: true });
await build({
  entryPoints: [join(projectRoot, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")],
  banner: { js: pdfRuntimeCompatibilityBanner },
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  outfile: join(outputRoot, "pdf-worker.txt"),
  logLevel: "warning",
});
