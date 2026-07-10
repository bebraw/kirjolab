# Checks

Run these after applying the mutation testing kit.

```bash
npm run mutation
```

Expected:

- Stryker mutates runtime source files only.
- Unit tests run through the Vitest runner.
- TypeScript checking rejects type-invalid mutants before running tests.
- Reports are written under `reports/mutation/`.
- Temporary Stryker files stay under ignored `.stryker-tmp/`.
- The command exits non-zero when the mutation score is below the configured break threshold.

Also run the target repo's full quality gate before treating the change as ready.
