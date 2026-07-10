---
name: agent-ci
description: Run GitHub Actions workflows locally with pause-on-failure for AI-agent-driven CI iteration.
keywords: [github-actions, local-ci, pause-on-failure, ai-agent, runner]
---

# Agent CI

## What agent-ci does

Runs the official GitHub Actions runner binary locally in Docker, emulating GitHub's cloud API.
Cache is bind-mounted. When a step fails, the container can pause so you can fix and retry the failed step without restarting the workflow.

## When to use agent-ci

- You want compatibility with remote GitHub Actions before pushing.
- You need pause-on-failure for an agent debugging loop.
- Cache round-trip speed matters.

## Project commands

Use the target repo's pinned `agent-ci` dependency through package scripts.

- Run the local workflow quietly: `npm run ci:local`
- Run all relevant workflows when needed: `./node_modules/.bin/agent-ci run --all`
- Run all workflows with pause-on-failure: `./node_modules/.bin/agent-ci run --all --pause-on-failure`
- Collapse matrix jobs for a smaller local run: `./node_modules/.bin/agent-ci run --all --no-matrix`
- Retry after a fix: `npm run ci:local:retry -- --name <runner>`
- Retry from a specific step: `npm run ci:local:retry -- --name <runner> --from-step <N>`
- Retry from the start: `npm run ci:local:retry -- --name <runner> --from-start`
- Abort a paused runner: `./node_modules/.bin/agent-ci abort --name <runner>`

## Common mistakes

- Do not push to remote CI to test changes when local Agent CI can run the workflow.
- Do not use `--from-start` when only the last step failed; use retry with no extra flags to re-run only the failed step.
- Use `AI_AGENT=1` or `--quiet` for cleaner agent logs.
- Prefer `--no-matrix` when matrix combinations are not the thing being tested.

Repeat the local run or retry loop until all jobs pass.
