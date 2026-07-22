# Run Deep Quality Checks Before Push

Use this when Fallow and targeted Stryker should protect publication without
expanding the routine local readiness gate.

## Apply

1. Add a change-aware pre-push selector for Fallow and affected mutation.
2. Register non-package browser build roots as Fallow entry points so bundled
   clients are not reported as dead files.
3. Preserve the exact Git pre-push ref input for affected guardrails and the
   deep selector.
4. Run Fallow for affected codebase inputs.
5. Run Stryker with its TypeScript checker for affected mutation sources and
   map affected Node tests back to their production source.
6. Fall back to incremental Stryker for mutation/test configuration changes.
7. Skip irrelevant deep checks for documentation-only and Worker-only pushes.
8. Keep clean full mutation with the TypeScript checker in GitHub Actions.
9. Route package commands that resolve files under `node_modules` through
   project-owned scripts so Fallow entry-point discovery stays warning-free.

## Verify

- `npm run test:tooling`
- `npm run diagnostics:codebase`
- `npm run mutation:affected -- --mutate <representative-source>`
- `npm run ci:local`
