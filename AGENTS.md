> **Project:** `vibe-template` is a lightweight starter for AI-assisted experiments and small software projects. Keep setup reusable, easy to clone, and easy to prune.
>
> **Platform Baseline:** Local development and local CI in this repo target macOS. Treat other platforms as out of scope unless the user explicitly asks to broaden support.
>
> **Context Anchor:** ASDLC reference material is vendored in `.asdlc/SKILL.md`. Use it as the entry point for architecture, process, and methodology guidance.

## Toolchain Registry

| Intent         | Command                                          | Notes                                                                           |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Local CI       | `npm run ci:local`                               | Quietly runs `.github/workflows/ci.yml` through Agent CI with local parallelism |
| Retry CI       | `npm run ci:local:retry -- --name <runner-name>` | Retries a paused local Agent CI runner                                          |
| Workflow notes | `docs/development.md`                            | Setup details and prerequisites                                                 |

## Judgment Boundaries

**NEVER**

- Invent tooling or project structure that is not present in the repo.
- Replace lightweight setup with heavyweight scaffolding without discussion.
- Delete or overwrite user-authored files without checking impact first.
- Commit secrets, tokens, or local env files such as `.dev.vars`.

**ASK**

- Before adding dependencies, CI, or generated boilerplate.
- Before making irreversible structural changes.
- Before adding new lasting write targets such as generated output directories, local state files, caches, archives, or persisted tool artifacts.

**ALWAYS**

- Consult `.asdlc/SKILL.md` before giving ASDLC-specific guidance.
- Prefer small, reviewable changes that preserve the template nature of the repo.
- Document reusable conventions instead of one-off preferences.
- Add or update a template update pack in `.template/updates/` when a reusable template maintenance change should be portable to downstream projects.
- Treat every lasting architectural decision as explicit documentation work, not implied context.
- Add or update an ADR in `docs/adrs/` in the same change set whenever a decision introduces or changes a lasting architectural constraint, selects between credible alternatives, or supersedes an earlier architecture decision. Keep drafts in `docs/adrs/proposed/`, approved-but-not-yet-implemented decisions in `docs/adrs/accepted/`, and implemented decisions in `docs/adrs/implemented/`.
- Record global architecture rules in `ARCHITECTURE.md` and feature-level contracts in `specs/{feature-domain}/spec.md`.
- Treat completed feature work as spec work: create a new `specs/{feature-domain}/spec.md` or update the relevant existing spec in the same change set whenever feature behavior, contracts, workflows, or quality guardrails change.
- Prefer the local Agent CI workflow before relying on remote CI.
- Treat a non-documentation change as ready only after the quality gate and local CI both pass.
- Treat `package.json` as the source of truth for pinned Node and npm versions, with `.nvmrc` kept in sync as a convenience mirror for `nvm use`.
- Read the relevant library or tool documentation carefully before applying, upgrading, or reconfiguring it in the project, especially when behavior is version-sensitive.
- Use `npm run quality:gate:fast` for quick local iteration, `npm run quality:gate` for the full baseline gate, and `npm run ci:local` for the local workflow check.
- Use `npm run quality:affected` for affected-file guardrails while iterating or before push when a full fast gate would do avoidable work.
- Treat `npm run typecheck` as part of the baseline gate whenever TypeScript files or typed tooling config are involved.
- Treat high automated test coverage as part of done work for `src/` code. The baseline gate should fail when `src/` code exists without matching unit coverage.
- Keep new workflow write targets explicit and documented instead of adding ad hoc file writes.
- Use targeted checks while iterating, then run `npm run quality:gate` and `npm run ci:local` before treating a non-documentation change as ready.
- For documentation-only changes that do not alter executable config, generated artifacts, package metadata, source code, or tests, skip `npm run ci:local` and use the smallest relevant local checks such as `npm run format:check`.

## TypeScript

- Use TypeScript strict mode.
- Do not introduce `any` unless justified with a comment.
- Prefer explicit domain types over inferred object blobs, especially at module, API, fixture, and workflow boundaries.
- Do not silence errors with `as unknown as`, `@ts-ignore`, or broad casts. Use local guards, narrower interfaces, or small helper types instead.

## Agent CI

- Use the project-local [`agent-ci`](./.codex/skills/agent-ci/SKILL.md) skill when testing, running checks, or validating code changes before pushing.
- Treat the skill as the default local CI loop for this repo before relying on remote GitHub Actions.
- Skip Agent CI for documentation-only changes that do not alter executable behavior or workflow configuration.

## Frontend Design

- Use the project-local [`frontend-design`](./.codex/skills/frontend-design/SKILL.md) skill for substantial UI work such as page redesigns, component styling, app shells, and frontend experiments.
- Treat the skill as guidance for producing distinctive frontend work without compromising the template's lightweight and reusable nature unless the user explicitly asks for a more opinionated direction.

## Brainstorming

- Use the project-local [`brainstorming`](./.codex/skills/brainstorming/SKILL.md) skill when the user is exploring options, shaping a feature, or comparing approaches before implementation.
- Treat the skill as guidance for producing concrete, lightweight options that can turn cleanly into specs, ADRs, or code.

## Review

- Use the project-local [`review`](./.codex/skills/review/SKILL.md) skill when the user asks for review, risk analysis, or a merge-readiness pass.
- Treat the skill as guidance for prioritizing bugs, regressions, and quality-gate gaps over style commentary.

## Security

- Use the project-local [`security`](./.codex/skills/security/SKILL.md) skill when the user is working on auth, secrets, access control, sensitive data handling, or security hardening.
- Treat the skill as guidance for prioritizing concrete security risks and proportionate mitigations over generic checklists.

## Simplify

- Use the project-local [`simplify`](./.codex/skills/simplify/SKILL.md) skill after implementation when the user wants code simplified without changing behavior.
- Treat the skill as guidance for reducing naming, state, and conceptual overhead inside the requested scope.
