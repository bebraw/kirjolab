# Agent CI Capability Kit

Use this kit to add the repo's local GitHub Actions workflow loop to another project without cloning the whole template.

## Adds

- A pinned `@redwoodjs/agent-ci` dev dependency.
- Canonical local CI scripts for running and retrying Agent CI.
- A local `.env.agent-ci.example` for machine-specific overrides.
- A Codex skill that teaches agents how to use Agent CI in the target repo.
- Optional GitHub Actions setup guidance when the target repo has no workflow yet.

## Good Fit

- The target repo already has at least one GitHub Actions workflow, or the user wants the kit to add one.
- The target repo wants local CI parity before pushing.
- Docker is available on the developer machine.
- The repo can tolerate local CI being a developer workflow rather than a production runtime dependency.

## Poor Fit

- The repo does not use GitHub Actions and the user does not want to add it.
- The repo cannot run Docker locally.
- The repo already has a different local workflow emulator with a documented support contract.

## Apply

1. Read `manifest.json` for the expected files, scripts, dependency, and checks.
2. Check whether the target repo already has `.github/workflows/*.yml` or `.github/workflows/*.yaml`.
3. If no workflow exists, ask the user before adding one:
   `This repo has no GitHub Actions workflow for Agent CI to run. Do you want me to add a minimal npm CI workflow as part of this upgrade?`
4. If the user approves, follow `recipes/github-actions.md`.
5. Follow `recipes/npm.md` for npm projects.
6. Copy files from `files/` into the same relative paths in the target repo.
7. Merge scripts and docs instead of overwriting target-project conventions.
8. Run the checks in `checks.md`.

For pnpm or Yarn projects, keep the same Agent CI concepts but translate dependency and script commands to the target package manager.
