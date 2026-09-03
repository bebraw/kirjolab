# npm Recipe

Apply this recipe when the target repo uses npm.

Apply `.capabilities/typescript-setup/` and `.capabilities/quality-gate/` first unless the target repo already has equivalent TypeScript, Vitest, and quality-gate contracts.

## Package Changes

Add the mutation testing dependencies:

```bash
npm install --save-dev @stryker-mutator/core@10.0.0 @stryker-mutator/typescript-checker@10.0.0 @stryker-mutator/vitest-runner@10.0.0
```

Add or merge this script:

```json
{
  "scripts": {
    "mutation": "node ./scripts/run-mutation.mjs",
    "mutation:report": "node ./scripts/report-mutation-results.mjs"
  }
}
```

If the target repo has a full quality gate and the user wants mutation testing in that readiness path, merge it there:

```json
{
  "scripts": {
    "quality:gate": "npm run quality:gate:fast && npm run e2e && npm run mutation"
  }
}
```

Adapt the quality-gate command to the target repo's existing browser or integration checks.

## Files

Copy or merge:

- `files/stryker.config.mjs` to `stryker.config.mjs`
- `files/scripts/report-mutation-results.mjs` to `scripts/report-mutation-results.mjs`
- `files/scripts/run-mutation.mjs` to `scripts/run-mutation.mjs`

Adapt these config fields when needed:

- `mutate` if runtime source does not live under `src/`
- `tsconfigFile` if the repo uses another TypeScript config for tests
- `vitest.configFile` if the repo uses another Vitest config path
- `thresholds` if the target repo already has a stricter mutation score policy

## Ignore And Docs

Ensure the target repo ignores Stryker's temporary sandbox:

```gitignore
.stryker-tmp/
```

Document these write targets wherever the target repo tracks development workflow outputs:

- `reports/mutation/`
- `.stryker-tmp/`

The long-run config intentionally keeps exhaustive test and mutant listings out
of clear text. The wrapper prints a compact terminal summary after any fresh
JSON report, including threshold failures, while the HTML report retains full
drill-down detail. Use a separate bounded command with Stryker's `clear-text`
reporter when a target project wants individual affected-mutant output.
The supplied clear-text options suppress the full related-test inventory while
retaining survivor details and at most three relevant tests per survivor.
