# Report Agent CI Progress

Use this update when `npm run ci:local` runs Agent CI quietly enough that slow
steps can look hung.

## Apply

1. Add `scripts/run-local-ci.mjs` from the patch.
2. Point `ci:local` at the wrapper while keeping quiet agent mode and the
   existing retry script.
3. Preserve the target project's workflow path, job limit, and
   pause-on-failure choice when they differ from this template.
4. Document the visible job/step boundaries and 15-second heartbeat.

The wrapper consumes Agent CI's versioned NDJSON events. Review the event schema
when upgrading Agent CI rather than parsing its human log output.

## Fallback

If the target has a custom local-CI launcher, port the event formatting and
heartbeat into that launcher. Keep its workflow, attached retry lifecycle, and
final exit-code behavior intact; do not split or duplicate checks merely to
produce more output.

## Verify

- `npm run quality:gate`
- `npm run ci:local`
- Confirm a long-running step prints a heartbeat within 15 seconds.
