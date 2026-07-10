# Add Affected Unit Test Runner

Use this when a project already has Vitest coverage and wants a narrower
iteration command for changed runtime or unit test files.

## Apply

1. Add `scripts/run-affected-tests.mjs`.
2. Add `test:affected` to `package.json`.
3. Document when affected tests fall back to full coverage.
4. Keep full coverage as the authoritative gate.

## Fallback

If the target project does not colocate tests, adapt the related-test matching
rules to its existing test naming convention.

## Verify

- `npm run test:affected`
- `npm run quality:gate`
