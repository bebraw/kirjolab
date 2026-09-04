import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runSecurityAudit } from "./run-security-audit.mjs";

test("retries transient npm audit failures with a bounded fetch timeout", async () => {
  const attempts = [];
  const waits = [];
  const results = [
    {
      exitCode: 1,
      output: "npm warn audit 503 Service Unavailable - POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
    },
    {
      exitCode: 1,
      output: "npm warn audit network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
    },
    { exitCode: 0, output: "found 0 vulnerabilities" },
  ];

  const exitCode = await runSecurityAudit({
    log: () => {},
    retryDelaysMs: [5_000, 15_000],
    run: async ({ fetchTimeoutMs }) => {
      attempts.push(fetchTimeoutMs);
      return results.shift();
    },
    wait: async (delayMs) => waits.push(delayMs),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(attempts, [60_000, 60_000, 60_000]);
  assert.deepEqual(waits, [5_000, 15_000]);
});

test("fails closed after the final transient npm audit failure", async () => {
  let attempts = 0;

  const exitCode = await runSecurityAudit({
    allowUnavailableAfterIndependentReview: false,
    log: () => {},
    retryDelaysMs: [0, 0],
    run: async () => {
      attempts += 1;
      return { exitCode: 1, output: "npm warn audit 503 Service Unavailable" };
    },
    wait: async () => {},
  });

  assert.equal(exitCode, 1);
  assert.equal(attempts, 3);
});

test("allows an exhausted transport failure after independent dependency review", async () => {
  const messages = [];

  const exitCode = await runSecurityAudit({
    allowUnavailableAfterIndependentReview: true,
    log: (message) => messages.push(message),
    retryDelaysMs: [],
    run: async () => ({ exitCode: 1, output: "npm warn audit 503 Service Unavailable" }),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(messages, [
    "[security:audit] npm registry remained unavailable; accepting the completed independent dependency review for this pull request.",
  ]);
});

test("does not retry a completed audit that reports vulnerabilities", async () => {
  let attempts = 0;

  const exitCode = await runSecurityAudit({
    allowUnavailableAfterIndependentReview: true,
    log: () => {},
    retryDelaysMs: [0, 0],
    run: async () => {
      attempts += 1;
      return {
        exitCode: 1,
        output: "npm warn audit 503 Service Unavailable\n# npm audit report\nexample-package high severity vulnerability",
      };
    },
    wait: async () => {},
  });

  assert.equal(exitCode, 1);
  assert.equal(attempts, 1);
});

test("PR CI enables the fallback only after GitHub dependency review succeeds", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

  assert.match(workflow, /id: dependency-review/u);
  assert.match(workflow, /uses: actions\/dependency-review-action@[a-f0-9]{40} # v5\.0\.0/u);
  assert.match(workflow, /fail-on-severity: high/u);
  assert.match(workflow, /fail-on-scopes: runtime/u);
  assert.match(
    workflow,
    /NPM_AUDIT_TRANSPORT_FALLBACK: \$\{\{ steps\.dependency-review\.outcome == 'success' && 'github-dependency-review' \|\| '' \}\}/u,
  );
});
