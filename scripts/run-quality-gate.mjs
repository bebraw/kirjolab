import { spawn } from "node:child_process";
import process from "node:process";

const defaultHeartbeatMs = 30_000;

export const qualityGateSteps = [
  { label: "fast checks", script: "quality:gate:fast" },
  { label: "browser tests", script: "e2e" },
];

export async function runQualityGate({
  heartbeatMs = defaultHeartbeatMs,
  log = console.log,
  now = Date.now,
  run = runNpmScript,
  steps = qualityGateSteps,
} = {}) {
  const gateStartedAt = now();

  for (const [index, step] of steps.entries()) {
    const position = `${index + 1}/${steps.length}`;
    const stepStartedAt = now();
    log(`[quality:gate] ${position} Starting ${step.label}: npm run ${step.script}`);

    const stopHeartbeat = startHeartbeat({ heartbeatMs, label: step.label, log, now, position, stepStartedAt });
    const exitCode = await run(step.script);
    stopHeartbeat();

    if (exitCode !== 0) {
      log(`[quality:gate] ${position} ${step.label} failed after ${formatDuration(now() - stepStartedAt)}.`);
      return exitCode;
    }

    log(`[quality:gate] ${position} Completed ${step.label} in ${formatDuration(now() - stepStartedAt)}.`);
  }

  log(`[quality:gate] Completed all ${steps.length} phases in ${formatDuration(now() - gateStartedAt)}.`);
  return 0;
}

export function startHeartbeat({
  clearIntervalFn = clearInterval,
  heartbeatMs,
  label,
  log,
  now,
  position,
  setIntervalFn = setInterval,
  stepStartedAt,
}) {
  const timer = setIntervalFn(() => {
    log(`[quality:gate] ${position} ${label} still running (${formatDuration(now() - stepStartedAt)} elapsed).`);
  }, heartbeatMs);
  timer.unref();

  return () => clearIntervalFn(timer);
}

export function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

function runNpmScript(script) {
  return new Promise((resolve) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, ["run", script], { env: process.env, stdio: "inherit" });

    child.once("error", (error) => {
      console.error(`[quality:gate] Could not start npm run ${script}: ${error.message}`);
      resolve(1);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runQualityGate();
}
