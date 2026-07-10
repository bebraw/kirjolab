# Adopt TypeScript 7 Type Checking

Use this when a downstream project wants TypeScript 7's faster `tsc` while
keeping TypeScript 6 compiler API compatibility for tools that still import the
`typescript` package.

## Apply

1. Change the `typescript` development dependency to
   `npm:@typescript/typescript6@6.0.2`.
2. Add `typescript-7` as `npm:typescript@7.0.2`.
3. Update the typecheck script to run
   `node ./node_modules/typescript-7/bin/tsc --noEmit`.
4. Document the temporary compatibility layout in the target project's
   development notes.
5. Add or update an ADR if the target project tracks toolchain decisions.

## Fallback

If the target project does not use tooling that imports the TypeScript compiler
API, it can depend directly on `typescript@7.0.2` and keep `tsc --noEmit`.

If mutation, linting, or build tooling fails after the migration, keep
`typescript` pointed at `@typescript/typescript6` until that tooling supports
the TypeScript 7 API directly.

## Verify

- `npm run typecheck`
- The target project's normal quality gate
- The target project's local CI workflow
