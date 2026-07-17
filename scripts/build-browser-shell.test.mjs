import assert from "node:assert/strict";
import test from "node:test";

import { contentFingerprint, fingerprintedAssetName } from "./build-browser-shell.mjs";

test("derives stable bounded browser asset fingerprints from content", () => {
  assert.equal(contentFingerprint("same"), contentFingerprint("same"));
  assert.notEqual(contentFingerprint("before"), contentFingerprint("after"));
  assert.match(contentFingerprint("content"), /^[a-f0-9]{16}$/u);
});

test("places the content fingerprint in immutable JavaScript asset names", () => {
  assert.equal(fingerprintedAssetName("markdown-module", "content"), `markdown-module-${contentFingerprint("content")}.js`);
});
