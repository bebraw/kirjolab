# Adopt The Node 24 And npm Baseline

Use this when a target project should align with the template's macOS-local,
Node 24, npm 11 baseline.

## Apply

1. Set `engines.node` to the target Node 24 patch version.
2. Set `engines.npm` to `>=11 <12`.
3. Keep `packageManager` on npm 11 without relying on one exact npm patch unless
   the target project has a stronger reason.
4. Mirror the Node version in `.nvmrc`.
5. Regenerate `package-lock.json` with npm.
6. Document npm as the supported package manager for local Agent CI workflows.

## Fallback

If the target project deploys to a platform that does not support Node 24 yet,
defer this update and record the platform constraint.

## Verify

- `npm install`
- `npm run quality:gate`
- `npm run ci:local`
