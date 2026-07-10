# Optional Playwright Recipe

Use this recipe only after the user approves adding a browser gate.

## Package Changes

```bash
npm install --save-dev @playwright/test@1.59.1
```

Add or merge:

```json
{
  "scripts": {
    "e2e": "playwright test --pass-with-no-tests",
    "quality:gate": "npm run quality:gate:fast && npm run e2e"
  }
}
```

Copy or merge `files/playwright.config.ts` into `playwright.config.ts`.

Before committing, adapt the config to the target repo:

- update `testMatch` if e2e tests do not live under `src/**/*.e2e.ts`
- update `baseURL` and `webServer.url`
- update `webServer.command` to start the target app
- remove `webServer` if the target tests manage their own server
