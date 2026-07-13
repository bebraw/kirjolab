import { describe, expect, it, vi } from "vitest";
import { deployArguments, productionConfiguration, runProductionDeploy } from "../scripts/deploy-production.mjs";

const validEnvironment = {
  KIRJOLAB_PRODUCTION_URL: "https://write.kirjolab.test",
  KIRJOLAB_ACCESS_TEAM_DOMAIN: "https://research.cloudflareaccess.com",
  KIRJOLAB_ACCESS_AUD: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  KIRJOLAB_CROSSREF_MAILTO: "researcher@kirjolab.test",
};

describe("production deployment preflight", () => {
  it("normalizes an exact production identity and hostname configuration", () => {
    expect(productionConfiguration({ ...validEnvironment, KIRJOLAB_ACCESS_TEAM_DOMAIN: "https://research.cloudflareaccess.com/" })).toEqual(
      {
        hostname: "write.kirjolab.test",
        teamDomain: "https://research.cloudflareaccess.com",
        accessAudience: validEnvironment.KIRJOLAB_ACCESS_AUD,
        crossrefMailto: "researcher@kirjolab.test",
      },
    );
  });

  it.each([
    ["missing URL", { KIRJOLAB_PRODUCTION_URL: "" }, "KIRJOLAB_PRODUCTION_URL is required"],
    ["malformed URL", { KIRJOLAB_PRODUCTION_URL: "not a url" }, "absolute HTTPS URL"],
    ["HTTP URL", { KIRJOLAB_PRODUCTION_URL: "http://write.kirjolab.test" }, "HTTPS custom hostname"],
    ["URL path", { KIRJOLAB_PRODUCTION_URL: "https://write.kirjolab.test/app" }, "HTTPS custom hostname"],
    ["URL credentials", { KIRJOLAB_PRODUCTION_URL: "https://user:pass@write.kirjolab.test" }, "HTTPS custom hostname"],
    ["URL port", { KIRJOLAB_PRODUCTION_URL: "https://write.kirjolab.test:8443" }, "HTTPS custom hostname"],
    ["loopback", { KIRJOLAB_PRODUCTION_URL: "https://127.0.0.1" }, "HTTPS custom hostname"],
    ["workers.dev", { KIRJOLAB_PRODUCTION_URL: "https://kirjolab.workers.dev" }, "HTTPS custom hostname"],
    ["placeholder hostname", { KIRJOLAB_PRODUCTION_URL: "https://change-me.invalid" }, "HTTPS custom hostname"],
    ["missing team", { KIRJOLAB_ACCESS_TEAM_DOMAIN: "" }, "KIRJOLAB_ACCESS_TEAM_DOMAIN is required"],
    ["invalid team", { KIRJOLAB_ACCESS_TEAM_DOMAIN: "https://example.org" }, "Access team domain"],
    ["placeholder team", { KIRJOLAB_ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com" }, "Access team domain"],
    ["missing audience", { KIRJOLAB_ACCESS_AUD: "" }, "KIRJOLAB_ACCESS_AUD is required"],
    ["short audience", { KIRJOLAB_ACCESS_AUD: "short" }, "application audience"],
    ["placeholder audience", { KIRJOLAB_ACCESS_AUD: "replace_me_with_access_audience" }, "application audience"],
    ["invalid mailto", { KIRJOLAB_CROSSREF_MAILTO: "invalid" }, "valid email address"],
  ])("rejects %s", (_label, override, message) => {
    expect(() => productionConfiguration({ ...validEnvironment, ...override })).toThrow(message);
  });

  it("builds one complete hosted variable set for strict dry runs and uploads", () => {
    const configuration = productionConfiguration(validEnvironment);
    expect(deployArguments(configuration, true)).toEqual([
      "deploy",
      "--strict",
      "--minify",
      "--domain",
      "write.kirjolab.test",
      "--var",
      "AUTH_MODE:access",
      "--var",
      "ACCESS_TEAM_DOMAIN:https://research.cloudflareaccess.com",
      "--var",
      `ACCESS_AUD:${validEnvironment.KIRJOLAB_ACCESS_AUD}`,
      "--var",
      "CROSSREF_MAILTO:researcher@kirjolab.test",
      "--dry-run",
    ]);
    expect(deployArguments(configuration, false)).not.toContain("--dry-run");
  });

  it("checks types and dry run before upload, and stops after a requested dry run", () => {
    const run = vi.fn();
    runProductionDeploy({ environment: validEnvironment, dryRunOnly: true, run });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]?.[0]).toEqual(["types", "--check"]);
    expect(run.mock.calls[1]?.[0]).toContain("--dry-run");

    run.mockClear();
    runProductionDeploy({ environment: validEnvironment, run });
    expect(run).toHaveBeenCalledTimes(4);
    expect(run.mock.calls[2]?.[0]).not.toContain("--dry-run");
    expect(run.mock.calls[3]?.[0]).toEqual(["versions", "list"]);
  });

  it("does not continue after a failed preflight command", () => {
    const run = vi.fn(() => {
      throw new Error("dry run failed");
    });
    expect(() => runProductionDeploy({ environment: validEnvironment, run })).toThrow("dry run failed");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
