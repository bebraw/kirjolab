import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { getRepoRoot, spawn } from "./affected-file-utils.mjs";

export function auditSummary(report) {
  const attribution = report.attribution ?? {};
  const introduced =
    Number(attribution.dead_code_introduced ?? 0) +
    Number(attribution.complexity_introduced ?? 0) +
    Number(attribution.duplication_introduced ?? 0);
  return `Fallow audit: ${report.verdict ?? "unknown"} (${introduced} introduced finding${introduced === 1 ? "" : "s"})`;
}

export function healthSummary(report) {
  const health = report.health_score;
  if (!health || typeof health.score !== "number" || typeof health.grade !== "string") {
    throw new Error("Fallow health report did not include a score");
  }
  const deductions = Object.entries(health.penalties ?? {})
    .filter(([, value]) => typeof value === "number" && value > 0)
    .map(([name, value]) => `${name.replaceAll("_", " ")} -${value.toFixed(1)}`)
    .join(" · ");
  return `Fallow health: ${health.score.toFixed(1)} ${health.grade}${deductions ? ` (${deductions})` : ""}`;
}

function parseReport(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${label} did not return a JSON report`);
  }
}

function main() {
  const repoRoot = getRepoRoot();
  const fallow = join(repoRoot, "node_modules", ".bin", "fallow");
  const auditResult = spawn(repoRoot, fallow, ["audit", "--max-crap", "100", "--quiet", "--no-cache", "--format", "json"], {
    allowFailure: true,
    encoding: "utf8",
  });
  const audit = parseReport(auditResult, "Fallow audit");
  console.log(auditSummary(audit));
  if ((auditResult.status ?? 1) !== 0) {
    console.error("Run `npm run diagnostics:readability` for details.");
    process.exit(auditResult.status ?? 1);
  }

  const healthResult = spawn(
    repoRoot,
    fallow,
    ["health", "--score", "--hotspots", "--targets", "--quiet", "--no-cache", "--format", "json"],
    { allowFailure: true, encoding: "utf8" },
  );
  const health = parseReport(healthResult, "Fallow health");
  console.log(healthSummary(health));
  if ((healthResult.status ?? 1) !== 0) process.exit(healthResult.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
