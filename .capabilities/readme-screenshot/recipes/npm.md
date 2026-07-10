# npm Recipe

Apply this recipe when the target repo uses npm.

## Package Changes

```bash
npm install --save-dev @playwright/test@1.59.1
```

Add or merge:

```json
{
  "scripts": {
    "screenshot:home": "node ./scripts/run-home-screenshot.mjs"
  }
}
```

## Files

Copy `files/scripts/run-home-screenshot.mjs` to `scripts/run-home-screenshot.mjs`.

Before committing, adapt these defaults in the script or document environment overrides:

- `SCREENSHOT_URL`
- `SCREENSHOT_OUTPUT_PATH`
- `SCREENSHOT_SERVER_COMMAND`
- `SCREENSHOT_SERVER_READY_URL`
