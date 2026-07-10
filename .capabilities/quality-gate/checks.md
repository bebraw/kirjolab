# Checks

Run these after applying the quality-gate kit.

## Required

```bash
npm run quality:gate:fast
```

## Optional Browser Gate

Run this if the browser gate was added:

```bash
npm run e2e
npm run quality:gate
```

## Expected Results

- `package.json` contains the fast-gate scripts.
- `package.json` contains a `typecheck` script from `typescript-setup` or an equivalent target-project contract.
- `scripts/run-coverage-gate.mjs` exists.
- `vitest.config.ts` includes target-appropriate test and coverage globs.
- `npm run quality:gate:fast` passes.
- If Playwright was added, `playwright.config.ts` starts or targets the right app.
