# Refresh Core Tooling

Use this update to refresh compatible formatter, linter, test, CSS, Workers,
state-machine, and performance tooling without mixing in major application
dependency migrations.

## Apply

1. Update compatible pinned tool versions together and regenerate the lockfile.
2. Regenerate Wrangler's checked-in Worker types.
3. Run the updated formatter once and review its mechanical output.
4. Pin a patched transitive dependency with an npm override only when its
   direct owner cannot yet accept the fixed release.
5. Keep platform baseline type packages on their supported major line.

## Fallback

Apply tools individually if a downstream project has custom plugins or relies
on formatter output stability. Omit the `typed-rest-client` override when the
dependency is absent or has adopted a patched `qs` release.

## Verify

- `npm audit`
- `npm run quality:gate:fast`
- Confirm generated Worker types are current.
