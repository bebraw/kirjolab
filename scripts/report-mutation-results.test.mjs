import assert from "node:assert/strict";
import test from "node:test";

import { formatMutationSummary, summarizeMutationReport } from "./report-mutation-results.mjs";

const report = {
  files: {
    "src/a.ts": {
      mutants: [
        { status: "Killed", static: false },
        { status: "Killed", static: false },
        { status: "Timeout", static: false },
        { status: "Survived", static: true },
        { status: "Survived", static: false },
        { status: "NoCoverage", static: true },
      ],
    },
    "src/b.ts": {
      mutants: [
        { status: "Killed", static: true },
        { status: "Survived", static: false },
        { status: "NoCoverage", static: false },
        { status: "NoCoverage", static: false },
        { status: "CompileError", static: true },
      ],
    },
    "src/c.ts": {
      mutants: [
        { status: "RuntimeError", static: false },
        { status: "Ignored", static: false },
      ],
    },
  },
  framework: { name: "StrykerJS", version: "10.0.0" },
  thresholds: { break: 39, high: 90, low: 80 },
};

test("summarizes score semantics, static mutants, and highest-impact files", () => {
  const summary = summarizeMutationReport(report, { hotspotLimit: 2 });

  assert.deepEqual(summary.counts, {
    CompileError: 1,
    Ignored: 1,
    Killed: 3,
    NoCoverage: 3,
    RuntimeError: 1,
    Survived: 3,
    Timeout: 1,
  });
  assert.equal(summary.totalMutants, 13);
  assert.equal(summary.mutationScore, 40);
  assert.equal(summary.coveredMutationScore, (4 / 7) * 100);
  assert.equal(summary.thresholdMargin, 1);
  assert.deepEqual(summary.staticCounts, {
    CompileError: 1,
    Killed: 1,
    NoCoverage: 1,
    Survived: 1,
  });
  assert.deepEqual(
    summary.hotspots.map(({ file, missed, noCoverage, survived }) => ({ file, missed, noCoverage, survived })),
    [
      { file: "src/b.ts", missed: 3, noCoverage: 2, survived: 1 },
      { file: "src/a.ts", missed: 3, noCoverage: 1, survived: 2 },
    ],
  );
});

test("formats a concise terminal summary with report paths", () => {
  const output = formatMutationSummary(summarizeMutationReport(report), {
    htmlReport: "reports/mutation/index.html",
    jsonReport: "reports/mutation/mutation.json",
  });

  assert.match(
    output,
    /^\[mutation-report\] StrykerJS 10\.0\.0: 40\.00% \(floor 39\.00%, pass by 1\.00 pp\); covered-code score 57\.14%\./u,
  );
  assert.match(output, /13 mutants: 3 killed, 1 timeout, 3 survived, 3 no coverage, 2 errors, 1 ignored\./u);
  assert.match(output, /Static mutants: 4 \(30\.77% of all\): 1 killed, 0 timeout, 1 survived, 1 no coverage, 1 error, 0 ignored\./u);
  assert.match(output, /Highest-impact files by survived \+ no-coverage mutants:/u);
  assert.match(output, /src\/b\.ts — 3 missed \(1 survived, 2 no coverage\), 25\.00% score/u);
  assert.match(output, /HTML: reports\/mutation\/index\.html/u);
  assert.match(output, /JSON: reports\/mutation\/mutation\.json/u);
});

test("distinguishes the current floor from the floor recorded by an older report", () => {
  const output = formatMutationSummary(summarizeMutationReport(report, { configuredBreakThreshold: 41 }));

  assert.match(output, /40\.00% \(floor 41\.00%, fail by 1\.00 pp; report recorded floor 39\.00%\)/u);
});
