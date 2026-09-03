import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { reportMutationResults } from "./report-mutation-results.mjs";

const defaultReportFile = "reports/mutation/mutation.json";

export function mutationReportFingerprint(reportFile = defaultReportFile) {
  try {
    const { mtimeNs, size } = statSync(reportFile, { bigint: true });
    return `${mtimeNs}:${size}`;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function spawnStryker(args) {
  return new Promise((resolve) => {
    const executable = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "stryker.cmd" : "stryker");
    const child = spawn(executable, ["run", ...args], { env: process.env, stdio: "inherit" });

    child.once("error", (error) => {
      console.error(`[mutation-report] Could not start Stryker: ${error.message}`);
      resolve(1);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
}

export async function runMutation({
  args = process.argv.slice(2),
  fingerprint = mutationReportFingerprint,
  report = reportMutationResults,
  reportFile = defaultReportFile,
  run = spawnStryker,
} = {}) {
  const before = fingerprint(reportFile);
  const exitCode = await run(args);
  const after = fingerprint(reportFile);

  if (after !== null && after !== before) {
    try {
      report(reportFile);
    } catch (error) {
      console.error(`[mutation-report] Could not summarize the new mutation report: ${error.message}`);
      return exitCode === 0 ? 1 : exitCode;
    }
  }

  return exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runMutation();
}
