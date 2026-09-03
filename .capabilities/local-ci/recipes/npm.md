# npm Recipe

Apply this recipe when the target repo uses npm and has a committed `package-lock.json`.

If the target repo has no GitHub Actions workflow, follow `github-actions.md` before finalizing the Local CI script because `ci:local` needs a workflow file to run.

## Package Changes

Add the dev dependency:

```bash
npm install --save-dev --save-exact run-local-ci@0.18.1
```

Add or merge these scripts into `package.json`:

```json
{
  "scripts": {
    "ci:local": "local-ci run --quiet --json --pause-on-failure --workflow .github/workflows/ci.yml --prewarm-through .github/workflows/ci.yml:quality-fast:install",
    "ci:local:retry": "local-ci retry"
  }
}
```

If the target repo uses a workflow path other than `.github/workflows/ci.yml`, adjust the `--workflow` value instead of renaming the workflow.

Give the selected install step a stable `id`:

```yaml
- name: Install dependencies
  id: install
  run: npm ci
```

Adjust the `--prewarm-through` workflow path and job identifier when the target repo uses different names.

## Files

Copy:

- `files/.env.local-ci.example` to `.env.local-ci.example`
- `files/.codex/skills/local-ci/SKILL.md` to `.codex/skills/local-ci/SKILL.md`

Merge with existing files when the target repo already has local env examples or Codex skills.

## Documentation

Document these target-project expectations wherever the repo keeps developer setup notes:

- Docker must be running before `npm run ci:local`.
- `npm run ci:local` is the local GitHub Actions check.
- The local command emits Local CI's structured NDJSON lifecycle stream so agents can track run, job, step, pause, and completion state.
- Local CI isolates each parallel job's writable `node_modules` view while retaining its managed warm cache.
- The explicit prewarm selector populates the dependency tree once before parallel jobs copy their private views.
- `npm run ci:local:retry -- --name <runner-name>` resumes a paused Local CI runner.
- `.env.local-ci` is local-only and may contain machine-specific Docker or repository overrides.
