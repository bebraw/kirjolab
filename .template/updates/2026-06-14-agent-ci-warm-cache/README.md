# Use Agent CI Warm-Cache Serialization

Use this when a project already has Agent CI local workflow support and still
carries a repo-local install lock or `--jobs 1` workaround for old warm
`node_modules` races.

## Apply

1. Update `@redwoodjs/agent-ci` to at least `0.16.2`.
2. Keep the local script on `agent-ci run --quiet --pause-on-failure --workflow
.github/workflows/ci.yml`.
3. Replace workflow install-wrapper calls with plain `npm ci`.
4. Delete the repo-local install wrapper if it only serialized local Agent CI
   installs.
5. Update docs/specs to say Agent CI owns warm-cache serialization.

## Fallback

If the target project has custom install behavior, keep that behavior only when
it is still needed outside Agent CI. Remove Agent CI-specific lock files and
ready markers.

## Verify

- `npm run quality:gate`
- `npm run ci:local`
