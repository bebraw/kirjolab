import { spawn } from "node:child_process";
import process from "node:process";

const heartbeatIntervalMs = 15_000;
const activeSteps = new Map();
const command = process.platform === "win32" ? "agent-ci.cmd" : "agent-ci";
const child = spawn(command, ["run", "--quiet", "--json", "--jobs", "1", "--pause-on-failure", "--workflow", ".github/workflows/ci.yml"], {
  stdio: ["inherit", "pipe", "inherit"],
  env: process.env,
});

let buffer = "";
let runStartedAt = Date.now();
let runFinished = false;

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) reportLine(line);
});

const heartbeat = setInterval(() => {
  const now = Date.now();
  if (!runFinished && activeSteps.size === 0) {
    console.log(`[ci] … Local workflow is still running (${formatDuration(now - runStartedAt)} elapsed)`);
  }
  for (const step of activeSteps.values()) {
    console.log(`[ci] … ${step.job} › ${step.name} (${formatDuration(now - step.startedAt)} elapsed)`);
  }
}, heartbeatIntervalMs);
heartbeat.unref();

child.on("error", (error) => {
  clearInterval(heartbeat);
  console.error(`[ci] Could not start Agent CI: ${error.message}`);
  process.exitCode = 1;
});

child.on("close", (code, signal) => {
  clearInterval(heartbeat);
  if (buffer.trim()) reportLine(buffer);
  if (signal) console.error(`[ci] Agent CI stopped by ${signal}`);
  process.exitCode = code ?? 1;
});

function reportLine(line) {
  if (!line.trim()) return;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    console.log(line);
    return;
  }

  switch (event.event) {
    case "run.start":
      runStartedAt = eventTime(event.ts);
      console.log(`[ci] ▶ Local workflow started (${event.runId})`);
      if (event.schemaVersion !== 1) {
        console.error(`[ci] warning: unsupported Agent CI event schema ${event.schemaVersion}`);
      }
      break;
    case "job.start":
      console.log(`[ci] ▶ ${event.job}`);
      break;
    case "step.start":
      activeSteps.set(stepKey(event), {
        job: event.job,
        name: event.step,
        startedAt: eventTime(event.ts),
      });
      console.log(`[ci]   ▶ ${event.job} › ${event.index}. ${event.step}`);
      break;
    case "step.finish":
      activeSteps.delete(stepKey(event));
      console.log(`[ci]   ${statusMark(event.status)} ${event.job} › ${event.index}. ${event.step}${durationSuffix(event.durationMs)}`);
      break;
    case "job.finish":
      console.log(`[ci] ${statusMark(event.status)} ${event.job}${durationSuffix(event.durationMs)}`);
      break;
    case "run.paused":
      activeSteps.clear();
      console.error(`[ci] ⏸ ${event.runner} paused${event.step ? ` at ${event.step}` : ""}`);
      console.error(`[ci] Resume with: ${event.retry_cmd}`);
      break;
    case "run.finish":
      activeSteps.clear();
      runFinished = true;
      console.log(
        `[ci] ${statusMark(event.status)} Local workflow ${event.status}${durationSuffix(event.durationMs ?? Date.now() - runStartedAt)}`,
      );
      break;
    case "diagnostic":
      console.error(`[ci] ${event.level}: ${event.message}`);
      break;
    default:
      console.log(line);
  }
}

function stepKey(event) {
  return `${event.runner}:${event.index}`;
}

function eventTime(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function statusMark(status) {
  if (status === "passed") return "✓";
  if (status === "skipped") return "⊘";
  return "✗";
}

function durationSuffix(value) {
  return typeof value === "number" && Number.isFinite(value) ? ` (${formatDuration(value)})` : "";
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}
