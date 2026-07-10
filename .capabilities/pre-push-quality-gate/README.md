# Pre-Push Quality Gate Capability Kit

Use this kit to add a repo-managed Git `pre-push` hook that runs the target repo's fast quality gate before code leaves the machine.

## Adds

- `scripts/setup-git-hooks.mjs`
- `.githooks/pre-push`
- A `prepare` script that configures `core.hooksPath`

## Good Fit

- The target repo has `npm run quality:gate:fast`.
- Contributors install dependencies with npm before pushing.
- The repo wants cheap deterministic failures caught locally.

## Poor Fit

- The target repo already has a different hook manager such as Husky or lefthook.
- The target repo does not want Git hooks to be configured during install.
- The target repo has no fast quality gate.

## Apply

1. Confirm the target repo has `npm run quality:gate:fast`, or apply the `quality-gate` kit first.
2. If another hook manager exists, ask before replacing or integrating with it.
3. Follow `recipes/npm.md`.
4. Copy files from `files/`.
5. Run the checks in `checks.md`.
