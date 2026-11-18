import { execFile } from "node:child_process";
import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const [flag, destination, ...extra] = process.argv.slice(2);
if (flag !== "--pack-destination" || !destination || extra.length) {
  throw new Error("Usage: npm run model:companion:pack -- --pack-destination <existing-directory>");
}
const packDestination = resolve(destination);
if (!(await stat(packDestination)).isDirectory()) throw new Error("The pack destination must be a directory");
const npmEntrypoint = process.env.npm_execpath;
if (!npmEntrypoint) throw new Error("Run model:companion:pack through npm");

const root = fileURLToPath(new URL("../", import.meta.url));
const staging = await mkdtemp(join(tmpdir(), "kirjolab-model-companion-"));
try {
  await build({
    absWorkingDir: root,
    entryPoints: ["scripts/model-companion-bin.mjs"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    outfile: join(staging, "companion.mjs"),
    banner: { js: "#!/usr/bin/env node" },
  });
  await Promise.all([
    copyFile(join(root, "LICENSE"), join(staging, "LICENSE")),
    copyFile(join(root, "packaging/model-companion/package.json"), join(staging, "package.json")),
    copyFile(join(root, "packaging/model-companion/README.md"), join(staging, "README.md")),
  ]);
  const { stdout } = await promisify(execFile)(process.execPath, [
    npmEntrypoint,
    "pack",
    "--ignore-scripts",
    "--json",
    "--cache",
    join(staging, ".npm-cache"),
    "--pack-destination",
    packDestination,
    staging,
  ]);
  process.stdout.write(stdout);
} finally {
  await rm(staging, { recursive: true, force: true });
}
