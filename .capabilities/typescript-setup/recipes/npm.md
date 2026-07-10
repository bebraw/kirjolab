# npm Recipe

Apply this recipe when the target repo uses npm.

## Package Changes

Add the TypeScript dependencies:

```bash
npm install --save-dev typescript@6.0.3 @types/node@24.12.2
```

Add or merge this script into `package.json`:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
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
