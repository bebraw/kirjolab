# npm Recipe

Apply this recipe when the target repo uses npm.

Apply `.capabilities/typescript-setup/` first unless the target repo already has an equivalent `typecheck` script and TypeScript configuration.

## Package Changes

Add the fast-gate dependencies:

```bash
npm install --save-dev prettier@3.8.3 vitest@4.1.5 @vitest/coverage-v8@4.1.5
```

Add or merge these scripts:

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "quality:gate": "npm run quality:gate:fast",
    "quality:gate:fast": "npm run format:check && npm run typecheck && npm run security:audit && npm run test:coverage",
    "security:audit": "npm audit --omit=dev --audit-level high",
    "test": "vitest run --passWithNoTests",
    "test:coverage": "node ./scripts/run-coverage-gate.mjs"
  }
}
```

## Files

Copy or merge:

- `files/scripts/run-coverage-gate.mjs` to `scripts/run-coverage-gate.mjs`
- `files/vitest.config.ts` to `vitest.config.ts`

Adapt `src/` globs if the target repo uses a different source directory.

## Optional Browser Gate

If the target repo has browser-visible behavior, ask:

```text
Do you want this quality-gate upgrade to add a Playwright browser gate as well?
```

If approved, follow `playwright.md`.
