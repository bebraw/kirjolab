# Checks

Run these after applying the Local CI kit to a target repo.

## Required

```bash
npm install
npm run ci:local
```

## Sanity Checks

```bash
git diff --check
npm exec -- local-ci --help
```

## Expected Results

- `package.json` has `run-local-ci` in `devDependencies`.
- `package.json` has `ci:local` and `ci:local:retry` scripts.
- `ci:local` combines `--quiet` and `--json` so agents receive structured lifecycle events without animated rendering.
- A GitHub Actions workflow exists, or the user explicitly declined optional workflow setup.
- `.env.local-ci.example` exists and does not contain secrets.
- `.codex/skills/local-ci/SKILL.md` exists when the target repo uses Codex skills.
- `npm run ci:local` runs the target GitHub Actions workflow locally.

If Local CI cannot infer the repository from `origin`, set `GITHUB_REPO=owner/repo` in local `.env.local-ci`.
If Local CI cannot reach Docker, start the local Docker runtime or set `LOCAL_CI_DOCKER_HOST` in local `.env.local-ci`.
