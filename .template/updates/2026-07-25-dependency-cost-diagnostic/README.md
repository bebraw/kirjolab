# Report Dependency Costs Reproducibly

Use this update when dependency proposals are compared repeatedly and manual
package/bundle measurements have become inconsistent maintenance work.

## Apply

1. Add the read-only dependency-cost script and tooling tests.
2. Register `diagnostics:dependencies` in `package.json`.
3. Adapt the artifact list to the target project's built browser outputs.
4. Document that the command requires a prior build and remains advisory.

The script should count unique production package/version pairs from the npm
lockfile, use deterministic gzip settings, emit Markdown by default, support
JSON, and write no persistent report.

## Fallback

If the target has no browser build or dependency comparisons remain rare, keep
the measurement commands in decision notes instead of adding lasting tooling.

## Verify

- `npm run test:tooling`
- `npm run build`
- `npm run diagnostics:dependencies`
- `npm run ci:local`
