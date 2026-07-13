import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const placeholder = /(?:<|>|example|change[-_ ]?me|replace|todo)/iu;
const loopbackHost = /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/iu;
const audience = /^[a-z0-9_-]{20,200}$/iu;
const accessTeamDomain = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/iu;

export function productionConfiguration(environment = process.env) {
  const productionUrl = required(environment, "KIRJOLAB_PRODUCTION_URL");
  const teamDomain = required(environment, "KIRJOLAB_ACCESS_TEAM_DOMAIN").replace(/\/$/u, "");
  const accessAudience = required(environment, "KIRJOLAB_ACCESS_AUD");
  const crossrefMailto = environment.KIRJOLAB_CROSSREF_MAILTO?.trim() ?? "";

  let url;
  try {
    url = new URL(productionUrl);
  } catch {
    throw new Error("KIRJOLAB_PRODUCTION_URL must be an absolute HTTPS URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    loopbackHost.test(url.hostname) ||
    url.hostname.endsWith(".workers.dev") ||
    url.hostname.endsWith(".pages.dev") ||
    placeholder.test(url.hostname)
  ) {
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
    "--strict",
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
  console.log(`[deploy] Production hostname: ${configuration.hostname}`);
  console.log("[deploy] Checking generated Worker bindings");
  run(["types", "--check"]);
  console.log("[deploy] Running strict production dry run");
  run(deployArguments(configuration, true));
  if (dryRunOnly) {
    console.log("[deploy] Production dry run passed; no Worker was uploaded");
    return;
  }
  console.log("[deploy] Uploading production Worker");
  run(deployArguments(configuration, false));
  console.log("[deploy] Inspecting deployed versions");
  run(["versions", "list"]);
}

function required(environment, name) {
  const value = environment[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required for production deployment`);
  return value;
}

function runWrangler(arguments_) {
  const executable = fileURLToPath(new URL("../node_modules/.bin/wrangler", import.meta.url));
  const result = spawnSync(executable, arguments_, { cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler exited with status ${result.status ?? "unknown"}`);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    runProductionDeploy({ dryRunOnly: process.argv.slice(2).includes("--dry-run-only") });
  } catch (error) {
    console.error(`[deploy] ${error instanceof Error ? error.message : "Production deployment failed"}`);
    process.exitCode = 1;
  }
}
