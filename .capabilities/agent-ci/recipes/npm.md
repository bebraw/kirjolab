# npm Recipe

Apply this recipe when the target repo uses npm and has a committed `package-lock.json`.

If the target repo has no GitHub Actions workflow, follow `github-actions.md` before finalizing the Agent CI script because `ci:local` needs a workflow file to run.

## Package Changes

Add the dev dependency:

```bash
npm install --save-dev --save-exact @redwoodjs/agent-ci@0.17.1
```

Add or merge these scripts into `package.json`:

```json
{
  "scripts": {
    "ci:local": "agent-ci run --quiet --json --pause-on-failure --workflow .github/workflows/ci.yml --prewarm-through .github/workflows/ci.yml:quality-fast:install",
    "ci:local:retry": "agent-ci retry"
  }
}
```

If the target repo uses a workflow path other than `.github/workflows/ci.yml`, adjust the `--workflow` value instead of renaming the workflow.

Give the selected deterministic install step a stable `id` and adapt the
`--prewarm-through` selector when the workflow or job names differ. Agent CI
prewarms through that step once, then gives concurrent jobs isolated writable
dependency views.

## Files

Copy:

- `files/.env.agent-ci.example` to `.env.agent-ci.example`
- `files/.codex/skills/agent-ci/SKILL.md` to `.codex/skills/agent-ci/SKILL.md`

Merge with existing files when the target repo already has local env examples or Codex skills.

## Documentation

Document these target-project expectations wherever the repo keeps developer setup notes:

- Docker must be running before `npm run ci:local`.
- `npm run ci:local` is the local GitHub Actions check.
- `npm run ci:local:retry -- --name <runner-name>` resumes a paused Agent CI runner.
- `.env.agent-ci` is local-only and may contain machine-specific Docker or repository overrides.
