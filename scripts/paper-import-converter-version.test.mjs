import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const converterSources = [
  "src/lib/paper-import/latex-analysis.ts",
  "src/lib/paper-import/latex-archive.ts",
  "src/lib/paper-import/latex-contracts.ts",
  "src/lib/paper-import/latex-conversion.ts",
  "src/lib/paper-import/latex-images.ts",
  "src/lib/paper-import/latex-preview-identity.ts",
  "src/lib/paper-import/latex-render-helpers.ts",
  "src/lib/paper-import/latex-render-limits.ts",
  "src/lib/paper-import/latex-renderer.ts",
  "src/lib/paper-import/latex-semantic-limit.ts",
  "src/lib/paper-import/latex-source.ts",
  "src/lib/paper-import/portable-path.ts",
  "src/lib/paper-import/sha256.ts",
];

const sourceFingerprintsByConverterVersion = {
  "latex-converter-v2": "f64a38cc3b9f46aa54a2b14a5ae60d98b701e9eea3c26405f8838447272b8a5a",
};

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test("the converter version changes with conversion or reviewed-identity behavior", async () => {
  const contractSource = await readFile(projectFile("src/lib/paper-import/latex-contracts.ts"), "utf8");
  const converterVersion = /latexConverterVersion\s*=\s*"([^"]+)"/u.exec(contractSource)?.[1];
  assert.ok(converterVersion, "latexConverterVersion must remain a string literal so the source guard can inspect it");

  const hash = createHash("sha256");
  for (const path of converterSources) {
    hash.update(path);
    hash.update("\0");
    hash.update(await readFile(projectFile(path)));
    hash.update("\0");
  }
  const actualFingerprint = hash.digest("hex");
  const expectedFingerprint = sourceFingerprintsByConverterVersion[converterVersion];

  assert.ok(expectedFingerprint, `Register a source fingerprint for the new converter version ${converterVersion}`);
  assert.equal(
    actualFingerprint,
    expectedFingerprint,
    `Conversion or reviewed-identity source changed without changing latexConverterVersion (${converterVersion}); bump the version and register its fingerprint`,
  );
});
