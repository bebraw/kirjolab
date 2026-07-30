import assert from "node:assert/strict";
import test from "node:test";

import { citationProviderDiagnosticsMarkdown, evaluateCitationProviders } from "./citation-provider-diagnostics.mjs";

test("reports provider coverage, completeness, truncation, latency, and failures", async () => {
  let time = 0;
  const report = await evaluateCitationProviders(
    [{ name: "Seed", doi: "10.1000/seed" }],
    {
      references: async () => ({
        candidates: [
          { doi: "10.1000/a", title: "Complete", authors: "Ada", year: "2026" },
          { doi: "10.1000/b", title: "Partial", authors: "", year: "" },
        ],
        truncated: true,
      }),
      citations: async () => {
        throw new Error("Rate limited");
      },
    },
    () => (time += 5),
  );

  assert.deepEqual(report.observations[0], {
    seed: "Seed",
    doi: "10.1000/seed",
    provider: "crossref",
    direction: "references",
    status: "available",
    candidates: 2,
    completeness: { title: 1, authors: 0.5, year: 0.5 },
    truncated: true,
    latencyMilliseconds: 5,
    error: null,
  });
  assert.equal(report.observations[1].status, "unavailable");
  assert.match(citationProviderDiagnosticsMarkdown(report), /Rate limited/u);
  assert.match(citationProviderDiagnosticsMarkdown(report), /50.0%/u);
  assert.match(citationProviderDiagnosticsMarkdown({ ...report, observations: [report.observations[0]] }), /Provider failures\n\n- None/u);
});
