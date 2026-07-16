import assert from "node:assert/strict";
import test from "node:test";

import { formatDuration, runQualityGate, startHeartbeat } from "./run-quality-gate.mjs";

test("runs every quality-gate phase with visible transitions", async () => {
  const logs = [];
  const scripts = [];
  let timestamp = 0;

  const exitCode = await runQualityGate({
    heartbeatMs: 60_000,
    log: (message) => logs.push(message),
    now: () => {
      timestamp += 1_000;
      return timestamp;
    },
    run: async (script) => {
      scripts.push(script);
      return 0;
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(scripts, ["quality:gate:fast", "e2e", "mutation:incremental"]);
  assert.match(logs[0], /1\/3 Starting fast checks/);
  assert.match(logs.at(-1), /Completed all 3 phases/);
});

test("stops after the first failing phase", async () => {
  const scripts = [];

  const exitCode = await runQualityGate({
    heartbeatMs: 60_000,
    log: () => {},
    run: async (script) => {
      scripts.push(script);
      return script === "e2e" ? 7 : 0;
    },
  });

  assert.equal(exitCode, 7);
  assert.deepEqual(scripts, ["quality:gate:fast", "e2e"]);
});

test("formats elapsed quality-gate time compactly", () => {
  assert.equal(formatDuration(29_999), "29s");
  assert.equal(formatDuration(90_000), "1m 30s");
});

test("reports elapsed time while a phase is still running", () => {
  const logs = [];
  const timer = { unrefCalled: false, unref: () => (timer.unrefCalled = true) };
  let heartbeat;
  let clearedTimer;

  const stopHeartbeat = startHeartbeat({
    clearIntervalFn: (value) => (clearedTimer = value),
    heartbeatMs: 30_000,
    label: "browser tests",
    log: (message) => logs.push(message),
    now: () => 91_000,
    position: "2/3",
    setIntervalFn: (callback, delay) => {
      assert.equal(delay, 30_000);
      heartbeat = callback;
      return timer;
    },
    stepStartedAt: 1_000,
  });

  heartbeat();
  stopHeartbeat();

  assert.equal(timer.unrefCalled, true);
  assert.equal(clearedTimer, timer);
  assert.deepEqual(logs, ["[quality:gate] 2/3 browser tests still running (1m 30s elapsed)."]);
});
