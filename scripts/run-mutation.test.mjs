import assert from "node:assert/strict";
import test from "node:test";

import { runMutation } from "./run-mutation.mjs";

test("summarizes a newly written report and preserves Stryker's exit code", async () => {
  const fingerprints = ["before", "after"];
  const calls = [];

  const exitCode = await runMutation({
    args: ["--incremental"],
    fingerprint: () => fingerprints.shift(),
    report: (file) => calls.push(["report", file]),
    run: async (args) => {
      calls.push(["run", ...args]);
      return 7;
    },
  });

  assert.equal(exitCode, 7);
  assert.deepEqual(calls, [
    ["run", "--incremental"],
    ["report", "reports/mutation/mutation.json"],
  ]);
});

test("does not summarize a stale report when Stryker writes no JSON", async () => {
  let reportCalls = 0;

  const exitCode = await runMutation({
    fingerprint: () => "unchanged",
    report: () => {
      reportCalls += 1;
    },
    run: async () => 0,
  });

  assert.equal(exitCode, 0);
  assert.equal(reportCalls, 0);
});
