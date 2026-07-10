# Lighthouse Performance Capability Kit

Use this kit to add local Lighthouse performance reports and a configurable performance budget.

## Adds

- `scripts/run-lighthouse.mjs`
- A `lighthouse` script
- HTML and JSON report output under `reports/lighthouse/`
- Mobile and desktop performance checks

## Good Fit

- The target repo has a local or deployed URL to audit.
- Performance budget checks are useful during local review.
- The repo can accept Playwright, Chrome launcher, and Lighthouse as dev dependencies.

## Poor Fit

- The target repo has no browser-visible surface.
- The repo already uses another performance budget tool.
- The target environment needs authenticated or stateful setup that Lighthouse cannot reach safely.

## Apply

1. Follow `recipes/npm.md`.
2. Copy `files/scripts/run-lighthouse.mjs` into `scripts/run-lighthouse.mjs`.
3. Document the target URL and optional server command.
4. Run the checks in `checks.md`.
