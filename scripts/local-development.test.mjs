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
  assert.match(command, /KIRJOLAB_BROWSER_SHELL_MODE=development\b/u);
  assert.doesNotMatch(command, /AUTH_MODE:access/u);
});

test("uses Lit diagnostics only in owned development and test runtimes", async () => {
  const [e2eServer, packageJson, vitestConfig] = await Promise.all([
    readFile(new URL("./run-e2e-server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../vitest.config.mts", import.meta.url), "utf8"),
  ]);

  assert.match(e2eServer, /KIRJOLAB_BROWSER_SHELL_MODE:\s*"development"/u);
  assert.doesNotMatch(packageJson.scripts?.["build:browser-shell"] ?? "", /development/u);
  assert.match(vitestConfig, /conditions:\s*\["module",\s*"browser",\s*"development"\]/u);
});

test("keeps Worker tests local while declaring production AI access remote", async () => {
  const [testConfig, wranglerConfig] = await Promise.all([
    readFile(new URL("../vitest.workers.config.mts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);

  assert.match(testConfig, /remoteBindings:\s*false/u);
  assert.match(wranglerConfig, /"ai":\s*\{\s*"binding":\s*"AI",\s*"remote":\s*true\s*\}/u);
});

test("keeps bare Wrangler deploys fail-closed behind local auth defaults", async () => {
  const wranglerConfig = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

  assert.match(wranglerConfig, /"AUTH_MODE":\s*"local"/u);
  assert.match(wranglerConfig, /"ACCESS_TEAM_DOMAIN":\s*""/u);
  assert.match(wranglerConfig, /"ACCESS_AUD":\s*""/u);
});

test("isolates E2E runs from artifact-analysis browser jobs", async () => {
  const [server, wranglerConfig] = await Promise.all([
    readFile(new URL("./run-e2e-server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);

  assert.match(wranglerConfig, /"ARTIFACT_ANALYSIS_MODE":\s*"enabled"/u);
  assert.match(server, /"ARTIFACT_ANALYSIS_MODE:disabled"/u);
});

test("pins the browser Worker runtime below the upstream EPIPE regression", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.equal(packageJson.devDependencies?.wrangler, "4.116.0");
});

test("fails the browser gate when Playwright discovers no tests", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const command = packageJson.scripts?.e2e;

  assert.equal(typeof command, "string");
  assert.match(command, /\bplaywright test\b/u);
  assert.doesNotMatch(command, /--pass-with-no-tests\b/u);
});
