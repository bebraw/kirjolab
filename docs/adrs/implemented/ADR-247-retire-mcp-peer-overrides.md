# ADR-247: Retire MCP Peer Overrides

**Status:** Implemented

**Date:** 2026-11-12

**Supersedes:** [ADR-245](./ADR-245-override-vulnerable-mcp-client-peers.md)

## Context

The required production audit now finds vulnerable packages in the temporary
MCP compatibility bridge. Agents 0.25 through 0.27 do not accept the required
patched peers, and 0.28.0 still selects vulnerable versions.
[Agents 0.28.1](https://github.com/cloudflare/agents/releases/tag/agents%400.28.1)
is the earliest stable release that declares client and server 2.3.1 and SDK
1.32.1. The [MCP 2.3.1 release](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.3.1)
aligns the client, server, and shared core.

The upstream-compatible graph removes the reason for overriding exact peer
requirements. Kirjolab continues to use only the stateless server path for
Research Corpus.

## Decision

Upgrade Agents to 0.28.1 and the direct MCP server to 2.3.1. Remove the client,
core, and SDK npm overrides; resolve client/core 2.3.1 and SDK 1.32.1 through
the upstream dependency graph. Keep direct Zod at patched 4.6.7.

Future Agents/MCP updates must satisfy declared peers and retain patched
implementations. Regenerate the lockfile without forced installs, advisory
suppression, or a lower audit threshold. Preserve unrelated security overrides
and refresh compatible vulnerable transitives separately.

Validate the installed graph, production audit, TypeScript, Research Corpus
MCP contracts, Workers tests, native CI, and production dry run before release.
Keep the stateless handler, Cloudflare Access identity boundary, and owner
scope. This upgrade introduces no OAuth client or credential-storage workflow.

## Consequences

**Positive:**

- Patched MCP packages satisfy upstream peer requirements without a local bridge.
- The blocking audit retains its existing policy.

**Negative:**

- Advancing Agents and the direct server includes upstream runtime changes;
  protocol and Workers verification remain necessary even without application edits.

## Alternatives Considered

### Extend the overrides

This would retain an unnecessary compatibility exception when a patched,
peer-compatible release is available.

### Keep the old graph and suppress the audit

This would retain vulnerable installed code and weaken the required gate.
