# Patch Transitive Audit Findings

Refresh the existing dependency graph to fix the October 2026 audit findings
without changing direct dependencies or the supported Node/npm baseline:

- Change the existing `fast-uri` override from `3.1.6` to `3.1.8`.
- Refresh transitive `hono` from `4.13.4` to `4.13.12`.
- Refresh transitive `ip-address` from `10.5.0` to `10.7.2`.

These releases fix URI authority parsing, HTTP parsing and rendering, and IP
address classification issues. They retain the installed major versions and
satisfy their parent dependencies' existing constraints.

## October 7 MCP Supplement

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

1. Check and apply `patch.diff` against the target project's existing pins and
   lockfile. Preserve any newer compatible security fixes already installed.
2. Run `npm install --ignore-scripts` with the project's pinned toolchain to
   synchronize installed packages with the updated lockfile.
3. Run `npm run security:audit` and `npm run ci:local` before pushing.

## Fallback

If the patch does not apply, update the existing `fast-uri` override to `3.1.8`
and run `npm update hono ip-address --ignore-scripts`. Inspect the resulting
lockfile and verify that all three patched versions are installed. Do not use
`npm audit fix --force` or introduce a major upgrade to clear these findings.
Record this update ID in the target project's template update record.

## Verify

Kirjolab's CI audit command checks the production dependency graph, including
its runtime peer dependencies. A successful CI audit does not assert that
unrelated development dependencies have no advisories. Use the target's
existing audit policy and complete native CI rather than weakening its gate.
