# Run Affected-File Guardrails When Possible

Use this when pre-push or iteration checks should avoid full-repo work when a
narrower affected-file signal is sufficient.

## Apply

1. Add `scripts/run-affected-guardrails.mjs`.
2. Add `quality:affected` to `package.json`.
3. Point `.githooks/pre-push` at `npm run quality:affected`.
4. Keep `quality:gate` as the readiness baseline.

## Fallback

If the target project has different source roots, update the script's runtime,
test, config, and package metadata classifiers before enabling the hook.

## Verify

- `npm run quality:affected`
- `npm run quality:gate`
