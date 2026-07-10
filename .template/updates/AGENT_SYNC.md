# Sync From vibe-template

Use this file when a user says something like:

> Look at vibe-template for latest updates.

The goal is to sync relevant reusable maintenance changes from `vibe-template`
into the current target repository without copying unrelated starter files.

## Inputs

- **Target repo:** the repository you are currently editing.
- **Template repo:** a local checkout or remote source for `vibe-template`.
- **Update root:** `vibe-template/.template/updates/`.

If the template repo path is not obvious, ask for it. If network access or clone
access is needed, request approval before fetching anything.

## Workflow

1. Inspect the target repo first:
   - package manager and lockfile
   - `package.json` scripts and dependencies
   - `.github/workflows/`
   - existing `.capabilities/`
   - existing `.template/updates/`
   - docs or package metadata recording applied template updates
2. Read `vibe-template/.template/updates/README.md`.
3. List update packs under `vibe-template/.template/updates/*/update.json`.
4. Determine which packs are already applied:
   - prefer an explicit `vibeTemplate.updates` record in package metadata
   - otherwise inspect docs for applied update IDs
   - otherwise infer from files and scripts, and say that it is an inference
5. Present a short plan before editing:
   - recommended update IDs
   - skipped update IDs and why
   - expected files touched
   - checks to run
6. For each approved update:
   - read its `update.json`
   - read its `README.md`
   - inspect `patch.diff`
   - try `git apply --check path/to/patch.diff`
   - apply clean patches
   - manually port diverged patches using the README
   - preserve target-project conventions unless the update explicitly requires a change
7. Record applied update IDs in the target repo:

   ```json
   {
     "vibeTemplate": {
       "updates": ["2026-06-14-agent-ci-warm-cache"]
     }
   }
   ```

   Use a docs record instead when package metadata is not appropriate.

8. Run the checks listed by the applied update packs, adjusted to the target
   repo's package manager and script names.
9. Summarize:
   - updates applied
   - updates skipped
   - files changed
   - checks run
   - any manual ports or residual risks

## Rules

- Do not copy the whole template into the target repo.
- Do not overwrite target-project product code, docs, or workflow conventions.
- Do not apply optional adjacent setup without explicit user approval.
- Do not mark an update applied unless its behavior is actually present.
- Do not hide failed patch application; explain the manual port.
- Do not add generated reports, local caches, secrets, or machine-local files.

## Useful Commands

```bash
find /path/to/vibe-template/.template/updates -maxdepth 2 -name update.json
git apply --check /path/to/vibe-template/.template/updates/<id>/patch.diff
git apply /path/to/vibe-template/.template/updates/<id>/patch.diff
```
