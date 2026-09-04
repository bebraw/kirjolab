import assert from "node:assert/strict";
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

test("does not retry a completed audit that reports vulnerabilities", async () => {
  let attempts = 0;

  const exitCode = await runSecurityAudit({
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
