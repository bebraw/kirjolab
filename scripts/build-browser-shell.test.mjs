import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";

import {
  assertLitBuildMode,
  buildFingerprintedRuntime,
  browserShellBuildMode,
  browserShellConditions,
  contentFingerprint,
  fingerprintedAssetName,
} from "./build-browser-shell.mjs";

test("publishes concurrent viewer builds under fingerprints of their complete outputs", async (t) => {
  const outputAssets = await mkdtemp(join(tmpdir(), "kirjolab-viewer-assets-"));
  t.after(() => rm(outputAssets, { recursive: true, force: true }));
  const sources = ["first", "second"];
  const entries = await Promise.all(
    sources.map(async (value) => {
      const path = join(outputAssets, value + ".mjs");
      await writeFile(path, `export const value = "${value}";`);
      return path;
    }),
  );
  const results = await Promise.allSettled(
    [...entries, ...entries, ...entries, ...entries].map((entryPoint) =>
      buildFingerprintedRuntime({ entryPoint, mode: "production", outputAssets, stem: "pdfjs-viewer" }),
    ),
  );
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") throw result.reason;
    const { name } = result.value;
    const bytes = await readFile(join(outputAssets, name));
    assert.equal(name, fingerprintedAssetName("pdfjs-viewer", bytes));
    assert.ok(bytes.toString().includes(sources[index % entries.length]));
  }
  assert.equal((await readdir(outputAssets)).length, entries.length + sources.length);
});

test("derives stable bounded browser asset fingerprints from content", () => {
  assert.equal(contentFingerprint("same"), contentFingerprint("same"));
  assert.notEqual(contentFingerprint("before"), contentFingerprint("after"));
  assert.match(contentFingerprint("content"), /^[a-f0-9]{16}$/u);
});

test("places the content fingerprint in immutable JavaScript asset names", () => {
  assert.equal(fingerprintedAssetName("markdown-module", "content"), `markdown-module-${contentFingerprint("content")}.js`);
});

test("defaults browser shells to production and rejects unknown modes", () => {
  assert.equal(browserShellBuildMode({}), "production");
  assert.equal(browserShellBuildMode({ KIRJOLAB_BROWSER_SHELL_MODE: " production " }), "production");
  assert.equal(browserShellBuildMode({ KIRJOLAB_BROWSER_SHELL_MODE: "development" }), "development");
  assert.throws(() => browserShellBuildMode({ KIRJOLAB_BROWSER_SHELL_MODE: "staging" }), /must be development or production/u);
  assert.deepEqual(browserShellConditions("production"), ["production", "module"]);
  assert.deepEqual(browserShellConditions("development"), ["development", "module"]);
  assert.throws(() => assertLitBuildMode({ inputs: {} }, "production", "required probe"), /did not bundle the Lit runtime/u);
  assert.doesNotThrow(() =>
    assertLitBuildMode({ inputs: {} }, "production", "optional probe", {
      required: false,
    }),
  );
});

test("resolves actual Lit production and development exports explicitly", async () => {
  for (const mode of ["production", "development"]) {
    const result = await build({
      bundle: true,
      conditions: browserShellConditions(mode),
      format: "esm",
      metafile: true,
      minify: true,
      platform: "browser",
      stdin: {
        contents: "import { html } from 'lit'; globalThis.__litProbe = html;",
        resolveDir: process.cwd(),
        sourcefile: "lit-mode-probe.ts",
      },
      target: "es2022",
      write: false,
    });

    assert.doesNotThrow(() => assertLitBuildMode(result.metafile, mode, `${mode} probe`));
    const output = new TextDecoder().decode(result.outputFiles[0]?.contents);
    assert.equal(output.includes("Lit is in dev mode"), mode === "development");
  }
});
