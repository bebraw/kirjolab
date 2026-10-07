# ADR-245: Override Vulnerable MCP Client Peers

**Status:** Implemented

**Date:** 2026-10-07

**Review by:** 2026-11-07

## Context

The blocking production audit reports
[GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h) in the
MCP client 2.0.0 and SDK 1.30.0 peers required exactly by Agents 0.25.0.
Affected OAuth clients can send saved credentials to an authorization server
chosen by an untrusted MCP server. The maintainer identifies client 2.2.0 and
SDK 1.31.0 as patched releases, with core 2.2.0 required by the client.

Kirjolab uses `agents/mcp/server` and the direct MCP server 2.0.0 for its private
Research Corpus endpoint. It does not use the affected OAuth client providers
or persist their credentials. The installed vulnerable implementations still
fail the required audit, preventing release of the backup repair. A compatible
lockfile refresh cannot move exact peer pins, and Agents 0.26.0 retains them.

## Decision

Use targeted npm overrides for the existing client 2.2.0, SDK 1.31.0, and shared
core 2.2.0. Keep Agents 0.25.0 and the direct server 2.0.0. Regenerate the lockfile
without force flags or install scripts; change only these three installed
packages. Do not suppress the advisory or weaken the audit threshold.

Treat this as an explicit compatibility bridge outside upstream's exact peer
requirements. Validate the dependency graph, production audit, TypeScript,
Research Corpus MCP contract tests, Workers tests, native CI, and production
dry run before release. Recheck these constraints before changing any affected
pin. Remove the overrides when an upstream Agents release accepts patched
versions, and review the bridge by 2026-11-07.

The existing stateless server, Cloudflare Access identity boundary, and owner
scope remain unchanged. Introducing OAuth clients later requires the patched
SDK's issuer-bound credential contract; this bridge does not authorize a new
client or stored credential workflow.

## Consequences

**Positive:**

- The installed runtime graph contains the maintained OAuth credential fix.
- The production audit remains blocking and needs no exception.
- Existing direct package pins and server behavior remain stable.

**Negative:**

- Agents' exact client and SDK peers, and the server's exact core dependency,
  are deliberately overridden, so compatibility depends on local verification.
- Upstream releases must be reviewed before removing or extending the bridge.

## Alternatives Considered

### Upgrade Agents

The current 0.26.0 release still pins the same vulnerable peers and adds unrelated
changes without clearing this finding.

### Follow the audit's forced downgrade

The suggested Agents 0.20.0 downgrade crosses the current runtime contract and
would trade the audit finding for unrelated compatibility risk.

### Suppress the advisory because clients are unused

This would weaken the repository's blocking audit while patched implementations
are available. The narrow overrides retain the check and remove the affected code.
