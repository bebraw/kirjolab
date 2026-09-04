import { spawn } from "node:child_process";
import process from "node:process";

const defaultFetchTimeoutMs = 60_000;
const defaultRetryDelaysMs = [5_000, 15_000];
const completedAuditReportPattern = /(?:^|\r?\n)# npm audit report(?:\r?\n|$)/u;
const retryableRegistryFailurePatterns = [
  /\bnpm warn audit network timeout at:/iu,
  /\bnpm warn audit (?:429|5\d{2})\b/iu,
  /\bnpm error code E(?:429|5\d{2})\b/iu,
  /\b(?:EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)\b/u,
];

export async function runSecurityAudit({
  fetchTimeoutMs = defaultFetchTimeoutMs,
  log = console.error,
  retryDelaysMs = defaultRetryDelaysMs,
  run = runNpmAudit,
  wait = waitFor,
} = {}) {
  const totalAttempts = retryDelaysMs.length + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const result = await run({ fetchTimeoutMs });

    if (result.exitCode === 0) {
      if (attempt > 1) {
        log(`[security:audit] npm audit recovered on attempt ${attempt}/${totalAttempts}.`);
      }

      return 0;
    }

    if (completedAuditReportPattern.test(result.output) || !isRetryableRegistryFailure(result.output) || attempt === totalAttempts) {
      return result.exitCode || 1;
    }

    const retryDelayMs = retryDelaysMs[attempt - 1];
    log(
      `[security:audit] npm registry transport failure on attempt ${attempt}/${totalAttempts}; retrying in ${formatSeconds(retryDelayMs)}.`,
    );
    await wait(retryDelayMs);
  }

  return 1;
}

export function isRetryableRegistryFailure(output) {
  return retryableRegistryFailurePatterns.some((pattern) => pattern.test(output));
}

function runNpmAudit({ fetchTimeoutMs }) {
  return new Promise((resolve) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, ["audit", "--omit=dev", "--audit-level=high", `--fetch-timeout=${fetchTimeoutMs}`], {
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    child.stdout.on("data", (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.once("error", (error) => {
      console.error(`[security:audit] Could not start npm audit: ${error.message}`);
      finish({ exitCode: 1, output });
    });
    child.once("close", (code) => finish({ exitCode: code ?? 1, output }));
  });
}

function waitFor(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function formatSeconds(milliseconds) {
  return `${milliseconds / 1_000}s`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runSecurityAudit();
}
