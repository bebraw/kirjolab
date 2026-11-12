# Refresh November Dependencies

Refresh the supported Node 24 toolchain and adopt Vitest 5 now that the
Cloudflare test plugin declares compatible peers. The focused patch carries
reusable tooling, capability recipes, existing image pins, and the Fallow
report adapter. Application
runtime upgrades need the target project's own integration checks.

## Apply

1. Apply `patch.diff` where the target has matching files, preserving newer
   compatible versions. Use this tooling matrix:

   | Tool                                                | Version   |
   | --------------------------------------------------- | --------- |
   | Node.js                                             | `24.22.3` |
   | Node declarations                                   | `24.19.2` |
   | Vitest and V8 coverage                              | `5.1.0`   |
   | Cloudflare Vitest plugin                            | `1.8.1`   |
   | Playwright                                          | `1.65.0`  |
   | Wrangler                                            | `4.161.0` |
   | Stryker core, TypeScript checker, and Vitest runner | `10.1.1`  |
   | Oxlint                                              | `1.93.0`  |
   | Prettier                                            | `3.10.1`  |
   | Fallow                                              | `3.42.0`  |
   | Lighthouse                                          | `13.6.0`  |
   | Chrome Launcher                                     | `1.2.3`   |

   Keep the npm 11 major policy and the existing esbuild `0.28.2` pin. Mirror
   the Node pin in `.nvmrc` and any existing development or evaluation image.

2. Upgrade Vitest and `@vitest/coverage-v8` together. The Cloudflare plugin
   `1.8.1` declares Vitest `^4.1.0 || ^5.0.0`, lifting the October peer hold.
   Keep separate Node and Workers projects, `cloudflareTest()`, storage isolated
   between test files, and test-only Workers types. Cases within a file share
   storage; independent scenarios need distinct resource identities or explicit
   fixture setup and cleanup. Review the target's APIs against
   [Vitest's migration guide](https://vitest.dev/guide/migration.html) and
   validate coverage and Stryker integration. Do not force incompatible peers
   or relax quality thresholds to complete the upgrade.
   Check mock-history assumptions, await asynchronous assertions, and verify
   the reported coverage file set against the intended source globs. Vitest 5
   clears mock history by default, rejects unawaited asynchronous assertions,
   and matches coverage paths more precisely.
3. Match the existing Playwright CI image to the package exactly:
   `mcr.microsoft.com/playwright:v1.65.0-noble`. Install matching local Chromium
   with the target's existing browser-install command.
4. Advance the existing PostCSS Nano ID override to `3.3.20` and the
   `typed-rest-client` qs override to `6.17.1`. Keep the existing `fast-uri`
   `3.1.9` override. Inspect parent ranges and audit results before removing
   overrides; do not introduce unused parent packages to match this matrix.
5. Regenerate the lockfile with the pinned Node runtime and npm 11, without
   forced installs. Refresh compatible transitive resolutions using the
   target's established install/update workflow. Regenerate committed Worker
   declarations with its registered type commands.
6. Refresh capability manifests, recipes, active developer documentation,
   quality-gate and self-hosting specs, and version-specific tooling tests.
   Record this update ID in template provenance and amend existing decisions
   that documented the old Vitest hold or current Node pin.
7. Update an existing `scripts/run-fallow-type-aware.mjs` wrapper and its tests
   for Fallow 3.42's explicit no-query result. The companion does not start
   when no semantic query is needed. Accept that result only with
   `executed: false`, a complete type-aware identity, the
   `deferred:no-semantic-queries` project hash, all diagnostic counts at zero,
   and an empty warnings list. Print `not needed` for it, preserve
   executed-analysis summaries, and continue rejecting missing semantic metadata
   and other unexecuted results. Preserve exit handling and the pre-push
   diagnostic gate. See
   [Fallow's report contract](https://github.com/fallow-rs/fallow/blob/v3.42.0/docs/type-aware-analysis.md).

## Runtime Integration Notes

The portable patch excludes application dependencies and application adapters.
Kirjolab also advances Agents to `0.33.0` and MCP server, client, and core to
`2.4.0`, satisfying the exact peers declared by Agents. Keep Zod at `4.6.7` and
leave the retired MCP compatibility overrides absent. Agents now makes the legacy
SDK an optional peer; a project using only `agents/mcp/server` does not need
to install it. Review the
[Agents optional-peer change](https://github.com/cloudflare/agents/releases/tag/agents%400.31.0)
and [MCP 2.4.0 release notes](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.4.0)
before adapting a target's stateless handler. Projects using other Agents APIs
must also review the intervening releases for their own integrations.

Projects adopting `@cloudflare/puppeteer` `2.0.0` must review their Browser Run
adapter against the [Puppeteer release](https://github.com/cloudflare/browser-run/releases/tag/cloudflare-puppeteer-v2.0.0)
and verify its Worker bundle and managed-browser behavior. Remove the
old `@cloudflare/puppeteer@1.4.0` installer override only after confirming the
new dependency graph no longer includes that browser installer.

Projects adopting PDF.js `6.5.438` while supporting browsers without native
`Promise.withResolvers` must retain the compatibility shim in both display
and worker assets. Update application integration fixtures for a newer
consumer-injected runtime without rewriting an immutable published package's
README or existing artifact hash.

## Remaining Development Audit Findings

The November 12 whole-graph audit reports seven development-only findings
derived from two advisories. The required production audit remains strict;
this refresh adds no audit suppression or incompatible major-version override.

- Minimatch `10.2.6` is flagged by
  [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
  The fix starts at `11.0.1`, outside Stryker's `~10.2.4` and Local CI's
  `^10.2.5` ranges. The advisory requires `optimizationLevel >= 2`; review of
  the installed parent callers found the default level `1`, which does not
  take that preprocessing path.
- `dtu-github-actions` requires Zod `^3.24.1` and resolves `3.25.76`, flagged
  by [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
  Its installed use parses four scalar environment settings, without the
  affected collection schemas. The patched `4.6.6` release is outside that
  parent's major-version contract.

These findings remain in `npm audit`. Recheck the parent releases and their
actual call paths during subsequent refreshes; the reviewed development uses
do not establish safety for other consumers of the same packages.

## Fallback

If the patch does not apply, port the matrix and existing image changes into
the target's own files. Preserve its runtime dependencies, npm policy, Worker
bindings, compatibility date, test timeouts, quality thresholds, and supported
platform boundary. Regenerate its lockfile instead of copying Kirjolab's
application graph. Preserve historical update-pack patches and published
artifacts; put the current requirements in active documentation.

## Verify

- A clean install from the regenerated lockfile and a valid installed peer graph
- Worker declaration freshness, type checking, and version-specific tooling tests
- Production audit and, when reviewing the whole graph, `npm audit`
- Node tests, coverage, real Workers tests, and Stryker compatibility
- Type-aware Fallow diagnostics for both executed and explicit no-query results
- `npm run ci:local`, including the complete browser suite
- Production Worker dry runs and managed-browser checks for runtime adapters
