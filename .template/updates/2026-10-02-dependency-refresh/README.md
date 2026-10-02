# Refresh October Dependencies

Refresh the supported Node 24 toolchain and follow Cloudflare's renamed Workers
test integration. Application runtime dependencies remain the target project's
responsibility; the patch contains reusable tooling pins and configuration.

## Apply

1. Apply `patch.diff` where the target has matching files, preserving any newer
   compatible versions. The refreshed baseline uses Node `24.21.0`, Node 24
   declarations `24.19.1`, Playwright `1.63.0`, Wrangler `4.147.0`, Oxlint
   `1.86.0`, Prettier `3.9.9`, Fallow `3.31.0`, esbuild `0.28.2`, Lighthouse
   `13.5.0`, and Chrome Launcher `1.2.2`.
2. Replace `@cloudflare/vitest-pool-workers` with
   `@cloudflare/vitest-plugin` `1.3.6`. Change the configuration import and
   TypeScript `types` entry to the new package name, following Cloudflare's
   [migration guide](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/).
   The `cloudflareTest()` configuration API is unchanged.
3. Keep Vitest and `@vitest/coverage-v8` at `4.1.11`: the latest Cloudflare
   plugin still requires Vitest `^4.1.0`. Recheck upstream peer requirements
   before adopting Vitest 5; do not force incompatible dependencies.
4. Keep the Playwright CI image matched exactly to the installed package:
   `mcr.microsoft.com/playwright:v1.63.0-noble`. Install the matching local
   Chromium with the target's existing Playwright install command.
5. Lift an old Wrangler `4.116.0` hold only after checking the upstream
   [EPIPE fix](https://github.com/cloudflare/workers-sdk/pull/15323) and running
   the target's full browser suite. Update any pin-specific tooling tests and
   document the lifted hold in its existing ADR.
6. Run `npm install --ignore-scripts`, then
   `npm update --ignore-scripts` with the pinned toolchain. This also refreshes
   compatible transitive packages instead of retaining old lockfile resolutions.
   Regenerate committed Worker declarations with the target's registered type
   commands. Mirror the Node pin in any existing development image.
7. Refresh capability-kit manifests, recipes, active developer documentation,
   and quality-gate specs. Record this update ID in template provenance.

The existing PostCSS Nano ID override advances within version 3 to `3.3.19`.
Keep other security overrides unless inspecting their parent dependency graph
establishes that they can safely be removed.

## Fallback

If the patch does not apply, port the version matrix and package rename into
the target's own manifests and configurations. Preserve its npm major policy,
application dependencies, Worker bindings, compatibility date, test timeouts,
and quality thresholds. Regenerate its lockfile instead of copying Kirjolab's
application dependency graph.

Projects using `agents` `0.25.0` must retain
`@modelcontextprotocol/server` `2.0.0` while that release declares the exact
peer requirement. Resolve application-specific peer constraints before
upgrading runtime packages.

Projects adopting PDF.js 6.3 while supporting browsers without native
`Promise.withResolvers` must supply that compatibility shim in both the display
and worker assets. Kirjolab's application-specific build adaptation and tests
are outside this tooling patch.

Preserve files included in an immutable published package. Refresh application
integration fixtures for a newer consumer-injected runtime without rewriting
the released package's README or changing its existing artifact hash.

## Verify

- Worker declaration freshness checks and `npm run typecheck`
- Production audit and, when reviewing the whole graph, `npm audit`
- `npm run ci:local`, including Workers tests and the complete browser suite
- A clean install from the regenerated lockfile

For Browser Run adapter upgrades, retain the target's existing bundle,
dependency-graph, and managed-browser verification requirements. The portable
patch does not modify Kirjolab's Puppeteer adapter or installer override.
