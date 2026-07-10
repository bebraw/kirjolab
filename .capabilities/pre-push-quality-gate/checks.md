# Checks

Run these after applying the pre-push quality-gate kit.

```bash
npm install
git config --get core.hooksPath
npm run quality:gate:fast
```

Expected:

- `git config --get core.hooksPath` prints `.githooks`
- `.githooks/pre-push` is executable
- `npm run quality:gate:fast` passes
