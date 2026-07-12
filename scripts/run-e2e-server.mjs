import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const persistenceDirectory = await mkdtemp(join(tmpdir(), "kirjolab-e2e-"));
const wrangler = spawn(
  "./node_modules/.bin/wrangler",
  [
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "8788",
    "--inspector-ip",
    "127.0.0.1",
    "--inspector-port",
    "9230",
    "--persist-to",
    persistenceDirectory,
    "--log-level",
    "error",
    "--show-interactive-dev-session=false",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CHOKIDAR_USEPOLLING: "1",
      CHOKIDAR_INTERVAL: "200",
      HOME: process.cwd(),
    },
  },
);

let requestedSignal;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    requestedSignal = signal;
    wrangler.kill(signal);
  });
}

const result = await new Promise((resolve) => {
  wrangler.once("error", (error) => resolve({ error }));
  wrangler.once("exit", (code, signal) => resolve({ code, signal }));
});

await rm(persistenceDirectory, { recursive: true, force: true });

if ("error" in result) throw result.error;
if (!requestedSignal && result.signal) process.kill(process.pid, result.signal);
process.exitCode = requestedSignal ? 0 : (result.code ?? 1);
