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

test("keeps Worker tests local while declaring production AI access remote", async () => {
  const [testConfig, wranglerConfig] = await Promise.all([
    readFile(new URL("../vitest.workers.config.mts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);

  assert.match(testConfig, /remoteBindings:\s*false/u);
  assert.match(wranglerConfig, /"ai":\s*\{\s*"binding":\s*"AI",\s*"remote":\s*true\s*\}/u);
});

test("isolates E2E runs from artifact-analysis browser jobs", async () => {
  const [server, wranglerConfig] = await Promise.all([
    readFile(new URL("./run-e2e-server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);

  assert.match(wranglerConfig, /"ARTIFACT_ANALYSIS_MODE":\s*"enabled"/u);
  assert.match(server, /"ARTIFACT_ANALYSIS_MODE:disabled"/u);
});
