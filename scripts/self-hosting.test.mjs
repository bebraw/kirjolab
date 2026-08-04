import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

async function readJsonc(path) {
  const source = await readFile(projectFile(path), "utf8");
  return JSON.parse(source.replaceAll(/,\s*([}\]])/gu, "$1"));
}

test("keeps the self-host Worker profile local and aligned with production storage authorities", async () => {
  const [production, selfHost] = await Promise.all([readJsonc("wrangler.jsonc"), readJsonc("wrangler.self-host.jsonc")]);

  assert.deepEqual(selfHost.durable_objects, production.durable_objects);
  assert.deepEqual(selfHost.migrations, production.migrations);
  assert.equal(selfHost.main, production.main);
  assert.equal(selfHost.compatibility_date, production.compatibility_date);
  assert.deepEqual(selfHost.compatibility_flags, production.compatibility_flags);
  assert.equal(selfHost.vars?.AUTH_MODE, "local");
  assert.equal(selfHost.vars?.ARTIFACT_ANALYSIS_MODE, "disabled");
  assert.equal(selfHost.send_metrics, false);
  assert.deepEqual(selfHost.r2_buckets, [{ binding: "PAPERS", bucket_name: "kirjolab-self-host-papers" }]);
  assert.deepEqual(selfHost.assets, production.assets);
  assert.deepEqual(selfHost.rules, production.rules);

  for (const cloudOnlyField of ["ai", "browser", "queues", "triggers", "version_metadata", "observability"]) {
    assert.equal(selfHost[cloudOnlyField], undefined, `${cloudOnlyField} must stay out of the self-host profile`);
  }
  assert.doesNotMatch(JSON.stringify(selfHost), /"remote"\s*:\s*true/u);
});

test("runs the self-host profile without loading host secrets or remote bindings", async () => {
  const dockerfile = await readFile(projectFile("Dockerfile"), "utf8");

  assert.match(dockerfile, /CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false/u);
  assert.match(dockerfile, /KIRJOLAB_BROWSER_SHELL_MODE=production/u);
  assert.match(dockerfile, /WRANGLER_SEND_METRICS=false/u);
  assert.match(dockerfile, /"\.\/node_modules\/\.bin\/wrangler", "dev"/u);
  assert.match(dockerfile, /"--config", "wrangler\.self-host\.jsonc"/u);
  assert.match(dockerfile, /"--local"/u);
  assert.match(dockerfile, /"--ip", "0\.0\.0\.0"/u);
  assert.match(dockerfile, /"--port", "8787"/u);
  assert.match(dockerfile, /"--persist-to", "\/data"/u);
  assert.match(dockerfile, /"--inspector-ip", "127\.0\.0\.1"/u);
  assert.doesNotMatch(dockerfile, /"--remote"/u);
});

test("keeps the evaluation container loopback-only, persistent, and non-root", async () => {
  const [compose, dockerfile, dockerignore] = await Promise.all([
    readFile(projectFile("compose.yaml"), "utf8"),
    readFile(projectFile("Dockerfile"), "utf8"),
    readFile(projectFile(".dockerignore"), "utf8"),
  ]);

  assert.match(dockerfile, /^FROM node:24\.15\.0-bookworm-slim$/mu);
  assert.match(dockerfile, /^RUN npm ci --ignore-scripts && npm cache clean --force$/mu);
  assert.match(dockerfile, /^RUN npm run build$/mu);
  assert.match(dockerfile, /mkdir -p \/app\/\.wrangler \/app\/node_modules\/\.mf \/data/u);
  assert.match(dockerfile, /^USER node$/mu);
  assert.match(dockerfile, /^CMD \["\.\/node_modules\/\.bin\/wrangler", "dev", /mu);
  assert.equal(dockerfile.slice(dockerfile.indexOf("USER node")).includes("USER root"), false);

  assert.match(compose, /127\.0\.0\.1:8787:8787/u);
  assert.match(compose, /kirjolab-data:\/data/u);
  assert.match(compose, /http:\/\/127\.0\.0\.1:8787\/api\/health/u);
  assert.doesNotMatch(compose, /environment:|env_file|\.dev\.vars|\.env(?:\s|$)|\$\{|network_mode:\s*host|replicas:/u);
  assert.doesNotMatch(compose, /(?:^|\n)\s*-\s*(?:\.{0,2}\/|\/)[^:]*:/u);

  for (const excluded of [".dev.vars", ".env", ".git", ".wrangler", "node_modules"]) {
    assert.match(dockerignore, new RegExp(`^${excluded.replaceAll(".", "\\.")}(?:/|$)`, "mu"));
  }
  assert.match(dockerignore, /^\.dev\.vars\.\*$/mu);
  assert.match(dockerignore, /^\.env\.\*$/mu);
});
