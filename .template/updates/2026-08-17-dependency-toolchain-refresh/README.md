# Refresh the Dependency Toolchain and Adopt Local CI

Use this update to bring a downstream project from the July 2026 template
toolchain to the August 2026 baseline. The reusable migration combines routine
pin refreshes with three coordinated changes: Node 24.19.0, Stryker 10, and the
Agent CI to Local CI rename.

## Apply

1. Pin Node to `24.19.0` in `package.json` and mirror it as `v24.19.0` in
   `.nvmrc`.
2. Refresh direct development dependencies to the template baseline:
   - `@playwright/test` `1.62.1`
   - `@stryker-mutator/core`, `@stryker-mutator/typescript-checker`, and
     `@stryker-mutator/vitest-runner` `10.0.0`
   - `@tailwindcss/cli` and `tailwindcss` `4.3.3`
   - `@types/node` `26.2.0`
   - `fallow` `3.17.0`
   - `lighthouse` `13.4.1`
   - `oxlint` `1.78.0`
   - `prettier` `3.9.6`
   - `wrangler` `4.123.0`
3. Replace `@redwoodjs/agent-ci` with `run-local-ci` `0.18.0`. Change the
   `ci:local` and `ci:local:retry` script executables from `agent-ci` to
   `local-ci`, preserving the npm script names and existing flags.
4. Rename `.env.agent-ci.example` to `.env.local-ci.example`, change documented
   `AGENT_CI_*` variables to `LOCAL_CI_*`, and rename the project skill from
   `agent-ci` to `local-ci`. Keep `.env.agent-ci` ignored during the transition
   so an existing machine-local secrets file cannot become tracked.
5. Regenerate the target project's lockfile with its existing package manager.
   If the project checks in Wrangler-generated Worker declarations, regenerate
   them with the newly pinned Wrangler version too.
6. Change the browser CI image to
   `mcr.microsoft.com/playwright:v1.62.1-noble`. The image version must exactly
   match the pinned `@playwright/test` version.
7. Update active developer docs, specs, agent routing, and capability-kit pins
   to the new versions and Local CI names. Preserve historical ADR and update
   pack prose that accurately describes the old Agent CI interface.
8. If the project adopted the template update-patch validator, keep its parsing
   responsibilities in focused helpers so Fallow 3.17's readability audit does
   not reject one oversized, high-complexity callback.

The Playwright 1.62.1 package requires Node 20 or newer and Local CI 0.18.0
requires Node 22 or newer; Node 24.19.0 satisfies both constraints.

## Fallback

If the patch does not apply cleanly, keep the target project's script names,
workflow names, and documentation layout. Port the version matrix and rename
only the Local CI-facing package, executable, env file, variables, and skill.
For a project that deliberately defers the rename, `@redwoodjs/agent-ci`
0.18.0 remains a temporary compatibility shim, but it emits a migration warning
and should not be the default for new work.

Review Stryker 10's results rather than assuming a major-version lockfile update
is sufficient. Keep the project's existing mutation targets, exclusions,
coverage analysis, and concurrency policy unless its own spec changes them. If
the complete score moves, record any threshold decision with the measured
result and an ADR instead of hiding mutants. Kirjolab measured 63.15%, kept
static mutants and the 80/90 reporting bands, and temporarily set only its
blocking floor to 63 under ADR-233.

For large mutation surfaces, apply the separate
`2026-09-03-actionable-mutation-reporting` update for stable progress, a concise
terminal score and hotspot summary, and HTML/JSON drill-down without changing
Stryker's exit status.

## Verify

- `npm run quality:gate`
- `npm run worker:types:check`
- `npm run mutation`
- `npm run diagnostics:codebase`
- `npm run ci:local`

Confirm that Local CI emits structured progress without a compatibility warning,
the Playwright browser job finds its bundled browser, and the full Stryker 10
mutation command completes and produces a reviewable measured score. If the
target adopts a new floor, confirm that the measured result clears it and that
the previous baseline remains documented as debt.
