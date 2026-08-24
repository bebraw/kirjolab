import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const wranglerExecutable = fileURLToPath(new URL("../node_modules/.bin/wrangler", import.meta.url));

export function requiredEnvironmentValue(environment, name, messageSuffix = "") {
  const value = environment[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required${messageSuffix}`);
  return value;
}

export function runWrangler(arguments_, environment) {
  const result = spawnSync(wranglerExecutable, arguments_, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status ?? "unknown"}`);
}

export function runDeployEntrypoint(moduleUrl, deploy, formatError) {
  const entry = process.argv[1];
  if (!entry || moduleUrl !== pathToFileURL(entry).href) return;
  try {
    deploy({ dryRunOnly: process.argv.slice(2).includes("--dry-run-only") });
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}
