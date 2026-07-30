# Relax the npm Version Hint

Use this update when `package.json#packageManager` accidentally pins one npm 11
patch while the repository's supported contract is the npm 11 major.

## Apply

1. Set `packageManager` to `npm@11`.
2. Keep `engines.npm` at `>=11 <12` and retain npm as the package-manager name
   in `devEngines`.
3. Remove documentation or CI steps that require one npm patch or self-upgrade
   npm during setup.
4. Regenerate lock metadata only if the target package manager changes it.

## Fallback

If the target runtime requires an exact `packageManager` version for Corepack,
document that constraint and do not claim compatibility with arbitrary npm 11
patches. Prefer the major-only hint when the field is informational.

## Verify

- `npm install --package-lock-only --ignore-scripts`
- `npm run format:check`
