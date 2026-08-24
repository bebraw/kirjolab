import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

async function readJson(path) {
  return JSON.parse((await readFile(projectFile(path), "utf8")).replaceAll(/,\s*([}\]])/gu, "$1"));
}

test("deploys Research Corpus separately over the existing private authorities", async () => {
  const [application, corpus] = await Promise.all([readJson("wrangler.jsonc"), readJson("wrangler.corpus.jsonc")]);
  const binding = corpus.durable_objects?.bindings?.find(({ name }) => name === "REFERENCE_LIBRARIES");

  assert.equal(corpus.name, "kirjolab-research-corpus");
  assert.equal(corpus.main, "src/research-corpus/worker.ts");
  assert.equal(corpus.compatibility_date, application.compatibility_date);
  assert.deepEqual(corpus.compatibility_flags, application.compatibility_flags);
  assert.deepEqual(binding, { name: "REFERENCE_LIBRARIES", class_name: "ReferenceLibrary", script_name: "kirjolab" });
  assert.equal(corpus.migrations, undefined, "the corpus facade must not create a second Durable Object namespace");
  assert.deepEqual(corpus.r2_buckets, application.r2_buckets);
  assert.deepEqual(corpus.queues?.producers, application.queues?.producers);
  assert.equal(corpus.queues?.consumers, undefined, "the existing Worker remains the only analysis consumer during migration");

  for (const applicationOnlyBinding of ["assets", "ai", "browser", "triggers", "version_metadata"]) {
    assert.equal(corpus[applicationOnlyBinding], undefined, `${applicationOnlyBinding} must stay out of the corpus Worker`);
  }
});

test("keeps bare corpus deployment fail-closed and develops with both Worker configs", async () => {
  const [corpus, packageJson] = await Promise.all([readJson("wrangler.corpus.jsonc"), readJson("package.json")]);
  const command = packageJson.scripts?.["dev:corpus"];

  assert.equal(corpus.vars?.AUTH_MODE, "local");
  assert.equal(corpus.vars?.ACCESS_TEAM_DOMAIN, "");
  assert.equal(corpus.vars?.ACCESS_AUD, "");
  assert.equal(corpus.vars?.CORPUS_ALLOWED_ORIGINS, "");
  assert.equal(typeof command, "string");
  assert.match(command, /wrangler dev --local/u);
  assert.match(command, /--config wrangler\.corpus\.jsonc --config wrangler\.jsonc/u);
  assert.match(command, /--ip 127\.0\.0\.1/u);
});

test("pins the supported stateless MCP runtime as direct dependencies", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(packageJson.dependencies?.agents, "0.21.0");
  assert.equal(packageJson.dependencies?.["@modelcontextprotocol/server"], "2.0.0");
  assert.equal(packageJson.dependencies?.zod, "4.4.3");
});
