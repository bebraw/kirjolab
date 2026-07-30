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
