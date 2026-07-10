# TypeScript Setup Capability Kit

Use this kit to add the template's strict no-emit TypeScript setup to another npm project without pulling in the full quality gate.

## Adds

- Pinned `typescript` and `@types/node` dev dependencies.
- A `typecheck` script that runs `tsc --noEmit`.
- A strict `tsconfig.json` for ES module projects with source under `src/` and root-level TypeScript config files.
- Optional CSS import declaration support when TypeScript imports stylesheet assets.

## Good Fit

- The target repo uses npm and wants strict TypeScript checking.
- Source files live under `src/`, or the include globs can be adapted.
- The repo uses Node-backed tooling, browser APIs, or a bundler-compatible module resolver.

## Poor Fit

- The repo already has a mature TypeScript setup that should not be replaced.
- The repo is intentionally JavaScript-only and does not want TypeScript checking.
- The repo targets a non-ES module runtime or a TypeScript framework with its own generated config.

## Apply

1. Read `manifest.json`.
2. Follow `recipes/npm.md`.
3. Copy or merge `files/tsconfig.json` into `tsconfig.json`.
4. If the target repo imports `.css` files from TypeScript, copy or merge `files/src/css.d.ts` into an appropriate declaration file.
5. Run the checks in `checks.md`.
