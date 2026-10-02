# npm Recipe

Apply this recipe when the target repo uses npm.

## Package Changes

```bash
npm install --save-dev --save-exact @playwright/test@1.63.0 chrome-launcher@1.2.2 lighthouse@13.5.0
```

Add or merge:

```json
{
  "scripts": {
    "lighthouse": "node ./scripts/run-lighthouse.mjs"
  }
}
```

## Files

Copy `files/scripts/run-lighthouse.mjs` to `scripts/run-lighthouse.mjs`.

## Usage

Run against an already-running app:

```bash
LIGHTHOUSE_URL=http://127.0.0.1:3000 npm run lighthouse
```

Run with a local server command:

```bash
LIGHTHOUSE_URL=http://127.0.0.1:3000 LIGHTHOUSE_SERVER_COMMAND="npm run dev" npm run lighthouse
```
