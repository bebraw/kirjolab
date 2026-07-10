# Align the Playwright 1.61 CI Image

Use this when updating `@playwright/test` to 1.61.1 in a project whose CI
browser job runs in the official Playwright container.

## Apply

1. Pin `@playwright/test` to `1.61.1`.
2. Regenerate the package lock with the target project's package manager.
3. Change the browser job image to
   `mcr.microsoft.com/playwright:v1.61.1-noble`.
4. Keep the package and container versions exactly aligned; mismatched versions
   use different browser executable revisions.

## Fallback

If the target project installs browsers during CI instead of using the official
container, keep its existing installation strategy and update the install step
alongside `@playwright/test`.

## Verify

- The target project's browser tests
- The target project's normal quality gate
- The target project's local CI workflow
