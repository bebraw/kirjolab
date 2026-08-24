import { describe, expect, it, vi } from "vitest";
import { corpusDeployArguments, corpusProductionConfiguration, runCorpusProductionDeploy } from "../scripts/deploy-research-corpus.mjs";

const validEnvironment = {
  KIRJOLAB_CORPUS_PRODUCTION_URL: "https://corpus.kirjolab.test",
  KIRJOLAB_CORPUS_ALLOWED_ORIGINS: "https://write.kirjolab.test,https://lab.kirjolab.test",
  KIRJOLAB_ACCESS_TEAM_DOMAIN: "https://research.cloudflareaccess.com",
  KIRJOLAB_CORPUS_ACCESS_AUD: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("Research Corpus production deployment", () => {
  it("validates and normalizes its hostname, Access identity, and exact origins", () => {
    expect(corpusProductionConfiguration(validEnvironment)).toEqual({
      hostname: "corpus.kirjolab.test",
      teamDomain: "https://research.cloudflareaccess.com",
      accessAudience: validEnvironment.KIRJOLAB_CORPUS_ACCESS_AUD,
      allowedOrigins: ["https://write.kirjolab.test", "https://lab.kirjolab.test"],
    });
  });

  it.each([
    ["missing URL", { KIRJOLAB_CORPUS_PRODUCTION_URL: "" }],
    ["HTTP URL", { KIRJOLAB_CORPUS_PRODUCTION_URL: "http://corpus.kirjolab.test" }],
    ["missing origins", { KIRJOLAB_CORPUS_ALLOWED_ORIGINS: "" }],
    ["missing corpus audience", { KIRJOLAB_CORPUS_ACCESS_AUD: "" }],
    ["origin path", { KIRJOLAB_CORPUS_ALLOWED_ORIGINS: "https://write.kirjolab.test/path" }],
    ["HTTP origin", { KIRJOLAB_CORPUS_ALLOWED_ORIGINS: "http://write.kirjolab.test" }],
  ])("rejects %s", (_label, override) => {
    expect(() => corpusProductionConfiguration({ ...validEnvironment, ...override })).toThrow();
  });

  it("targets the corpus config and supplies hosted auth only through deploy arguments", () => {
    const args = corpusDeployArguments(corpusProductionConfiguration(validEnvironment), true);
    expect(args).toContain("wrangler.corpus.jsonc");
    expect(args).toContain("AUTH_MODE:access");
    expect(args).toContain(`CORPUS_ALLOWED_ORIGINS:${validEnvironment.KIRJOLAB_CORPUS_ALLOWED_ORIGINS}`);
    expect(args).toContain("--dry-run");
  });

  it("runs a strict dry run before upload and supports review-only execution", () => {
    const run = vi.fn();
    runCorpusProductionDeploy({ environment: validEnvironment, dryRunOnly: true, run });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]?.[0]).toEqual([
      "types",
      "research-corpus-configuration.d.ts",
      "--check",
      "--config",
      "wrangler.corpus.jsonc",
      "--env-interface",
      "ResearchCorpusBindings",
      "--include-runtime",
      "false",
      "--strict-vars",
      "false",
    ]);
    expect(run.mock.calls[1]?.[0]).toContain("--dry-run");

    run.mockClear();
    runCorpusProductionDeploy({ environment: validEnvironment, run });
    expect(run).toHaveBeenCalledTimes(4);
    expect(run.mock.calls[1]?.[0]).toContain("--dry-run");
    expect(run.mock.calls[2]?.[0]).not.toContain("--dry-run");
    expect(run.mock.calls[3]?.[0]).toEqual(["versions", "list", "--config", "wrangler.corpus.jsonc"]);
  });
});
