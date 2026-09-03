import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

import strykerConfig from "../stryker.config.mjs";

const defaultHotspotLimit = 10;
const knownStatuses = ["Killed", "Timeout", "Survived", "NoCoverage", "CompileError", "RuntimeError", "Ignored"];

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function countFor(counts, status) {
  return counts[status] ?? 0;
}

function calculateScores(counts) {
  const detected = countFor(counts, "Killed") + countFor(counts, "Timeout");
  const survived = countFor(counts, "Survived");
  const noCoverage = countFor(counts, "NoCoverage");
  const valid = detected + survived + noCoverage;
  const covered = detected + survived;

  return {
    coveredMutationScore: covered > 0 ? (detected / covered) * 100 : Number.NaN,
    mutationScore: valid > 0 ? (detected / valid) * 100 : Number.NaN,
  };
}

function summarizeFile(file, mutants) {
  const counts = {};
  for (const mutant of mutants) increment(counts, mutant.status);
  const survived = countFor(counts, "Survived");
  const noCoverage = countFor(counts, "NoCoverage");

  return {
    ...calculateScores(counts),
    counts,
    file,
    missed: survived + noCoverage,
    noCoverage,
    survived,
  };
}

function collectMutationCounts(report) {
  const counts = {};
  const staticCounts = {};
  const files = [];

  for (const [file, fileResult] of Object.entries(report.files ?? {})) {
    const mutants = fileResult.mutants ?? [];
    files.push(summarizeFile(file, mutants));
    for (const mutant of mutants) {
      increment(counts, mutant.status);
      if (mutant.static) increment(staticCounts, mutant.status);
    }
  }

  return { counts, files, staticCounts };
}

function countTotal(counts) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function nonzeroKnownCounts(counts) {
  return Object.fromEntries(knownStatuses.filter((status) => countFor(counts, status) > 0).map((status) => [status, counts[status]]));
}

function rankHotspots(files, limit) {
  return files
    .filter(({ missed }) => missed > 0)
    .sort((left, right) => right.missed - left.missed || right.noCoverage - left.noCoverage || left.file.localeCompare(right.file))
    .slice(0, limit);
}

export function summarizeMutationReport(report, { configuredBreakThreshold, hotspotLimit = defaultHotspotLimit } = {}) {
  const { counts, files, staticCounts } = collectMutationCounts(report);

  const scores = calculateScores(counts);
  const recordedBreakThreshold = Number(report.thresholds?.break);
  const configuredThreshold = Number(configuredBreakThreshold);
  const breakThreshold = Number.isFinite(configuredThreshold) ? configuredThreshold : recordedBreakThreshold;
  const hasBreakThreshold = Number.isFinite(breakThreshold);

  return {
    ...scores,
    breakThreshold: hasBreakThreshold ? breakThreshold : null,
    counts: nonzeroKnownCounts(counts),
    framework: report.framework ?? {},
    hotspots: rankHotspots(files, hotspotLimit),
    recordedBreakThreshold: Number.isFinite(recordedBreakThreshold) ? recordedBreakThreshold : null,
    staticCounts: nonzeroKnownCounts(staticCounts),
    thresholdMargin: hasBreakThreshold && Number.isFinite(scores.mutationScore) ? scores.mutationScore - breakThreshold : null,
    totalMutants: countTotal(counts),
    totalStaticMutants: countTotal(staticCounts),
  };
}

function formatNumber(value) {
  return value.toLocaleString("en-US");
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "n/a";
}

function formatCountedNoun(value, singular, plural = `${singular}s`) {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

function thresholdText(summary) {
  if (summary.breakThreshold === null || summary.thresholdMargin === null) return "no blocking floor";
  const outcome = summary.thresholdMargin >= 0 ? "pass" : "fail";
  const current = `floor ${summary.breakThreshold.toFixed(2)}%, ${outcome} by ${Math.abs(summary.thresholdMargin).toFixed(2)} pp`;
  if (summary.recordedBreakThreshold === null || summary.recordedBreakThreshold === summary.breakThreshold) return current;
  return `${current}; report recorded floor ${summary.recordedBreakThreshold.toFixed(2)}%`;
}

export function formatMutationSummary(
  summary,
  { htmlReport = "reports/mutation/index.html", jsonReport = "reports/mutation/mutation.json" } = {},
) {
  const counts = summary.counts;
  const errors = countFor(counts, "CompileError") + countFor(counts, "RuntimeError");
  const framework = [summary.framework.name, summary.framework.version].filter(Boolean).join(" ") || "Mutation testing";
  const staticPercent = summary.totalMutants > 0 ? (summary.totalStaticMutants / summary.totalMutants) * 100 : 0;
  const lines = [
    `[mutation-report] ${framework}: ${formatPercent(summary.mutationScore)} (${thresholdText(summary)}); covered-code score ${formatPercent(summary.coveredMutationScore)}.`,
    `[mutation-report] ${formatNumber(summary.totalMutants)} mutants: ${formatNumber(countFor(counts, "Killed"))} killed, ${formatNumber(countFor(counts, "Timeout"))} timeout, ${formatNumber(countFor(counts, "Survived"))} survived, ${formatNumber(countFor(counts, "NoCoverage"))} no coverage, ${formatCountedNoun(errors, "error")}, ${formatNumber(countFor(counts, "Ignored"))} ignored.`,
    `[mutation-report] Static mutants: ${formatNumber(summary.totalStaticMutants)} (${staticPercent.toFixed(2)}% of all): ${formatNumber(countFor(summary.staticCounts, "Killed"))} killed, ${formatNumber(countFor(summary.staticCounts, "Timeout"))} timeout, ${formatNumber(countFor(summary.staticCounts, "Survived"))} survived, ${formatNumber(countFor(summary.staticCounts, "NoCoverage"))} no coverage, ${formatCountedNoun(countFor(summary.staticCounts, "CompileError") + countFor(summary.staticCounts, "RuntimeError"), "error")}, ${formatNumber(countFor(summary.staticCounts, "Ignored"))} ignored.`,
  ];

  if (summary.hotspots.length > 0) {
    lines.push("[mutation-report] Highest-impact files by survived + no-coverage mutants:");
    for (const hotspot of summary.hotspots) {
      lines.push(
        `[mutation-report]   ${hotspot.file} — ${formatNumber(hotspot.missed)} missed (${formatNumber(hotspot.survived)} survived, ${formatNumber(hotspot.noCoverage)} no coverage), ${formatPercent(hotspot.mutationScore)} score`,
      );
    }
  }

  lines.push(`[mutation-report] HTML: ${htmlReport}`, `[mutation-report] JSON: ${jsonReport}`);
  return lines.join("\n");
}

export function reportMutationResults(
  reportFile = "reports/mutation/mutation.json",
  { configuredBreakThreshold = strykerConfig.thresholds?.break } = {},
) {
  const report = JSON.parse(readFileSync(reportFile, "utf8"));
  const output = formatMutationSummary(summarizeMutationReport(report, { configuredBreakThreshold }), { jsonReport: reportFile });
  console.log(output);
  return output;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    reportMutationResults(process.argv[2]);
  } catch (error) {
    console.error(`[mutation-report] Could not summarize the mutation report: ${error.message}`);
    process.exitCode = 1;
  }
}
