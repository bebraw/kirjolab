import { spawn } from "node:child_process";

const children = new Set();
let shuttingDown = false;

function start(label, command, args, environment) {
  const child = spawn(command, args, { stdio: "inherit", env: environment });
  children.add(child);
  child.once("error", (error) => {
    console.error(`[dev] Could not start ${label}: ${error.message}`);
    shutdown(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    if (signal) console.error(`[dev] ${label} stopped by ${signal}`);
    else if (code !== 0) console.error(`[dev] ${label} exited with status ${code ?? 1}`);
    shutdown(code ?? 1);
  });
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

for (const [signal, exitCode] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
  ["SIGHUP", 129],
]) {
  process.once(signal, () => shutdown(exitCode));
}

const workerEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("KIRJOLAB_MODEL_")));
start("local Worker", "npm", ["run", "dev:worker"], workerEnvironment);

if (process.env.KIRJOLAB_MODEL_UPSTREAM) {
  start("model companion", "npm", ["run", "model:companion"], process.env);
} else {
  console.log("[dev] Model companion skipped: KIRJOLAB_MODEL_UPSTREAM is not configured.");
}
