# Align the Playwright 1.62 CI Image

Use this when updating `@playwright/test` to 1.62.1 in a project whose CI
browser job runs in the official Playwright container.

## Apply

1. Pin `@playwright/test` to `1.62.1` and regenerate the package lock.
2. Change the browser job image to
   `mcr.microsoft.com/playwright:v1.62.1-noble`.
3. Keep the package and container versions exactly aligned; mismatched versions
   use different browser executable revisions.
4. Install the matching local Chromium build before local browser verification.

## Fallback

If the target project installs browsers during CI instead of using the official
container, keep its existing installation strategy and update that install step
alongside `@playwright/test`.

## Verify

- The target project's browser installation script
- `npm run e2e`
- The target project's normal quality gate
