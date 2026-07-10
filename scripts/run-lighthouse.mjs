import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { launch as launchChrome } from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const DEFAULT_REPORT_DIR = "reports/lighthouse";
const DEFAULT_SERVER_START_TIMEOUT_MS = 120_000;
const DEFAULT_MIN_PERFORMANCE_SCORE = 90;
const READY_POLL_INTERVAL_MS = 1_000;

const auditModes = [
  { id: "mobile", config: undefined },
  { id: "desktop", config: desktopConfig },
];

const helpText = `
Run Lighthouse against a local or remote app and write HTML/JSON reports.

Environment variables:
  LIGHTHOUSE_URL                  Required. URL to audit.
  LIGHTHOUSE_SERVER_COMMAND       Optional. Local server command to start before auditing.
  LIGHTHOUSE_SERVER_READY_URL     Optional. URL to poll for server readiness. Defaults to LIGHTHOUSE_URL.
  LIGHTHOUSE_SERVER_START_TIMEOUT_MS
                                  Optional. Server start timeout in milliseconds. Defaults to 120000.
  LIGHTHOUSE_MIN_PERFORMANCE_SCORE
                                  Optional. Minimum performance score per mode. Defaults to 90.
  LIGHTHOUSE_REPORT_DIR           Optional. Output directory. Defaults to reports/lighthouse.

Examples:
  LIGHTHOUSE_URL=http://127.0.0.1:3000 npm run lighthouse
  LIGHTHOUSE_URL=http://127.0.0.1:3000 LIGHTHOUSE_SERVER_COMMAND="npm run dev" npm run lighthouse
`.trim();

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(helpText);
  process.exit(0);
}

const targetUrl = readRequiredUrl("LIGHTHOUSE_URL");
const reportDir = resolve(process.cwd(), process.env.LIGHTHOUSE_REPORT_DIR || DEFAULT_REPORT_DIR);
const readyUrl = process.env.LIGHTHOUSE_SERVER_READY_URL || targetUrl;
const serverCommand = process.env.LIGHTHOUSE_SERVER_COMMAND;
const serverStartTimeoutMs = readIntegerEnv("LIGHTHOUSE_SERVER_START_TIMEOUT_MS", DEFAULT_SERVER_START_TIMEOUT_MS);
const minPerformanceScore = readIntegerEnv("LIGHTHOUSE_MIN_PERFORMANCE_SCORE", DEFAULT_MIN_PERFORMANCE_SCORE);

await main();

async function main() {
  await mkdir(reportDir, { recursive: true });

  let server;

  try {
    if (serverCommand) {
      server = await startServer(serverCommand);
    }

    const chromePath = chromium.executablePath();
    const results = [];

    for (const mode of auditModes) {
      const result = await runAudit({
        mode,
        chromePath,
      });
      results.push(result);
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      url: targetUrl,
      minPerformanceScore,
      modes: results,
    };

    await writeFile(resolve(reportDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

    printSummary(results);
    assertBudgets(results);
  } finally {
    if (server) {
      await stopServer(server);
    }
  }
}

async function startServer(command) {
  const server = spawn(command, {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: { ...process.env, CI: "1" },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (chunk) => process.stdout.write(`[lighthouse-server] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[lighthouse-server] ${chunk}`));

  try {
    await waitForUrl(readyUrl, serverStartTimeoutMs);
    return server;
  } catch (error) {
    terminateServer(server, "SIGTERM");
    throw error;
  }
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
      });

      if (response.status >= 100 && response.status < 600) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await delay(READY_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for Lighthouse server at ${url}.`);
}

async function stopServer(server) {
  if (server.exitCode !== null) {
    return;
  }

  terminateServer(server, "SIGTERM");

  await Promise.race([
    new Promise((resolvePromise) => server.once("exit", resolvePromise)),
    new Promise((resolvePromise) =>
      setTimeout(() => {
        if (server.exitCode === null) {
          terminateServer(server, "SIGKILL");
        }
        resolvePromise();
      }, 5_000),
    ),
  ]);
}

function terminateServer(server, signal) {
  if (process.platform !== "win32" && typeof server.pid === "number") {
    try {
      process.kill(-server.pid, signal);
      return;
    } catch {
      // Fall back to the direct child if the process group is already gone.
    }
  }

  server.kill(signal);
}

async function runAudit({ mode, chromePath }) {
  const chrome = await launchChrome({
    chromePath,
    chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"],
  });

  try {
    const runnerResult = await lighthouse(
      targetUrl,
      {
        port: chrome.port,
        logLevel: "error",
        output: ["html", "json"],
        onlyCategories: ["performance"],
      },
      mode.config,
    );

    if (!runnerResult?.lhr || !runnerResult.report) {
      throw new Error(`Lighthouse did not produce a report for ${mode.id}.`);
    }

    const reports = Array.isArray(runnerResult.report) ? runnerResult.report : [runnerResult.report];
    const [htmlReport, jsonReport] = reports;

    await writeFile(resolve(reportDir, `${mode.id}.html`), htmlReport, "utf8");
    await writeFile(resolve(reportDir, `${mode.id}.json`), jsonReport, "utf8");

    return summarizeMode(mode.id, runnerResult.lhr);
  } finally {
    await chrome.kill();
  }
}

function summarizeMode(modeId, lhr) {
  return {
    mode: modeId,
    performanceScore: percentage(lhr.categories.performance?.score),
    firstContentfulPaintMs: numericAudit(lhr, "first-contentful-paint"),
    largestContentfulPaintMs: numericAudit(lhr, "largest-contentful-paint"),
    speedIndexMs: numericAudit(lhr, "speed-index"),
    totalBlockingTimeMs: numericAudit(lhr, "total-blocking-time"),
    cumulativeLayoutShift: numericAudit(lhr, "cumulative-layout-shift"),
    interactionToNextPaintMs: numericAudit(lhr, "interaction-to-next-paint"),
    transferSizeBytes: numericAudit(lhr, "total-byte-weight"),
    renderBlockingSavingsMs: renderBlockingSavingsMs(lhr),
    unusedCssSavingsBytes: bytesSaved(lhr, "unused-css-rules"),
    unusedJavascriptSavingsBytes: bytesSaved(lhr, "unused-javascript"),
  };
}

function numericAudit(lhr, auditId) {
  const value = lhr.audits[auditId]?.numericValue;
  return typeof value === "number" ? Math.round(value) : null;
}

function renderBlockingSavingsMs(lhr) {
  const value = lhr.audits["render-blocking-resources"]?.details?.overallSavingsMs;
  return typeof value === "number" ? Math.round(value) : null;
}

function bytesSaved(lhr, auditId) {
  const items = lhr.audits[auditId]?.details?.items;
  if (!Array.isArray(items)) {
    return null;
  }

  const total = items.reduce((sum, item) => {
    const current = item?.wastedBytes;
    return typeof current === "number" ? sum + current : sum;
  }, 0);

  return total > 0 ? Math.round(total) : null;
}

function percentage(score) {
  return typeof score === "number" ? Math.round(score * 100) : null;
}

function printSummary(results) {
  console.log("\nLighthouse performance summary");

  for (const result of results) {
    console.log(`- ${result.mode}: ${result.performanceScore ?? "n/a"}/100`);
  }

  console.log(`Detailed reports written to ${reportDir}`);
}

function assertBudgets(results) {
  const failed = results.filter((result) => {
    return typeof result.performanceScore === "number" && result.performanceScore < minPerformanceScore;
  });

  if (failed.length === 0) {
    return;
  }

  const details = failed.map((result) => `${result.mode}=${result.performanceScore}`).join(", ");
  throw new Error(`Lighthouse budget failed: ${details} (minimum ${minPerformanceScore}).`);
}

function readRequiredUrl(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.\n\n${helpText}`);
  }

  return new URL(value).toString();
}

function readIntegerEnv(name, fallback) {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be an integer. Received: ${raw}`);
  }

  return parsed;
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
