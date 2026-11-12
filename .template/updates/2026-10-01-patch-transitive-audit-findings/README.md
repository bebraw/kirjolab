# Patch Transitive Audit Findings

The original October refresh fixes transitive audit findings without changing
direct dependencies or the supported Node/npm baseline:

- Change the existing `fast-uri` override from `3.1.6` to `3.1.8`.
- Refresh transitive `hono` from `4.13.4` to `4.13.12`.
- Refresh transitive `ip-address` from `10.5.0` to `10.7.2`.

These releases fix URI authority parsing, HTTP parsing and rendering, and IP
address classification issues. They retain the installed major versions and
satisfy their parent dependencies' existing constraints.

## November 12: Retire The MCP Bridge

For affected Agents/MCP projects, use
[Agents 0.28.1](https://github.com/cloudflare/agents/releases/tag/agents%400.28.1)
and direct MCP server 2.3.1. Upstream now requires client 2.3.1 and SDK 1.32.1;
the [MCP 2.3.1 packages](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.3.1)
align the client, server, and core. Remove the three MCP overrides from the
October supplement. Agents 0.28.1 is the earliest stable release accepting
this patched graph; 0.28.0 still selects vulnerable versions.

For a matching existing graph, apply these manifest changes while preserving
newer compatible security fixes:

| Existing pin                        | November value |
| ----------------------------------- | -------------- |
| `agents`                            | `0.28.1`       |
| `@modelcontextprotocol/server`      | `2.3.1`        |
| `zod` (Zod 4 consumers)             | `4.6.7`        |
| `fast-uri` override                 | `3.1.9`        |
| `typed-rest-client`'s `qs` override | `6.16.1`       |

1. Set the five existing pins above and remove the
   `@modelcontextprotocol/client`, `@modelcontextprotocol/core`, and
   `@modelcontextprotocol/sdk` overrides.
2. Run `npm install --ignore-scripts` with the target's pinned toolchain.
3. Run `npm update body-parser ip-address vite --ignore-scripts`. Kirjolab
   resolves body-parser 2.4.0, ip-address 10.7.6, and Vite 8.3.8. Inspect all
   lockfile changes, since other packages may move within their existing ranges.
4. Update any existing dependency-pin guardrails to the selected versions and
   assert that the retired MCP overrides remain absent. Kirjolab keeps these
   assertions in `scripts/research-corpus.test.mjs`.
5. Verify declared peers and the installed graph, production audit, type checks,
   MCP contracts, Workers tests, native CI, and production dry run.

Apply only to matching existing dependency graphs; this supplement adds no
application dependency or runtime capability. Use the target's pinned
toolchain to regenerate its lockfile without force flags. Preserve the target's
authentication and owner boundaries. See
[ADR-247](../../../docs/adrs/implemented/ADR-247-retire-mcp-peer-overrides.md).

The existing `patch.diff` remains the historical October patch. Apply the
November instructions above directly; if this update ID is already recorded,
do not replay the older patch or MCP bridge. Keep the same update ID.

## October 7 MCP Supplement (Historical)

The following bridge records the original remedy. Use the November supplement
for current upgrades instead of installing these older MCP versions.

For projects using Agents 0.25.0's exact MCP peers, add targeted npm overrides
for `@modelcontextprotocol/client` 2.2.0, `@modelcontextprotocol/sdk` 1.31.0,
and shared `@modelcontextprotocol/core` 2.2.0. These fix
[GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h).
Keep the existing Agents and direct MCP server pins. Agents 0.26.0 still
declares the vulnerable peers, so a normal compatible lockfile refresh cannot
clear this finding.

This is an explicit compatibility bridge outside the exact peer/core pins.
Record the rationale in a local ADR, verify MCP contracts and type checks as
well as the production audit and full native CI, and remove it when upstream
accepts patched peers. Review by November 7, 2026. Do not add these overrides
to projects without the affected installed MCP dependency graph. Existing
OAuth clients must also follow the advisory's issuer-bound credential upgrade
instructions; Kirjolab uses only the server path.

The supplemental patch updates the three existing MCP lockfile entries without
changing direct dependencies. Preserve newer security fixes in downstream
projects instead of applying its older lockfile contexts mechanically.
If this update ID is already recorded, apply only the MCP supplement rather
than replaying the original URI, HTTP, and IP address patch.

## Apply

1. For the historical October baseline, inspect `patch.diff` against the
   target's existing pins and lockfile. Current upgrades and projects that
   already recorded this update use the November instructions above instead.
   Preserve newer compatible security fixes.
2. Run `npm install --ignore-scripts` with the project's pinned toolchain to
   synchronize installed packages with the updated lockfile.
3. Run `npm run security:audit` and `npm run ci:local` before pushing.

## Fallback

If the patch does not apply, port the applicable version changes above into
the target's existing manifest and regenerate its lockfile. Inspect the
installed graph and declared peer requirements. Do not use
`npm audit fix --force` or introduce a major upgrade to clear these findings.
Record this update ID in the target project's template update record.

## Verify

Kirjolab's CI audit command checks the production dependency graph, including
its runtime peer dependencies. A successful CI audit does not assert that
unrelated development dependencies have no advisories. Use the target's
existing audit policy and complete native CI rather than weakening its gate.
