# Record Template Source Provenance

Use this update when a project records applied `vibe-template` update IDs but
does not retain the verified template source and baseline revision that seeded
the project.

## Intent

Make later template syncs reproducible without adopting a project-start
workflow or assuming that a sibling directory with a familiar name is the
correct upstream repository.

The source identifies the actual template repository. The baseline is the full
Git revision whose tree seeded the target project. Applied update IDs remain a
separate record of reusable behaviors present after that baseline.

## Migration

1. Verify the repository relationship before recording provenance. Prefer an
   exact tree match between a candidate template revision and the target's
   initial revision, or another durable source record that proves the origin.
2. Add `vibeTemplate.source` and the full 40-character
   `vibeTemplate.baseline` beside the existing `vibeTemplate.updates` array in
   package metadata. Preserve every valid applied update ID.
3. Apply `patch.diff` to teach the update-pack README and agent sync entrypoint
   to discover and record all three fields.
4. Record the provenance rule in the target's architecture decision, global
   architecture guidance, and template-update feature contract when those
   durable records exist.
5. Run the listed checks and record this update only after the verified source
   and baseline are present.

Example package metadata:

```json
{
  "vibeTemplate": {
    "source": "https://github.com/example/vibe-template",
    "baseline": "<verified-full-git-revision>",
    "updates": ["2026-06-14-agent-ci-warm-cache"]
  }
}
```

Use the actual repository source rather than the example URL.

## Manual Adaptation

- If package metadata is not an appropriate durable record, store the same
  source, full baseline revision, and applied update IDs in project docs.
- If the source or baseline cannot be proven, leave it unresolved and ask for
  the missing provenance instead of guessing.
- A fork may be the actual source even when its history derives from
  `vibe-template`; record the repository that future sync work should inspect.
- The patch intentionally does not write package metadata because verified
  source and baseline values are target-specific.

## Checks

```bash
npm run format:check
npm run check:adrs
npm run ci:local
```
