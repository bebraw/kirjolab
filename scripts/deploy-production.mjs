import process from "node:process";
import { requiredEnvironmentValue, runDeployEntrypoint, runWrangler } from "./deploy-cli.mjs";

const placeholder = /(?:<|>|example|change[-_ ]?me|replace|todo)/iu;
const loopbackHost = /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/iu;
const audience = /^[a-z0-9_-]{20,200}$/iu;
const accessTeamDomain = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/iu;

export function productionConfiguration(environment = process.env) {
  const productionUrl = requiredEnvironmentValue(environment, "KIRJOLAB_PRODUCTION_URL", " for production deployment");
  const teamDomain = requiredEnvironmentValue(environment, "KIRJOLAB_ACCESS_TEAM_DOMAIN", " for production deployment").replace(/\/$/u, "");
  const accessAudience = requiredEnvironmentValue(environment, "KIRJOLAB_ACCESS_AUD", " for production deployment");
  const crossrefMailto = environment.KIRJOLAB_CROSSREF_MAILTO?.trim() ?? "";

  let url;
  try {
    url = new URL(productionUrl);
  } catch {
    throw new Error("KIRJOLAB_PRODUCTION_URL must be an absolute HTTPS URL");
  }
  if (isInvalidProductionUrl(url)) {
    throw new Error("KIRJOLAB_PRODUCTION_URL must be the root of a non-placeholder HTTPS custom hostname");
  }
  if (!accessTeamDomain.test(teamDomain) || placeholder.test(teamDomain)) {
    throw new Error("KIRJOLAB_ACCESS_TEAM_DOMAIN must be an exact non-placeholder Cloudflare Access team domain");
  }
  if (!audience.test(accessAudience) || placeholder.test(accessAudience)) {
    throw new Error("KIRJOLAB_ACCESS_AUD must be the exact non-placeholder Access application audience");
  }
  if (crossrefMailto && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(crossrefMailto)) {
    throw new Error("KIRJOLAB_CROSSREF_MAILTO must be blank or a valid email address");
  }

  return {
    hostname: url.hostname,
    teamDomain,
    accessAudience,
    crossrefMailto,
  };
}

export function deployArguments(configuration, dryRun) {
  return [
    "deploy",
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
    `CROSSREF_MAILTO:${configuration.crossrefMailto}`,
    ...(dryRun ? ["--dry-run"] : []),
  ];
}

export function runProductionDeploy({ environment = process.env, dryRunOnly = false, run = runWrangler } = {}) {
  const configuration = productionConfiguration(environment);
  const wranglerEnvironment = productionWranglerEnvironment(environment);
  console.log(`[deploy] Production hostname: ${configuration.hostname}`);
  console.log("[deploy] Checking generated Worker bindings");
  run(["types", "--check"], wranglerEnvironment);
  console.log("[deploy] Running strict production dry run");
  run(deployArguments(configuration, true), wranglerEnvironment);
  if (dryRunOnly) {
    console.log("[deploy] Production dry run passed; no Worker was uploaded");
    return;
  }
  console.log("[deploy] Uploading production Worker");
  run(deployArguments(configuration, false), wranglerEnvironment);
  console.log("[deploy] Inspecting deployed versions");
  run(["versions", "list"], wranglerEnvironment);
}

export function productionWranglerEnvironment(environment = process.env) {
  return {
    ...environment,
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    KIRJOLAB_BROWSER_SHELL_MODE: "production",
  };
}

function isInvalidProductionUrl(url) {
  return [
    url.protocol !== "https:",
    Boolean(url.username),
    Boolean(url.password),
    Boolean(url.port),
    url.pathname !== "/",
    Boolean(url.search),
    Boolean(url.hash),
    url.hostname.endsWith("."),
    loopbackHost.test(url.hostname),
    url.hostname.endsWith(".workers.dev"),
    url.hostname.endsWith(".pages.dev"),
    placeholder.test(url.hostname),
  ].includes(true);
}

function productionDeploymentError(error) {
  return `[deploy] ${error instanceof Error ? error.message : "Production deployment failed"}`;
}

runDeployEntrypoint(import.meta.url, runProductionDeploy, productionDeploymentError);
