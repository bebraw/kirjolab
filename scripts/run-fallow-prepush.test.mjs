import assert from "node:assert/strict";
import test from "node:test";
import { auditSummary, healthSummary } from "./run-fallow-prepush.mjs";

test("summarizes the Fallow new-only audit verdict", () => {
  assert.equal(
    auditSummary({
      verdict: "fail",
      attribution: { dead_code_introduced: 0, complexity_introduced: 1, duplication_introduced: 1 },
    }),
    "Fallow audit: fail (2 introduced findings)",
  );
});

test("summarizes the full Fallow health score and deductions", () => {
  assert.equal(
    healthSummary({
      health_score: {
        score: 77.1,
        grade: "B",
        penalties: { dead_files: 0, hotspots: 10, unit_size: 10, coupling: 2.4 },
      },
    }),
    "Fallow health: 77.1 B (hotspots -10.0 · unit size -10.0 · coupling -2.4)",
  );
});
