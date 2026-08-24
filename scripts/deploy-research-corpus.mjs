import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { productionConfiguration, productionWranglerEnvironment } from "./deploy-production.mjs";

const corpusConfigPath = "wrangler.corpus.jsonc";

export function corpusProductionConfiguration(environment = process.env) {
  const corpusUrl = required(environment, "KIRJOLAB_CORPUS_PRODUCTION_URL");
  const corpusAccessAudience = required(environment, "KIRJOLAB_CORPUS_ACCESS_AUD");
  const base = productionConfiguration({
    ...environment,
    KIRJOLAB_PRODUCTION_URL: corpusUrl,
    KIRJOLAB_ACCESS_AUD: corpusAccessAudience,
    KIRJOLAB_CROSSREF_MAILTO: "",
  });
  const allowedOrigins = required(environment, "KIRJOLAB_CORPUS_ALLOWED_ORIGINS")
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

function required(environment, name) {
  const value = environment[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function runWrangler(arguments_, environment) {
  const executable = fileURLToPath(new URL("../node_modules/.bin/wrangler", import.meta.url));
  const result = spawnSync(executable, arguments_, {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status ?? "unknown"}`);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    runCorpusProductionDeploy({ dryRunOnly: process.argv.slice(2).includes("--dry-run-only") });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
