import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("forces loopback-only authentication for interactive development", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const command = packageJson.scripts?.["dev:worker"];

  assert.equal(typeof command, "string");
  assert.match(command, /\bwrangler dev --local\b/u);
  assert.match(command, /--ip 127\.0\.0\.1\b/u);
  assert.match(command, /--var AUTH_MODE:local\b/u);
  assert.doesNotMatch(command, /AUTH_MODE:access/u);
});
