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
  "latex-converter-v2": "a25b3309a8655d6f97922f5fab60786ce875927a7e408519d6c8285041a156a2",
  "latex-converter-v3": "c65cacd78d52aaccdc43e9964cb42219f3b572fb0b07d358eddafc274ff4d622",
  "latex-converter-v4": "a13924e989db01069a9181471d590030882c6ac304324071d9af1686b62e612d",
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
