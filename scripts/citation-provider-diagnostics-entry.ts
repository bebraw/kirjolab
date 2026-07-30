import { fetchCrossrefReferences } from "../src/integrations/crossref";
import { fetchSemanticScholarCitations } from "../src/integrations/semantic-scholar";
import {
  citationProviderDiagnosticsMarkdown,
  citationProviderSeedCorpus,
  evaluateCitationProviders,
} from "./citation-provider-diagnostics.mjs";

const explicitDois = process.argv.flatMap((argument, index, all) => (argument === "--doi" && all[index + 1] ? [all[index + 1]!] : []));
const seeds = explicitDois.length
  ? explicitDois.map((doi, index) => ({ name: `Requested seed ${index + 1}`, doi }))
  : citationProviderSeedCorpus;
const report = await evaluateCitationProviders(seeds, {
  references: async (doi: string) => await fetchCrossrefReferences(doi, process.env.CROSSREF_MAILTO ?? ""),
  citations: async (doi: string) => await fetchSemanticScholarCitations(doi, process.env.SEMANTIC_SCHOLAR_API_KEY ?? ""),
});

console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2) : citationProviderDiagnosticsMarkdown(report));
