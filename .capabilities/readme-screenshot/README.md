# README Screenshot Capability Kit

Use this kit to add local-only screenshot capture for a README or docs page.

## Adds

- `scripts/run-home-screenshot.mjs`
- A `screenshot:home` script
- Playwright-based browser capture with environment-variable overrides

## Good Fit

- The target repo has a local web app or docs page worth showing in the README.
- Screenshot refresh should be manual and local-only.
- The target repo already uses Playwright or can accept it as a dev dependency.

## Poor Fit

- The target repo needs screenshot synchronization in CI.
- The target repo does not have a stable local URL.
- The screenshot requires authenticated or secret-backed state.

## Apply

1. Follow `recipes/npm.md`.
2. Copy `files/scripts/run-home-screenshot.mjs` into `scripts/run-home-screenshot.mjs`.
3. Adapt the default URL, output path, and server command for the target repo.
4. Document when contributors should refresh the screenshot.
5. Run the checks in `checks.md`.
