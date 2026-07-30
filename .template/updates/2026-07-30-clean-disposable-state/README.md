# Clean Disposable Local State Safely

Use this update when ignored mutation sandboxes, development bundles, logs, and
reports accumulate without a reviewed cleanup boundary.

## Apply

1. Add a Node cleanup script with explicit repository-relative targets.
2. Reject target roots that are symbolic links and verify resolved paths stay
   below the project root.
3. Preserve Wrangler application state, generated media, and unknown ignored
   paths.
4. Add focused tests before exposing the cleanup through a package script.
5. Document both removed and preserved targets.

## Fallback

Adapt the allowlist to the target project's documented write boundaries. Do not
copy a target merely because both repositories ignore a similarly named path.

## Verify

- `node --test scripts/clean-local-state.test.mjs`
- `npm run maintenance:clean`
- Confirm valuable local state still exists after cleanup.
