# Specs

This directory stores living feature specs using the ASDLC spec pattern.

Specs are the durable source of truth for how a feature works and how we verify it. Keep them close to the code and update them when behavior changes.

Passing CI is necessary but not sufficient. Hand-written and AI-generated code are both valid implementation inputs, but they still need to implement the committed spec and any relevant ADRs instead of silently redefining them.

Completed feature work should not leave its contracts implicit. If a change introduces or changes feature behavior, workflows, quality targets, or regression guardrails, create a new spec or update the existing one in the same change set.

Use a spec when work introduces:

- feature-level architecture or API contracts
- important quality rules or regression guardrails
- workflows that future contributors or agents need to preserve
- any completed feature domain that would otherwise leave its expected behavior implicit

Skip a spec for small fixes, trivial copy changes, or narrow tactical edits.

## Layout

- Global rules belong in [`ARCHITECTURE.md`](../ARCHITECTURE.md).
- Feature specs belong in `specs/{feature-domain}/spec.md`.
- Capability-kit contracts belong in `specs/capability-kits/spec.md`.
- Template update-pack contracts belong in `specs/template-updates/spec.md`.

## Starting Point

- Copy [`feature-template/spec.md`](./feature-template/spec.md) into a new feature directory.
- Rename the directory to match the feature domain in kebab-case.
- Update the spec whenever the feature's contracts, workflows, architecture, or quality guardrails change.
- Treat spec creation or update as part of done work for feature delivery, not a later documentation pass.

## Search Tips

```bash
rg "^# Feature:" specs
rg "^## Contract" specs
rg "Regression Guardrails|Anti-Patterns" specs
```
