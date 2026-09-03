import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";

import { createWranglerLog } from "./e2e-wrangler-log.mjs";

const persistenceDirectory = await mkdtemp(join(tmpdir(), "kirjolab-e2e-"));
const wranglerLog = await createWranglerLog(persistenceDirectory);
const port = process.env.KIRJOLAB_E2E_PORT ?? "8788";
const inspectorPort = process.env.KIRJOLAB_E2E_INSPECTOR_PORT ?? "9230";
const gitHubVariables = process.env.KIRJOLAB_E2E_GITHUB === "disabled" ? [] : gitHubTestVariables();
const wrangler = spawn(
  "./node_modules/.bin/wrangler",
  [
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    port,
    "--var",
    "AUTH_MODE:local",
    "ARTIFACT_ANALYSIS_MODE:disabled",
    ...gitHubVariables,
    "--inspector-ip",
    "127.0.0.1",
    "--inspector-port",
    inspectorPort,
    "--persist-to",
    persistenceDirectory,
    "--log-level",
    "error",
    "--show-interactive-dev-session=false",
  ],
  {
    stdio: wranglerLog.stdio,
    env: {
      ...process.env,
      CHOKIDAR_USEPOLLING: "1",
      CHOKIDAR_INTERVAL: "200",
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
      HOME: process.cwd(),
      KIRJOLAB_BROWSER_SHELL_MODE: "development",
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

const stoppedUnexpectedly = !requestedSignal && ("error" in result || result.signal || result.code !== 0);
const wranglerOutput = stoppedUnexpectedly ? await wranglerLog.readTail() : "";
if (!stoppedUnexpectedly) await wranglerLog.close();
await rm(persistenceDirectory, { recursive: true, force: true });

if (stoppedUnexpectedly) {
  const reason = "error" in result ? result.error.message : `code=${result.code ?? "none"}, signal=${result.signal ?? "none"}`;
  process.stderr.write(`[e2e:server] Wrangler stopped unexpectedly (${reason}).\n${wranglerOutput}`);
}

if ("error" in result) throw result.error;
if (!requestedSignal && result.signal) process.kill(process.pid, result.signal);
process.exitCode = requestedSignal ? 0 : (result.code ?? 1);

function gitHubTestVariables() {
  // This ephemeral key is not registered with GitHub; it only exercises the configured deployment path.
  const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ format: "pem", type: "pkcs1" })
    .toString()
    .replaceAll("\n", "\\n");
  return [
    "GITHUB_APP_ID:1",
    "GITHUB_APP_CLIENT_ID:test-client",
    "GITHUB_APP_SLUG:kirjolab-test",
    `GITHUB_APP_PRIVATE_KEY:${privateKey}`,
    "GITHUB_APP_CLIENT_SECRET:test-client-secret-1234",
    "GITHUB_CONNECTION_ENCRYPTION_KEY:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ];
}
