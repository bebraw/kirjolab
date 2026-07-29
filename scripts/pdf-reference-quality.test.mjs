import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePdfReferenceCorpus, pdfReferenceQualityMarkdown } from "./pdf-reference-quality.mjs";

test("evaluates reference signals and renders actionable failures", () => {
  const samples = [
    {
      name: "mixed result",
      pages: [["References"]],
      expected: {
        headingPage: 1,
        references: [{ doi: "10.1000/expected" }],
        mentions: [{ reference: { doi: "10.1000/expected" }, page: 1, style: "numeric" }],
      },
    },
  ];
  const report = evaluatePdfReferenceCorpus(samples, () => ({
    referencesStartPage: 2,
    candidates: [{ id: "candidate", doi: "10.1000/other", title: "Other" }],
    mentions: [{ candidateId: "candidate", page: 1, style: "numeric" }],
  }));

  assert.deepEqual(report.metrics.headings, {
    truePositive: 0,
    falsePositive: 1,
    falseNegative: 1,
    precision: 0,
    recall: 0,
    f1: 0,
  });
  assert.equal(report.failures.length, 5);
  assert.match(pdfReferenceQualityMarkdown(report), /reference missed/u);
  assert.match(pdfReferenceQualityMarkdown({ ...report, failures: [] }), /- None/u);
});
