# npm Recipe

Apply this recipe when the target repo uses npm and already has `npm run quality:gate:fast`.

## Package Changes

Add or merge:

```json
{
  "scripts": {
    "prepare": "node ./scripts/setup-git-hooks.mjs"
  }
}
```

## Files

Copy or merge:

- `files/scripts/setup-git-hooks.mjs` to `scripts/setup-git-hooks.mjs`
- `files/.githooks/pre-push` to `.githooks/pre-push`

If the target repo already has `.githooks/pre-push`, merge the command instead of overwriting it.

## Existing Hook Managers

If the target repo uses Husky, lefthook, pre-commit, or another hook manager, ask before changing it. Prefer integrating `npm run quality:gate:fast` into the existing manager over adding a second hook system.
