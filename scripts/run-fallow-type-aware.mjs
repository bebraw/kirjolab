import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { getRepoRoot, spawn } from "./affected-file-utils.mjs";

export const typeAwareArguments = [
  "dead-code",
  "--unused-exports",
  "--unused-types",
  "--unused-class-members",
  "--type-aware",
  "--quiet",
  "--no-cache",
  "--format",
  "json",
];

export function typeAwareSummary(report) {
  const analysis = typeAwareAnalysis(report);
  if (analysis.executed === false) return "Fallow type-aware: not needed (no semantic queries)";
  return `Fallow type-aware: ${analysis.identity.completeness} (${analysis.candidate_count} candidates · ${analysis.confirmed_used_count} confirmed used · ${analysis.contract_preserved_count} contract preserved · ${analysis.abstained_count} abstained)`;
}

function typeAwareAnalysis(report) {
  const analysis = report?._meta?.type_aware;
  if (typeof analysis?.identity?.completeness !== "string") semanticReportError();
  if (analysis.executed !== true && !isNoQueryResult(analysis)) semanticReportError();
  requireSemanticCount(analysis.candidate_count);
  requireSemanticCount(analysis.confirmed_used_count);
  requireSemanticCount(analysis.contract_preserved_count);
  requireSemanticCount(analysis.abstained_count);
  return analysis;
}

function isNoQueryResult(analysis) {
  if (analysis.executed !== false || analysis.identity.completeness !== "complete") return false;
  if (analysis.identity.mode !== "type-aware" || analysis.identity.project_config_hash !== "deferred:no-semantic-queries") {
    return false;
  }
  const counts = [
    analysis.candidate_count,
    analysis.confirmed_used_count,
    analysis.contract_preserved_count,
    analysis.no_static_references_count,
    analysis.fix_eligible_count,
    analysis.unresolved_count,
    analysis.abstained_count,
    analysis.warning_count,
  ];
  return counts.every((count) => count === 0) && Array.isArray(analysis.warnings) && analysis.warnings.length === 0;
}

function requireSemanticCount(value) {
  if (typeof value !== "number") semanticReportError();
}

function semanticReportError() {
  throw new Error("Fallow type-aware report did not include executed semantic analysis or an explicit empty query set");
}

function main() {
  const repoRoot = getRepoRoot();
  const fallow = join(repoRoot, "node_modules", ".bin", "fallow");
  const result = spawn(repoRoot, fallow, typeAwareArguments, { allowFailure: true, encoding: "utf8" });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error("Fallow type-aware analysis did not return a JSON report");
  }
  console.log(typeAwareSummary(report));
  if (result.status !== 0 && result.status !== 1) process.exit(result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
