# Checks

Run these after applying the TypeScript setup kit.

## Required

```bash
npm run typecheck
```

## Expected Results

- `package.json` contains a `typecheck` script.
- `typescript` is installed as a dev dependency.
- `@types/node` is installed when `tsconfig.json` uses Node types.
- `tsconfig.json` includes target-appropriate source and config globs.
- `npm run typecheck` passes.

## Optional CSS Import Types

If the target repo imports `.css` files from TypeScript:

- a declaration file such as `src/css.d.ts` exists
- `npm run typecheck` succeeds without missing module errors for CSS imports
