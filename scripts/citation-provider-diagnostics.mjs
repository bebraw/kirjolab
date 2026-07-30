export const citationProviderSeedCorpus = [
  {
    name: "Bloom two-sigma problem",
    doi: "10.3102/0013189x013006004",
  },
];

export async function evaluateCitationProviders(seeds, providers, now = () => Date.now()) {
  const observations = [];
  for (const seed of seeds) {
    for (const [direction, provider, retrieve] of [
      ["references", "crossref", providers.references],
      ["citations", "semantic-scholar", providers.citations],
    ]) {
      const startedAt = now();
      try {
        const result = await retrieve(seed.doi);
        observations.push({
          seed: seed.name,
          doi: seed.doi,
          provider,
          direction,
          status: "available",
          candidates: result.candidates.length,
          completeness: completeness(result.candidates),
          truncated: result.truncated,
          latencyMilliseconds: Math.max(0, now() - startedAt),
          error: null,
        });
      } catch (error) {
        observations.push({
          seed: seed.name,
          doi: seed.doi,
          provider,
          direction,
          status: "unavailable",
          candidates: 0,
          completeness: { title: 0, authors: 0, year: 0 },
          truncated: false,
          latencyMilliseconds: Math.max(0, now() - startedAt),
          error: error instanceof Error ? error.message : "Unknown provider failure",
        });
      }
    }
  }
  return { corpusVersion: 1, seeds: seeds.length, observations };
}

export function citationProviderDiagnosticsMarkdown(report) {
  const rows = report.observations
    .map(
      (item) =>
        `| ${item.seed} | ${item.direction} · ${item.provider} | ${item.status} | ${item.candidates} | ${percent(item.completeness.title)} | ${percent(item.completeness.authors)} | ${percent(item.completeness.year)} | ${item.truncated ? "yes" : "no"} | ${item.latencyMilliseconds} ms |`,
    )
    .join("\n");
  const failures = report.observations.filter(({ error }) => error).map((item) => `- ${item.seed} · ${item.provider}: ${item.error}`);
  return [
    "# Citation Provider Coverage",
    "",
    `Live advisory probe · corpus v${report.corpusVersion} · ${report.seeds} seed${report.seeds === 1 ? "" : "s"}`,
    "",
    "| Seed | Direction · provider | Status | DOI candidates | Titles | Authors | Years | Truncated | Latency |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: |",
    rows,
    "",
    "## Provider failures",
    "",
    ...(failures.length ? failures : ["- None"]),
    "",
    "Counts reflect the providers' current indexes and are not a hard quality threshold.",
  ].join("\n");
}

function completeness(candidates) {
  if (candidates.length === 0) return { title: 1, authors: 1, year: 1 };
  return {
    title: ratio(candidates.filter(({ title }) => title.trim()).length, candidates.length),
    authors: ratio(candidates.filter(({ authors }) => authors.trim()).length, candidates.length),
    year: ratio(candidates.filter(({ year }) => year.trim()).length, candidates.length),
  };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
