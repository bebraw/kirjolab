# Add Advisory Fallow Codebase Diagnostics

Use this when a downstream project wants deterministic readability,
complexity, duplication, dependency-hygiene, and cleanup diagnostics without
making those findings part of the hard quality gate.

## Apply

1. Add `fallow` as a pinned development dependency.
2. Add advisory scripts equivalent to:
   - `diagnostics:readability`: `fallow audit --max-crap 100 --quiet --no-cache`
   - `diagnostics:health`: `fallow health --score --hotspots --targets --quiet --no-cache`
   - `diagnostics:codebase`: run both diagnostics.
3. Add `.fallowrc.json` only for project-specific entry points or false
   positives.
4. Ignore `.fallow/` if contributors may run cached Fallow commands manually.
5. Document that the diagnostics are advisory and do not replace the project's
   baseline quality gate.

## Fallback

If the target project already has a code intelligence tool, keep Fallow out of
the gate and run it manually for a few changes before deciding whether it adds
enough signal. Preserve the target project's existing readiness baseline.

## Verify

- `npm run diagnostics:readability`
- `npm run diagnostics:health`
- The target project's normal quality gate
