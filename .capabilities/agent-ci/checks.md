# Checks

Run these after applying the Agent CI kit to a target repo.

## Required

```bash
npm install
npm run ci:local
```

## Sanity Checks

```bash
git diff --check
npm exec -- agent-ci run --help
```

## Expected Results

- `package.json` has `@redwoodjs/agent-ci` in `devDependencies`.
- `package.json` has `ci:local` and `ci:local:retry` scripts.
- A GitHub Actions workflow exists, or the user explicitly declined optional workflow setup.
- `.env.agent-ci.example` exists and does not contain secrets.
- `.codex/skills/agent-ci/SKILL.md` exists when the target repo uses Codex skills.
- `npm run ci:local` runs the target GitHub Actions workflow locally.

If Agent CI cannot infer the repository from `origin`, set `GITHUB_REPO=owner/repo` in local `.env.agent-ci`.
If Agent CI cannot reach Docker, start the local Docker runtime or set `AGENT_CI_DOCKER_HOST` in local `.env.agent-ci`.
