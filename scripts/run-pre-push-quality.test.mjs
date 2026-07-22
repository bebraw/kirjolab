import assert from "node:assert/strict";
import test from "node:test";
import { affectedMutationSources, affectsFallow, isMutationSource, mutationPlan } from "./run-pre-push-quality.mjs";

test("routes affected codebase inputs to Fallow", () => {
  assert.equal(affectsFallow("src/domain/workspace.ts"), true);
  assert.equal(affectsFallow("scripts/run-quality-gate.mjs"), true);
  assert.equal(affectsFallow(".fallowrc.json"), true);
  assert.equal(affectsFallow("docs/development.md"), false);
});

test("identifies only configured Stryker production sources", () => {
  assert.equal(isMutationSource("src/domain/workspace.ts"), true);
  assert.equal(isMutationSource("src/domain/workspace.test.ts"), false);
  assert.equal(isMutationSource("src/api/workspace.ts"), false);
  assert.equal(isMutationSource("src/durable-objects/document-room.ts"), false);
  assert.equal(isMutationSource("src/client/app.ts"), false);
  assert.equal(isMutationSource("src/client/review-study.ts"), false);
  assert.equal(isMutationSource("src/client/review-study-contracts.ts"), true);
  assert.equal(isMutationSource("src/worker.e2e.ts"), false);
  assert.equal(isMutationSource("src/api/reviews.workers.test.ts"), false);
  assert.equal(isMutationSource("docs/development.md"), false);
});

test("maps affected Node unit tests back to mutation sources", () => {
  assert.deepEqual(affectedMutationSources(process.cwd(), ["src/domain/workspace.test.ts"]), ["src/domain/workspace.ts"]);
  assert.deepEqual(affectedMutationSources(process.cwd(), ["src/api/reviews.workers.test.ts"]), []);
  assert.deepEqual(affectedMutationSources(process.cwd(), ["src/domain/removed-module.ts"]), []);
});

test("refreshes stale incremental results after any mutation configuration change", () => {
  assert.deepEqual(mutationPlan(process.cwd(), ["stryker.config.mjs", "src/domain/workspace.ts"]), {
    script: "mutation:incremental:refresh",
    sources: [],
  });
  assert.deepEqual(mutationPlan(process.cwd(), ["src/domain/workspace.ts"]), {
    script: "mutation:affected",
    sources: ["src/domain/workspace.ts"],
  });
  assert.equal(mutationPlan(process.cwd(), ["docs/development.md"]), null);
});
