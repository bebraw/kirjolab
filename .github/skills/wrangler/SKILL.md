---
name: wrangler
description: Use the repo-pinned Wrangler CLI for Worker development, configuration, deployment, and resource operations. Load before running or changing Wrangler commands or config.
---

# Wrangler

Use Wrangler through this repository's pinned dependency and existing npm scripts. Do not install or upgrade Wrangler unless the user approves a dependency change.

## Before acting

1. Read `AGENTS.md`, `package.json`, and `wrangler.jsonc` plus the files affected by the command.
2. Resolve version-sensitive syntax from the connected Cloudflare documentation, the installed Wrangler help, or `node_modules/wrangler/config-schema.json`. Prefer project-pinned behavior over examples for another release.
3. Distinguish local inspection from account mutations. Deployments, deletions, remote migrations, secret changes, and managed-resource changes require the user's requested scope and normal authorization.

## Project rules

- Reuse `npm run dev` and `npm run deploy` when they express the requested workflow.
- Keep non-secret configuration in the existing `wrangler.jsonc`; never replace it with a generic sample.
- After binding changes, regenerate or check types with the installed Wrangler version and run the repository typecheck.
- Treat `compatibility_date`, flags, environments, and local-versus-remote bindings as deliberate project choices. Verify current semantics before changing them.
- Never place secret values in command arguments, logs, source, or committed config. Prefer Wrangler's interactive secret input or an approved file/CI source.
- Resolve unfamiliar subcommands with `npx wrangler <command> --help` or current primary documentation instead of relying on a static command catalog.

## Verification

Use dry-run or read-only inspection when it proves the change without mutation. After config edits, run the narrow relevant checks followed by the repository-required quality gate. Report the exact environment or remote resource affected by any completed operation.
