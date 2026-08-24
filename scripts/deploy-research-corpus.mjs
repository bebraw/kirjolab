import process from "node:process";
import { requiredEnvironmentValue, runDeployEntrypoint, runWrangler } from "./deploy-cli.mjs";
import { productionConfiguration, productionWranglerEnvironment } from "./deploy-production.mjs";

const corpusConfigPath = "wrangler.corpus.jsonc";

export function corpusProductionConfiguration(environment = process.env) {
  const corpusUrl = requiredEnvironmentValue(environment, "KIRJOLAB_CORPUS_PRODUCTION_URL");
  const corpusAccessAudience = requiredEnvironmentValue(environment, "KIRJOLAB_CORPUS_ACCESS_AUD");
  const primary = productionConfiguration({
    ...environment,
    KIRJOLAB_ACCESS_AUD: corpusAccessAudience,
    KIRJOLAB_CROSSREF_MAILTO: "",
  });
  const base = productionConfiguration({
    ...environment,
    KIRJOLAB_PRODUCTION_URL: corpusUrl,
    KIRJOLAB_ACCESS_AUD: corpusAccessAudience,
    KIRJOLAB_CROSSREF_MAILTO: "",
  });
  const allowedOrigins = requiredEnvironmentValue(environment, "KIRJOLAB_CORPUS_ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((origin) => {
      productionConfiguration({
        ...environment,
        KIRJOLAB_PRODUCTION_URL: origin,
        KIRJOLAB_ACCESS_AUD: corpusAccessAudience,
        KIRJOLAB_CROSSREF_MAILTO: "",
      });
      return new URL(origin).origin;
    });
  if (allowedOrigins.length === 0 || new Set(allowedOrigins).size !== allowedOrigins.length) {
    throw new Error("KIRJOLAB_CORPUS_ALLOWED_ORIGINS must contain unique HTTPS application origins");
  }
  if (allowedOrigins.includes(new URL(corpusUrl).origin)) {
    throw new Error("KIRJOLAB_CORPUS_PRODUCTION_URL must differ from every allowed application origin");
  }
  if (base.hostname === primary.hostname) {
    throw new Error("KIRJOLAB_CORPUS_PRODUCTION_URL must differ from KIRJOLAB_PRODUCTION_URL");
  }
  return {
    hostname: base.hostname,
    teamDomain: base.teamDomain,
    accessAudience: base.accessAudience,
    allowedOrigins,
  };
}

export function corpusDeployArguments(configuration, dryRun) {
  return [
    "deploy",
    "--config",
    corpusConfigPath,
    ...(dryRun ? ["--strict"] : []),
    "--minify",
    "--domain",
    configuration.hostname,
    "--var",
    "AUTH_MODE:access",
    "--var",
    `ACCESS_TEAM_DOMAIN:${configuration.teamDomain}`,
    "--var",
    `ACCESS_AUD:${configuration.accessAudience}`,
    "--var",
    `CORPUS_ALLOWED_ORIGINS:${configuration.allowedOrigins.join(",")}`,
    ...(dryRun ? ["--dry-run"] : []),
  ];
}

export function corpusTypeCheckArguments() {
  return [
    "types",
    "research-corpus-configuration.d.ts",
    "--check",
    "--config",
    corpusConfigPath,
    "--env-interface",
    "ResearchCorpusBindings",
    "--include-runtime",
    "false",
    "--strict-vars",
    "false",
  ];
}

export function runCorpusProductionDeploy({ environment = process.env, dryRunOnly = false, run = runWrangler } = {}) {
  const configuration = corpusProductionConfiguration(environment);
  const wranglerEnvironment = productionWranglerEnvironment(environment);
  console.log(`[corpus:deploy] Production hostname: ${configuration.hostname}`);
  console.log(`[corpus:deploy] Allowed frontend origins: ${configuration.allowedOrigins.join(", ")}`);
  console.log("[corpus:deploy] Checking generated corpus binding types");
  run(corpusTypeCheckArguments(), wranglerEnvironment);
  console.log("[corpus:deploy] Running strict production dry run");
  run(corpusDeployArguments(configuration, true), wranglerEnvironment);
  if (dryRunOnly) {
    console.log("[corpus:deploy] Production dry run passed; no Worker was uploaded");
    return;
  }
  console.log("[corpus:deploy] Uploading Research Corpus Worker");
  run(corpusDeployArguments(configuration, false), wranglerEnvironment);
  console.log("[corpus:deploy] Inspecting deployed corpus versions");
  run(["versions", "list", "--config", corpusConfigPath], wranglerEnvironment);
}

function corpusDeploymentError(error) {
  return error instanceof Error ? error.message : String(error);
}

runDeployEntrypoint(import.meta.url, runCorpusProductionDeploy, corpusDeploymentError);
