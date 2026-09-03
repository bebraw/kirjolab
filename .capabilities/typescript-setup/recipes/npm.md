# npm Recipe

Apply this recipe when the target repo uses npm.

## Package Changes

Add the TypeScript dependencies:

```bash
npm install --save-dev --save-exact @types/node@24.13.3 typescript@npm:@typescript/typescript6@6.0.2 typescript-7@npm:typescript@7.0.2
```

This keeps the TypeScript 6 compatibility package under the canonical
`typescript` name for compiler-API tooling while exposing TypeScript 7 through
the `typescript-7` alias used by the project typecheck command.

Add or merge this script into `package.json`:

```json
{
  "scripts": {
    "typecheck": "node ./node_modules/typescript-7/bin/tsc --noEmit"
  }
}
```

## Files

Copy or merge:

- `files/tsconfig.json` to `tsconfig.json`

Adapt `include`, `lib`, `types`, and `moduleResolution` if the target repo has different runtime or framework conventions.

## Optional CSS Import Types

If the target repo imports `.css` files from TypeScript and has no matching declaration, ask:

```text
This repo imports CSS from TypeScript. Do you want me to add a small CSS module declaration as part of the TypeScript setup?
```

If approved, copy or merge:

- `files/src/css.d.ts` to `src/css.d.ts`
