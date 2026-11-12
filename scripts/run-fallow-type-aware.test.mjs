import assert from "node:assert/strict";
import test from "node:test";
import { typeAwareSummary } from "./run-fallow-type-aware.mjs";

test("summarizes completed and conservative type-aware decisions", () => {
  assert.equal(
    typeAwareSummary({
      _meta: {
        type_aware: {
          executed: true,
          identity: { completeness: "partial" },
          candidate_count: 52,
          confirmed_used_count: 26,
          contract_preserved_count: 6,
          abstained_count: 20,
        },
      },
    }),
    "Fallow type-aware: partial (52 candidates · 26 confirmed used · 6 contract preserved · 20 abstained)",
  );
});

test("rejects reports without an executed semantic pass", () => {
  assert.throws(() => typeAwareSummary({ _meta: { type_aware: { executed: false } } }), /executed semantic analysis/u);
});

function noQueryReport() {
  return {
    _meta: {
      type_aware: {
        executed: false,
        identity: {
          mode: "type-aware",
          completeness: "complete",
          project_config_hash: "deferred:no-semantic-queries",
        },
        candidate_count: 0,
        confirmed_used_count: 0,
        contract_preserved_count: 0,
        no_static_references_count: 0,
        fix_eligible_count: 0,
        unresolved_count: 0,
        abstained_count: 0,
        warning_count: 0,
        warnings: [],
      },
    },
  };
}

test("identifies Fallow's explicit no-query result without claiming semantic execution", () => {
  assert.equal(typeAwareSummary(noQueryReport()), "Fallow type-aware: not needed (no semantic queries)");
});

for (const field of [
  "candidate_count",
  "confirmed_used_count",
  "contract_preserved_count",
  "no_static_references_count",
  "fix_eligible_count",
  "unresolved_count",
  "abstained_count",
  "warning_count",
]) {
  test(`rejects a deferred result with nonzero ${field}`, () => {
    const report = noQueryReport();
    report._meta.type_aware[field] = 1;
    assert.throws(() => typeAwareSummary(report), /executed semantic analysis/u);
  });
}

for (const [field, value] of [
  ["mode", "syntactic"],
  ["completeness", "partial"],
  ["completeness", "unavailable"],
  ["project_config_hash", "unavailable"],
  ["project_config_hash", undefined],
]) {
  test(`rejects unexecuted analysis with ${field}=${value}`, () => {
    const report = noQueryReport();
    report._meta.type_aware.identity[field] = value;
    assert.throws(() => typeAwareSummary(report), /executed semantic analysis/u);
  });
}

test("rejects an inconsistent no-query report carrying warnings", () => {
  const report = noQueryReport();
  report._meta.type_aware.warnings = ["companion unavailable"];
  assert.throws(() => typeAwareSummary(report), /executed semantic analysis/u);
});

test("rejects a no-query report with missing execution state or counters", () => {
  const report = noQueryReport();
  delete report._meta.type_aware.executed;
  assert.throws(() => typeAwareSummary(report), /executed semantic analysis/u);
  report._meta.type_aware.executed = false;
  delete report._meta.type_aware.unresolved_count;
  assert.throws(() => typeAwareSummary(report), /executed semantic analysis/u);
});

test("rejects reports missing semantic metadata with an actionable error", () => {
  for (const report of [null, {}, { _meta: {} }, { _meta: { type_aware: { executed: true } } }]) {
    assert.throws(() => typeAwareSummary(report), /executed semantic analysis/u);
  }
});
