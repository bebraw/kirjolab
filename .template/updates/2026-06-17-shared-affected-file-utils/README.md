# Extract Shared Affected-File Helper Logic

Use this when a downstream project has both affected guardrails and affected
test selection scripts with duplicated Git diff, pre-push, and process-spawn
logic.

## Apply

1. Add `scripts/affected-file-utils.mjs`.
2. Move shared repository-root discovery, pre-push input parsing, changed-file
   discovery, file normalization, and process-spawn helpers into it.
3. Update `scripts/run-affected-guardrails.mjs` and
   `scripts/run-affected-tests.mjs` to import the helper.
4. Treat helper changes as test-environment changes so affected-test logic falls
   back to full coverage when the helper itself changes.

## Fallback

If the target project has diverged script names or package-manager commands,
port the helper shape manually and keep the target project's existing affected
file semantics unchanged.

## Verify

- `node --check scripts/affected-file-utils.mjs`
- `node --check scripts/run-affected-guardrails.mjs`
- `node --check scripts/run-affected-tests.mjs`
- The target project's normal quality gate
